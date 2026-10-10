-- The AI sidecar's own database, diary_ai (ADR #64).
--
-- No narrative text, names or emails. No foreign keys: the product database
-- is a different database, and an entry id here is only ever ranked when
-- Laravel has just returned it for the caller's own token.
-- DATETIME(6) in UTC, never TIMESTAMP, as in the product schema.
CREATE TABLE entry_vectors (
  entry_id     CHAR(36)    NOT NULL PRIMARY KEY,
  content_hash CHAR(64)    NOT NULL,
  embedding    VECTOR(384) NOT NULL,
  created_at   DATETIME(6) NOT NULL
);

-- One row per Claude call: what it cost, never what it said.
CREATE TABLE usage_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  feature       VARCHAR(32)     NOT NULL,
  model         VARCHAR(64)     NOT NULL,
  input_tokens  INT UNSIGNED    NOT NULL,
  output_tokens INT UNSIGNED    NOT NULL,
  cost_usd      DECIMAL(12,6)   NOT NULL,
  created_at    DATETIME(6)     NOT NULL
);

-- The daily cap: what is reserved by calls in flight and spent by calls done.
CREATE TABLE spend_days (
  day          DATE          NOT NULL PRIMARY KEY,
  reserved_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
  spent_usd    DECIMAL(12,6) NOT NULL DEFAULT 0
);

CREATE TABLE theme_cache (
  gig_id     CHAR(36)    NOT NULL,
  day        DATE        NOT NULL,
  themes     JSON        NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (gig_id, day)
);

-- Keyed by a SHA-256 of the token. The token itself is never stored.
CREATE TABLE rate_limits (
  token_hash   CHAR(64)     NOT NULL,
  bucket       VARCHAR(32)  NOT NULL,
  window_start DATETIME(6)  NOT NULL,
  hits         INT UNSIGNED NOT NULL,
  PRIMARY KEY (token_hash, bucket, window_start)
)
