# Backend deployment on DigitalOcean App Platform (INFRA-008)

This directory holds the versioned, declarative specification and the manual
procedure used to deploy the `apps/services` backend to DigitalOcean App
Platform. `.do/app.yaml` is the single source of truth for the application's
configuration (NF001): re-applying it restores every configuration value it
declares, discarding any divergence introduced by hand in the DigitalOcean
console.

## Contents

| File | Purpose |
|---|---|
| `.do/app.yaml` | Versioned application specification template (`${VAR}` placeholders). |
| `.do/deploy.sh` | Renders `app.yaml` against a values file and reconciles the app via `doctl`. |
| `.do/.env.deploy.example` | Documents every placeholder consumed by `app.yaml`, with safe example values. |
| `.do/.env.deploy.<environment>` | Per-environment real values. Git-ignored — never commit this file. |
| `.do/monitoring/README.md` | Availability monitoring and log-forwarding runbook (INFRA-011) — Better Stack Uptime monitor + Logs source setup, one step past this deploy procedure. |
| `.github/README.md` | CI/CD pipeline runbook (INFRA-012) — `dev`/`prod` now also deploy automatically on merge, calling this directory's `deploy.sh` unchanged; this document's manual procedure remains valid and equivalent for local/ad hoc use. |

## Prerequisites

- An authenticated `doctl` CLI (`doctl auth init`) pointed at a DigitalOcean
  team with App Platform enabled.
- `envsubst`, part of the `gettext` package (`brew install gettext` on
  macOS, then `brew link --force gettext` if `envsubst` is not on `PATH`).
- The repository's GitHub App installed on the DigitalOcean team, with
  access to this repository, so App Platform can pull source for builds.
- The externally provisioned runtime credentials the backend already
  depends on: the Supabase `DATABASE_URL`, the Clerk keys, and the Mobbex
  credentials. The service will not start without them.

No other cloud resource needs to be provisioned: the database (Supabase),
authentication (Clerk) and the remaining third-party integrations are
already hosted outside this repository's infrastructure.

## Deploy procedure

1. Copy the example values file to a per-environment file (never commit it):

   ```sh
   cp .do/.env.deploy.example .do/.env.deploy.<environment>
   ```

2. Fill in `.do/.env.deploy.<environment>` with the real values for that
   environment, including the secret-classified keys that are left blank in
   the example file. The file is organized into the same groups as
   `app.yaml`'s `envs` list — App identity / source, `serverConfig`,
   `authConfig`, email, `mobbexConfig`, and `subscriptionsConfig` — so a
   variable's section comment in one file always matches its section in the
   other. `DO_APP_NAME` must be a **distinct value per environment**: `doctl
   apps create --upsert` matches an existing application by this exact
   `name`, so reusing the same `DO_APP_NAME` across two values files would
   reconcile one environment's application to the other environment's spec
   and values instead of creating a second, independent application.

3. Run the deploy script with that file:

   ```sh
   .do/deploy.sh .do/.env.deploy.<environment>
   ```

   `deploy.sh` validates that every placeholder referenced by `app.yaml` is
   set, renders the spec with `envsubst`, and runs
   `doctl apps create --spec <rendered> --upsert --wait`. `--upsert` creates
   the application on the first run and reconciles the existing application
   (matched by `name`) to the rendered spec on every later run — the same
   command produces the same result every time for the same spec and secret
   values.

4. When the command finishes, it prints the application's public URL. Record
   it in the "Current deployments" table below.

## Configuration is only durable in `app.yaml`

Any configuration change made by hand in the DigitalOcean console is **not
durable**: the next run of the documented deploy procedure overwrites it
with the values declared in `.do/app.yaml` (and the values file used for
that run). Configuration changes must be made in `app.yaml` (or the
per-environment values file) and applied through `.do/deploy.sh`, never in
the console.

## Troubleshooting

### "Missing required env var: EMAIL_SENDER_ADDRESS"

If a deployed instance crashes on startup and the platform reports a
generic deploy failure, check the runtime logs for:

```
Missing required env var: EMAIL_SENDER_ADDRESS
```

This is a **missing-configuration failure**, not a platform failure: the
notifications module aborts startup when `EMAIL_SENDER_ADDRESS` is not set.
`deploy.sh` already validates this (and every other required placeholder)
before deploying, so this error should only appear if a value was cleared
directly in the console (see "Configuration is only durable in `app.yaml`"
above) rather than through the documented procedure.

### Cost while the app is unhealthy or unused

The `services` component does not scale to zero: it keeps consuming budget
as long as it exists, even if a new deployment fails its health check and
the platform keeps serving the previous healthy deployment instead. To stop
billing, scale down or destroy the application explicitly through the CLI:

```sh
doctl apps delete <app-id>
```

## Current deployments

| Environment | Public URL | Last updated |
|---|---|---|
| | | |
