-- =====================================================================
-- Reflection Diary: MySQL schema (v2)
-- Alumable / La Trobe CSE3CAP Capstone, Semester 2 2026
--
-- Supersedes the PostgreSQL schema. AI tables (ai_suggestions,
-- entry_embeddings, level_embeddings) removed per scope change.
--
-- Requires MySQL 8.0.19+ (expression defaults, enforced CHECK
-- constraints, VALUES row constructors). Deployed on 9.7 LTS; the
-- floor is kept accurate so the DDL stays portable.
--
-- MySQL-specific decisions, explained inline:
--   * ids are CHAR(36) UUIDs, not BINARY(16). Readable in queries,
--     matches Laravel/Eloquent's default UUID handling, and the
--     storage difference is irrelevant at MVP scale.
--   * DATETIME(6) everywhere, never TIMESTAMP. MySQL TIMESTAMP caps
--     at 2038-01-19, which a "lifelong record" outlives. All values
--     stored as UTC by application convention.
--   * MySQL has no UNIQUE NULLS NOT DISTINCT. The one-reflection-per-
--     context rule is enforced with generated key columns that
--     coalesce NULL to a sentinel UUID (see reflections).
--   * JSON replaces jsonb and text[].
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. Integration seam: mirrors of host-platform entities
-- ---------------------------------------------------------------------

CREATE TABLE users (
    id            CHAR(36)  NOT NULL DEFAULT (UUID()),
    external_ref  VARCHAR(191) NULL,            -- host platform user id
    display_name  VARCHAR(191) NOT NULL,
    created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY ak_users_external_ref (external_ref)   -- NULLs allowed, unique when set
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE gigs (
    id            CHAR(36)  NOT NULL DEFAULT (UUID()),
    external_ref  VARCHAR(191) NULL,            -- host platform gig id
    title         VARCHAR(255) NOT NULL,
    org_name      VARCHAR(255) NULL,
    starts_on     DATE NULL,
    ends_on       DATE NULL,
    created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY ak_gigs_external_ref (external_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sprints (
    id        CHAR(36) NOT NULL DEFAULT (UUID()),
    gig_id    CHAR(36) NOT NULL,
    ordinal   INT NOT NULL,
    opens_on  DATE NULL,
    due_on    DATE NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ak_sprints_gig_ordinal (gig_id, ordinal),
    CONSTRAINT fk_sprints_gig FOREIGN KEY (gig_id)
        REFERENCES gigs (id) ON DELETE CASCADE,
    CONSTRAINT ck_sprints_ordinal CHECK (ordinal > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Role is per gig, not global: the same person can be a student on one
-- gig and an assessor on another. RBAC checks resolve here.
CREATE TABLE gig_participants (
    id       CHAR(36) NOT NULL DEFAULT (UUID()),
    gig_id   CHAR(36) NOT NULL,
    user_id  CHAR(36) NOT NULL,
    role     VARCHAR(20) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ak_participants (gig_id, user_id, role),
    KEY ix_participants_user (user_id),
    CONSTRAINT fk_gp_gig  FOREIGN KEY (gig_id)  REFERENCES gigs (id)  ON DELETE CASCADE,
    CONSTRAINT fk_gp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_gp_role CHECK (role IN ('student','assessor','supervisor','employer'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. Framework engine: the rubric as data, not code
-- ---------------------------------------------------------------------

CREATE TABLE frameworks (
    id                  CHAR(36) NOT NULL DEFAULT (UUID()),
    created_by          CHAR(36) NULL,
    fw_key              VARCHAR(64)  NOT NULL,   -- 'key' is reserved-ish; renamed
    version             VARCHAR(32)  NOT NULL,
    name                VARCHAR(191) NOT NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    comment_required    TINYINT(1) NOT NULL DEFAULT 1,
    evidence_required   TINYINT(1) NOT NULL DEFAULT 0,
    accepted_file_types JSON NULL,               -- was text[]
    max_file_bytes      BIGINT NOT NULL DEFAULT 10485760,   -- 10 MB
    PRIMARY KEY (id),
    UNIQUE KEY ak_frameworks (fw_key, version),
    CONSTRAINT fk_fw_creator FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE competencies (
    id            CHAR(36) NOT NULL DEFAULT (UUID()),
    framework_id  CHAR(36) NOT NULL,
    code          VARCHAR(64)  NOT NULL,
    name          VARCHAR(191) NOT NULL,
    category      VARCHAR(191) NULL,             -- SFIA grouping; NULL for La Trobe
    position      INT NOT NULL DEFAULT 0,
    short_label   VARCHAR(32) NULL,              -- radar axis label
    PRIMARY KEY (id),
    UNIQUE KEY ak_competencies (framework_id, code),
    CONSTRAINT fk_comp_fw FOREIGN KEY (framework_id)
        REFERENCES frameworks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Only the levels a competency actually spans are inserted. A SFIA
-- skill valid at 3-5 gets three rows, not seven.
CREATE TABLE levels (
    id             CHAR(36) NOT NULL DEFAULT (UUID()),
    competency_id  CHAR(36) NOT NULL,
    level_value    INT NOT NULL,
    descriptor     TEXT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ak_levels (competency_id, level_value),
    CONSTRAINT fk_levels_comp FOREIGN KEY (competency_id)
        REFERENCES competencies (id) ON DELETE CASCADE,
    CONSTRAINT ck_levels_value CHECK (level_value > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE framework_assignments (
    id            CHAR(36) NOT NULL DEFAULT (UUID()),
    framework_id  CHAR(36) NOT NULL,
    gig_id        CHAR(36) NOT NULL,
    assigned_by   CHAR(36) NULL,
    assigned_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    -- One rubric per gig, not one row per pair. On (gig_id, framework_id)
    -- this stopped the same rubric being assigned twice and let a second,
    -- different one through, which is the case that actually hurts: every
    -- reflection snapshots the gig's framework, so two would score two
    -- students on one gig against different rubrics. See ADR #35.
    UNIQUE KEY ak_fw_assignments (gig_id),
    CONSTRAINT fk_fa_fw   FOREIGN KEY (framework_id) REFERENCES frameworks (id),
    CONSTRAINT fk_fa_gig  FOREIGN KEY (gig_id)       REFERENCES gigs (id) ON DELETE CASCADE,
    CONSTRAINT fk_fa_user FOREIGN KEY (assigned_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 3. The record: owned by the student, outlives the gig
-- ---------------------------------------------------------------------

-- gig_key / sprint_key are MySQL's substitute for Postgres's
-- UNIQUE NULLS NOT DISTINCT: NULL context ids are coalesced to a
-- sentinel UUID so the unique index treats "no sprint" as one value.
-- Without this, a student could create unlimited gig-level reflections
-- on the same gig, because MySQL treats every NULL as distinct.
--
-- They are VIRTUAL rather than STORED because InnoDB refuses a stored
-- generated column whose source carries a SET NULL referential action,
-- and sprint_id has one. A unique index over a virtual column is still
-- materialised, so the guarantee is identical either way.
CREATE TABLE reflections (
    id                 CHAR(36) NOT NULL DEFAULT (UUID()),
    user_id            CHAR(36) NOT NULL,
    sprint_id          CHAR(36) NULL,
    gig_id             CHAR(36) NULL,
    framework_id       CHAR(36) NOT NULL,
    framework_version  VARCHAR(32) NOT NULL,     -- snapshot, set once
    status             VARCHAR(20) NOT NULL DEFAULT 'draft',
    submitted_at       DATETIME(6) NULL,
    created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                       ON UPDATE CURRENT_TIMESTAMP(6),
    gig_key    CHAR(36) GENERATED ALWAYS AS
               (COALESCE(gig_id,    '00000000-0000-0000-0000-000000000000')) VIRTUAL,
    sprint_key CHAR(36) GENERATED ALWAYS AS
               (COALESCE(sprint_id, '00000000-0000-0000-0000-000000000000')) VIRTUAL,
    PRIMARY KEY (id),
    UNIQUE KEY ak_reflections_context (user_id, gig_key, sprint_key),
    KEY ix_reflections_user   (user_id),
    KEY ix_reflections_status (status),
    KEY ix_reflections_gig    (gig_id),
    KEY ix_reflections_sprint (sprint_id),
    -- RESTRICT is the point: deleting a gig or user must not destroy
    -- the record. "Student-owned" enforced by constraint, not policy.
    CONSTRAINT fk_refl_user   FOREIGN KEY (user_id)      REFERENCES users (id)      ON DELETE RESTRICT,
    CONSTRAINT fk_refl_gig    FOREIGN KEY (gig_id)       REFERENCES gigs (id)       ON DELETE RESTRICT,
    CONSTRAINT fk_refl_sprint FOREIGN KEY (sprint_id)    REFERENCES sprints (id)    ON DELETE SET NULL,
    CONSTRAINT fk_refl_fw     FOREIGN KEY (framework_id) REFERENCES frameworks (id),
    CONSTRAINT ck_refl_status  CHECK (status IN ('draft','submitted','assessed')),
    -- Phrased over the generated keys, not over sprint_id and gig_id
    -- directly. MySQL rejects a CHECK on a column that carries a
    -- SET NULL referential action (error 3823), and sprint_id does.
    -- The two forms are equivalent: a key equals the sentinel exactly
    -- when its source id is NULL.
    CONSTRAINT ck_refl_context CHECK (
        gig_key    <> '00000000-0000-0000-0000-000000000000'
     OR sprint_key <> '00000000-0000-0000-0000-000000000000')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reflection_entries (
    id             CHAR(36) NOT NULL DEFAULT (UUID()),
    reflection_id  CHAR(36) NOT NULL,
    competency_id  CHAR(36) NOT NULL,
    narrative      TEXT NULL,
    created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                   ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY ak_entries (reflection_id, competency_id),
    KEY ix_entries_competency (competency_id),
    CONSTRAINT fk_re_refl FOREIGN KEY (reflection_id)
        REFERENCES reflections (id) ON DELETE CASCADE,
    CONSTRAINT fk_re_comp FOREIGN KEY (competency_id)
        REFERENCES competencies (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per (entry, scorer, role). Self and assessor are both rows
-- here; the radar is one query grouped by scorer_role.
-- Known limitation (service-layer check): level_id must belong to the
-- entry's competency. Enforced in the app, documented in the ADRs.
CREATE TABLE scores (
    id                   CHAR(36) NOT NULL DEFAULT (UUID()),
    reflection_entry_id  CHAR(36) NOT NULL,
    scorer_user_id       CHAR(36) NOT NULL,
    scorer_role          VARCHAR(20) NOT NULL,
    level_id             CHAR(36) NOT NULL,
    comment              TEXT NULL,
    scored_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY ak_scores (reflection_entry_id, scorer_user_id, scorer_role),
    KEY ix_scores_role  (scorer_role),
    KEY ix_scores_level (level_id),
    CONSTRAINT fk_sc_entry  FOREIGN KEY (reflection_entry_id)
        REFERENCES reflection_entries (id) ON DELETE CASCADE,
    CONSTRAINT fk_sc_scorer FOREIGN KEY (scorer_user_id)
        REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_sc_level  FOREIGN KEY (level_id)
        REFERENCES levels (id) ON DELETE RESTRICT,
    CONSTRAINT ck_sc_role CHECK (scorer_role IN ('self','assessor','supervisor','employer'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE evidence (
    id                   CHAR(36) NOT NULL DEFAULT (UUID()),
    reflection_entry_id  CHAR(36) NOT NULL,
    kind                 VARCHAR(20)  NOT NULL,
    label                VARCHAR(255) NOT NULL,
    uri                  TEXT NOT NULL,
    size_bytes           BIGINT NULL,
    uploaded_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_evidence_entry (reflection_entry_id),
    CONSTRAINT fk_ev_entry FOREIGN KEY (reflection_entry_id)
        REFERENCES reflection_entries (id) ON DELETE CASCADE,
    CONSTRAINT ck_ev_kind CHECK (kind IN ('file','link','image'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only log. Powers the History sheet; notifications are derived
-- from here rather than stored separately.
CREATE TABLE events (
    id             CHAR(36) NOT NULL DEFAULT (UUID()),
    reflection_id  CHAR(36) NULL,
    actor_user_id  CHAR(36) NULL,
    event_type     VARCHAR(64) NOT NULL,
    metadata       JSON NOT NULL,
    occurred_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_events_reflection (reflection_id, occurred_at DESC),
    CONSTRAINT fk_evt_refl  FOREIGN KEY (reflection_id)
        REFERENCES reflections (id) ON DELETE CASCADE,
    CONSTRAINT fk_evt_actor FOREIGN KEY (actor_user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit trail for the exportable-record must-have. This row is also the
-- queued job's record, which is why status is stored rather than derived
-- from completed_at: a job that fails has no completion time and no
-- error either way, so the frontend's poll loop would never terminate.
CREATE TABLE exports (
    id             CHAR(36) NOT NULL DEFAULT (UUID()),
    user_id        CHAR(36) NOT NULL,
    reflection_id  CHAR(36) NULL,            -- NULL = whole record
    format         VARCHAR(10) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending',
    uri            TEXT NULL,
    summary        JSON NULL,
    requested_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at   DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY ix_exports_user (user_id),
    CONSTRAINT fk_ex_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_ex_refl FOREIGN KEY (reflection_id)
        REFERENCES reflections (id) ON DELETE SET NULL,
    CONSTRAINT ck_ex_format CHECK (format IN ('pdf','json')),
    CONSTRAINT ck_ex_status CHECK (status IN ('pending','complete','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 4. Views the analytics layer serves from
-- ---------------------------------------------------------------------

-- Radar scale per framework, computed from the level rows since
-- scale bounds no longer live on frameworks.
CREATE VIEW v_framework_scale AS
SELECT c.framework_id,
       MIN(l.level_value) AS scale_min,
       MAX(l.level_value) AS scale_max
FROM competencies c
JOIN levels l ON l.competency_id = c.id
GROUP BY c.framework_id;

-- The scoring rule the analytics layer reads through. Two things are
-- settled here and nowhere else:
--
--   * A counter-score is a class, not a role. The permission matrix
--     lets an assessor, a supervisor and an employer all counter-score,
--     so "assessor" is the wrong name for the opposing value. The radar
--     draws one opposing polygon, not three.
--   * Where more than one person counter-scores an entry, the most
--     recent one is the value that counts. Both a gig's assessor and
--     its supervisor can score the same entry, so this is reachable in
--     the seeded data, not a theoretical case.
--
-- scored_at is DATETIME(6), so a tie needs two writes in the same
-- microsecond; id breaks it deterministically if that ever happens.
CREATE VIEW v_entry_score AS
SELECT reflection_entry_id, scorer_class, scorer_role, scorer_user_id,
       level_id, level_value, comment, scored_at
FROM (
    SELECT s.reflection_entry_id,
           IF(s.scorer_role = 'self', 'self', 'counter') AS scorer_class,
           s.scorer_role,
           s.scorer_user_id,
           s.level_id,
           l.level_value,
           s.comment,
           s.scored_at,
           ROW_NUMBER() OVER (
               PARTITION BY s.reflection_entry_id,
                            IF(s.scorer_role = 'self', 'self', 'counter')
               ORDER BY s.scored_at DESC, s.id DESC
           ) AS rn
    FROM scores s
    JOIN levels l ON l.id = s.level_id
) ranked
WHERE rn = 1;

-- Radar data: one row per competency per scorer class, plus a row with
-- a NULL class for a competency nobody has scored yet, so an axis still
-- appears on an empty diary. Axes and scale come from the framework, so
-- this serves La Trobe and SFIA unchanged.
CREATE VIEW v_radar AS
SELECT
    r.id            AS reflection_id,
    r.user_id,
    r.gig_id,
    r.sprint_id,
    f.fw_key        AS framework_key,
    fs.scale_min,
    fs.scale_max,
    c.code          AS competency_code,
    c.short_label,
    c.position,
    es.scorer_class,
    es.scorer_role,
    es.level_value
FROM reflections r
JOIN frameworks          f  ON f.id  = r.framework_id
JOIN v_framework_scale   fs ON fs.framework_id = f.id
JOIN reflection_entries  e  ON e.reflection_id = r.id
JOIN competencies        c  ON c.id  = e.competency_id
LEFT JOIN v_entry_score  es ON es.reflection_entry_id = e.id;

-- Calibration gap: self minus counter per competency. Positive means
-- the student scored themselves higher. MAX is a pivot rather than a
-- choice: v_entry_score already yields at most one row per class.
-- counter_role carries who it was, so the UI can name them.
CREATE VIEW v_calibration_gap AS
SELECT
    r.user_id,
    r.gig_id,
    r.sprint_id,
    c.code AS competency_code,
    MAX(CASE WHEN es.scorer_class = 'self'    THEN es.level_value END) AS self_level,
    MAX(CASE WHEN es.scorer_class = 'counter' THEN es.level_value END) AS counter_level,
    MAX(CASE WHEN es.scorer_class = 'counter' THEN es.scorer_role END) AS counter_role,
    MAX(CASE WHEN es.scorer_class = 'self'    THEN es.level_value END)
      - MAX(CASE WHEN es.scorer_class = 'counter' THEN es.level_value END) AS gap
FROM reflections r
JOIN reflection_entries e  ON e.reflection_id = r.id
JOIN competencies       c  ON c.id = e.competency_id
JOIN v_entry_score      es ON es.reflection_entry_id = e.id
GROUP BY r.user_id, r.gig_id, r.sprint_id, c.code;

-- Coverage gaps: competencies the student has never been scored on.
-- Scored, not evidenced: evidence is optional per framework, so
-- requiring it would report gaps that are not gaps.
--
-- Scoped to frameworks actually assigned to a gig the user is a student
-- on. Crossing every user against every framework instead would tell an
-- assessor they have six gaps in a rubric they have never been measured
-- against. DISTINCT collapses two gigs sharing one framework.
CREATE VIEW v_coverage_gaps AS
SELECT DISTINCT
    u.id     AS user_id,
    f.id     AS framework_id,
    f.fw_key AS framework_key,
    c.code   AS competency_code,
    c.name,
    c.short_label,
    c.position
FROM users u
JOIN gig_participants      gp ON gp.user_id = u.id AND gp.role = 'student'
JOIN framework_assignments fa ON fa.gig_id  = gp.gig_id
JOIN frameworks            f  ON f.id = fa.framework_id AND f.is_active = 1
JOIN competencies          c  ON c.framework_id = f.id
WHERE NOT EXISTS (
    SELECT 1
    FROM reflections r
    JOIN reflection_entries e ON e.reflection_id = r.id
    JOIN scores s ON s.reflection_entry_id = e.id
    WHERE r.user_id = u.id
      AND e.competency_id = c.id
);

-- ---------------------------------------------------------------------
-- 5. Seed: two structurally different frameworks on identical code
-- ---------------------------------------------------------------------

SET @latrobe = UUID();
SET @sfia    = UUID();

INSERT INTO frameworks (id, fw_key, version, name) VALUES
  (@latrobe, 'latrobe6', 'v1',  'La Trobe six-competency'),
  (@sfia,    'sfia9',    '9.0', 'SFIA 9');

INSERT INTO competencies (framework_id, code, name, short_label, position)
SELECT @latrobe, v.code, v.name, v.short_label, v.position
FROM (VALUES
  ROW('contribution',  'Contribution',            'Contrib.',   1),
  ROW('communication', 'Communication',           'Comms',      2),
  ROW('collaboration', 'Collaboration',           'Collab.',    3),
  ROW('agile',         'Agile improvement',       'Agile',      4),
  ROW('continuous',    'Continuous improvement',  'Cont. imp.', 5),
  ROW('leadership',    'Leadership & initiative', 'Leadership', 6)
) AS v(code, name, short_label, position);

INSERT INTO competencies (framework_id, code, name, short_label, category, position)
SELECT @sfia, v.code, v.name, v.code, v.category, v.position
FROM (VALUES
  ROW('PROG', 'Programming / software development', 'Development and implementation', 1),
  ROW('DESN', 'Systems design',                     'Development and implementation', 2),
  ROW('TEST', 'Testing',                            'Development and implementation', 3),
  ROW('DATM', 'Data management',                    'Strategy and architecture',      4),
  ROW('RLMT', 'Stakeholder relationships',          'Relationships and engagement',   5),
  ROW('METL', 'Methods and tools',                  'Delivery and operation',         6)
) AS v(code, name, category, position);

-- La Trobe: four levels per competency. Descriptors abbreviated;
-- replace with the full rubric text once Alumable supplies it.
INSERT INTO levels (competency_id, level_value, descriptor)
SELECT c.id, l.level_value, l.descriptor
FROM competencies c
CROSS JOIN (VALUES
  ROW(1, 'Emerging — acts when prompted.'),
  ROW(2, 'Developing — meets expectations independently.'),
  ROW(3, 'Proficient — extends beyond own scope.'),
  ROW(4, 'Advanced — shapes the work and lifts others.')
) AS l(level_value, descriptor)
WHERE c.framework_id = @latrobe;

-- SFIA: seven generic responsibility levels, shared across skills.
-- Real SFIA restricts each skill to a subrange; narrow per skill once
-- Alumable supplies their mapping.
INSERT INTO levels (competency_id, level_value, descriptor)
SELECT c.id, l.level_value, l.descriptor
FROM competencies c
CROSS JOIN (VALUES
  ROW(1, 'Follow'),
  ROW(2, 'Assist'),
  ROW(3, 'Apply'),
  ROW(4, 'Enable'),
  ROW(5, 'Ensure / advise'),
  ROW(6, 'Initiate / influence'),
  ROW(7, 'Set strategy / inspire')
) AS l(level_value, descriptor)
WHERE c.framework_id = @sfia;

-- ---------------------------------------------------------------------
-- 6. Not in this file
-- ---------------------------------------------------------------------
--
-- personal_access_tokens belongs to Sanctum. It is framework plumbing
-- with no product meaning, so it is not transcribed here; it lives in
-- api/database/migrations and arrives with php artisan migrate.
--
-- Two changes were needed to Sanctum's published version, both of which
-- this file is the reason for:
--
--   * morphs('tokenable') is a bigint unsigned, and users.id is a
--     char(36) uuid. MySQL truncates the id on insert and reports it as
--     warning 1265 rather than an error, so every token silently points
--     at nothing. It is uuidMorphs now.
--   * Sanctum uses TIMESTAMP columns, which this project does not: they
--     stop working in January 2038. DATETIME(6), like everything here.
--
-- Its primary key stays an auto-increment bigint, unlike every table
-- above. It never appears in a url, an export or the API.
