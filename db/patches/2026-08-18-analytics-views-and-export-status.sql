-- ---------------------------------------------------------------------
-- Patch: analytics views and export status
-- 2026-08-18 · ADR #23, #24, #25
--
-- Brings an instance created from the previous db/01-schema.sql up to
-- the current one. 01-schema.sql stays the source of truth; this is the
-- delta for the databases that already exist, which is all of them.
--
-- Announce in the channel before running this against reflection_diary.
--
--   mysql --defaults-file=... reflection_diary < db/patches/2026-08-18-analytics-views-and-export-status.sql
--
-- Rerunnable. Views are dropped and recreated, and the ALTER is skipped
-- if exports.status is already there. Rerunning it changes nothing and
-- reports nothing.
-- ---------------------------------------------------------------------

-- Not decoration. A view records the client character set in force when
-- it was created, and it is what the string literals inside it are read
-- as. 01-schema.sql opens with this line, so a view built by piping this
-- patch in without it ends up latin1 where the same view built from the
-- schema is utf8mb4.
SET NAMES utf8mb4;

-- Dropped in dependency order: v_radar and v_calibration_gap read
-- through v_entry_score.
DROP VIEW IF EXISTS v_radar;
DROP VIEW IF EXISTS v_calibration_gap;
DROP VIEW IF EXISTS v_coverage_gaps;
DROP VIEW IF EXISTS v_entry_score;

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

-- exports.status: stored rather than derived from completed_at, so a
-- failed job is distinguishable from a running one. See ADR #25.
-- Guarded so the patch can be rerun. MySQL has no ADD COLUMN IF NOT
-- EXISTS, and an unguarded rerun fails on the constraint name (3822)
-- rather than on the column.
SET @needs_status := (
    SELECT COUNT(*) = 0
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'exports'
      AND column_name  = 'status');

SET @stmt := IF(@needs_status,
    "ALTER TABLE exports
         ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER format,
         ADD CONSTRAINT ck_ex_status CHECK (status IN ('pending','complete','failed'))",
    "DO 0");

PREPARE apply_status FROM @stmt;
EXECUTE apply_status;
DEALLOCATE PREPARE apply_status;
