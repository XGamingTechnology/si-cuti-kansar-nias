#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --set=app_user="$POSTGRES_APP_USER" \
  --set=app_password="$POSTGRES_APP_PASSWORD" --set=app_db="$POSTGRES_DB" \
  --set=migration_user="$POSTGRES_MIGRATION_USER" \
  --set=migration_password="$POSTGRES_MIGRATION_PASSWORD" \
  --set=deployment_environment="$DEPLOYMENT_ENVIRONMENT" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'
  CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  CREATE ROLE :"migration_user" LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  GRANT CONNECT ON DATABASE :"app_db" TO :"app_user";
  GRANT CONNECT ON DATABASE :"app_db" TO :"migration_user";
  GRANT USAGE ON SCHEMA public TO :"app_user";
  GRANT USAGE, CREATE ON SCHEMA public TO :"migration_user";
  SET ROLE :"migration_user";
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
  RESET ROLE;
  CREATE SCHEMA deployment_control AUTHORIZATION postgres;
  REVOKE ALL ON SCHEMA deployment_control FROM PUBLIC;
  CREATE TABLE deployment_control.environment_marker (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    environment text NOT NULL CHECK (environment IN ('production', 'staging'))
  );
  INSERT INTO deployment_control.environment_marker (environment) VALUES (:'deployment_environment');
  GRANT USAGE ON SCHEMA deployment_control TO :"app_user", :"migration_user";
  GRANT SELECT ON deployment_control.environment_marker TO :"app_user", :"migration_user";
SQL
