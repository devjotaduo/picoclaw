-- Bootstrap: create the LiteLLM database. The controlplane DB is created by
-- POSTGRES_DB env var. Migrations for the controlplane schema are applied at
-- startup by the control plane itself, not here.

CREATE DATABASE litellm;
