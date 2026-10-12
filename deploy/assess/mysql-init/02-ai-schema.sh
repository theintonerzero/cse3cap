#!/bin/bash
# First start only (CAP-71): the sidecar's tables, from the file the live demo uses.
set -euo pipefail
mysql -u root -p"$MYSQL_ROOT_PASSWORD" diary_ai < /ai-schema.sql
