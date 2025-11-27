#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create minifc database if it doesn't exist
    SELECT 'CREATE DATABASE minifc'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'minifc')\gexec
EOSQL

echo "Database initialization completed!"
