#!/bin/bash
# First start only (CAP-71): the assessor's four databases and three users. The
# passwords arrive from ./assess through compose's environment; none is written here.
set -euo pipefail
mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE reflection_diary_assess CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE diary_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE reflection_diary_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE diary_ai_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'diary_app'@'%' IDENTIFIED BY '${ASSESS_DB_APP_PASSWORD}';
GRANT ALL ON reflection_diary_assess.* TO 'diary_app'@'%';
CREATE USER 'diary_ai'@'%' IDENTIFIED BY '${ASSESS_DB_AI_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE, DROP ON diary_ai.* TO 'diary_ai'@'%';
CREATE USER 'diary_test'@'%' IDENTIFIED BY '${ASSESS_DB_TEST_PASSWORD}';
GRANT ALL ON reflection_diary_test.* TO 'diary_test'@'%';
GRANT ALL ON diary_ai_test.* TO 'diary_test'@'%';
SQL
