# Availability monitoring and log aggregation (INFRA-011)

This directory holds the versioned specification and the manual procedure
used to configure a Better Stack Uptime monitor and to forward the
`services` backend's logs to Better Stack Logs, for a given environment.
Both are driven by the same git-ignored per-environment values file
`.do/deploy.sh` already uses — no second scheme, no forked template.

## Contents

| File | Purpose |
|---|---|
| `.do/monitoring/monitor.json` | Versioned Better Stack Uptime monitor specification template (`${VAR}` placeholders). |
| `.do/monitoring/deploy.sh` | Renders `monitor.json` against a values file and idempotently reconciles the Uptime monitor and the invited alert recipient via the Better Stack API. |
| `.do/app.yaml` | Also carries the `log_destinations` entry that forwards the backend's stdout to Better Stack Logs (see `services[0].log_destinations` in that file). |

`monitor.json` must stay strict, comment-free JSON (`envsubst` renders it, then
`deploy.sh` parses the result as JSON), so its placeholder contract is
documented here instead of inline:

| Placeholder | Meaning |
|---|---|
| `${BETTERSTACK_MONITOR_URL}` | Public `/health` URL the monitor probes. |
| `${DO_APP_NAME}` | Reused from `app.yaml`'s own placeholder; embedded in `pronounceable_name` to identify the environment. |
| `${BETTERSTACK_CHECK_FREQUENCY_SECONDS}` | Probe interval, in seconds. |
| `${BETTERSTACK_CHECK_TIMEOUT_SECONDS}` | Seconds to wait for a response before classifying a probe as failed. |

Every placeholder above is declared, with the same name, in
`.do/.env.deploy.example`'s "monitoring & log forwarding (INFRA-011)" section
— no placeholder in `monitor.json` is left undocumented.

## Prerequisites

- A Better Stack account with one **team per environment** (or one team
  shared across environments, provided each environment's `.env.deploy.<environment>`
  uses a distinct, team-scoped `BETTERSTACK_API_TOKEN` — "who receives the
  alert" is exactly "who is invited into that environment's team").
- An Uptime monitor product and a Logs source enabled for that team.
- A team-scoped Better Stack API token (`BETTERSTACK_API_TOKEN`), used by
  `deploy.sh` to reconcile the Uptime monitor and invite the alert
  recipient.
- A Logs source ingestion token (`BETTERSTACK_LOGS_TOKEN`), consumed by
  `.do/app.yaml`'s `log_destinations` entry.
- The public `/health` URL already produced by the DigitalOcean App
  Platform deploy for that environment (`.do/README.md`'s "Current
  deployments" table) — the monitor cannot be pointed at an environment
  that has not been deployed yet.

## Setup procedure

1. Extend the same per-environment values file used by `.do/deploy.sh`
   (`.do/.env.deploy.<environment>`) with the "monitoring & log forwarding
   (INFRA-011)" section documented in `.do/.env.deploy.example`:
   `BETTERSTACK_LOGS_TOKEN`, `BETTERSTACK_API_TOKEN`,
   `BETTERSTACK_ALERT_EMAIL`, `BETTERSTACK_MONITOR_URL`,
   `BETTERSTACK_CHECK_FREQUENCY_SECONDS`, `BETTERSTACK_CHECK_TIMEOUT_SECONDS`.

2. Re-run `.do/deploy.sh .do/.env.deploy.<environment>` (or an earlier run
   already applied it) so `log_destinations` starts forwarding logs for
   that environment.

3. Run the monitoring deploy script with the same values file:

   ```sh
   .do/monitoring/deploy.sh .do/.env.deploy.<environment>
   ```

   `deploy.sh` validates every required placeholder is set, renders
   `monitor.json` with `envsubst`, and reconciles the Uptime monitor via the
   Better Stack API — creating it on the first run, updating it in place on
   every later run for the same target URL — then invites
   `BETTERSTACK_ALERT_EMAIL` into the team so it receives that
   environment's downtime/recovery notifications.

4. **Mandatory — EC005 end-to-end delivery test.** An environment is not
   considered monitored until this step has been performed: deliberately
   force a downtime notification (e.g. temporarily point the monitor at an
   unreachable URL, or stop the service) and a recovery notification, and
   confirm both are actually received at `BETTERSTACK_ALERT_EMAIL`. Until
   an invited recipient confirms its subscription and this delivery test
   passes, silence from the monitor is indistinguishable from the absence
   of incidents.

## Documented behaviors and limits

- **EC001 — shallow health check blind spot.** `GET /health` does not check
  the database or any other dependency — it only confirms the process is
  alive. If the database is unreachable but the process is alive, `/health`
  still returns HTTP 200 and the monitor will not detect the outage; this
  is an accepted blind spot. A dependency-aware ("deep") health check would
  require an application code change, which is out of scope for this
  feature.

- **EC002 — maximum undetected outage window.** An outage that starts and
  ends between two consecutive probes triggers no failing probe and no
  notification. The resulting maximum undetected outage window is
  `interval × confirmation attempts`; with the shortest interval permitted
  by the contracted plan (`BETTERSTACK_CHECK_FREQUENCY_SECONDS`) and
  Better Stack's default of a small number of confirmation attempts before
  declaring downtime, this window should be recorded per environment when
  the plan and confirmation-attempt count are finalized (e.g. a 30-second
  interval with 2 confirmation attempts yields a maximum undetected window
  of about 60 seconds).

- **EC003 — chosen interval, monthly request count and `/health` exclusion
  query.** `BETTERSTACK_CHECK_FREQUENCY_SECONDS` should be set to the
  shortest interval the contracted Better Stack plan allows. At a 30-second
  interval, the monitor issues `2,592,000 / 30 ≈ 86,400` probe requests per
  month against `/health` — record the actual configured interval and its
  resulting monthly request count per environment here once finalized.
  Because every probe hits the fixed `/health` path, probe traffic is
  always identifiable and excludable from log searches with the query
  `NOT json.message: "*/health*"` (or, restricted further, filter out lines
  whose `requestId` corresponds only to `/health` requests) in the Better
  Stack Logs search bar.

- **EC004 — log ingestion quota and mitigation.** Record the contracted
  Better Stack Logs plan's ingestion quota here per environment. If a burst
  of log lines during an incident exceeds that ingestion quota, lines may
  be dropped exactly during the incident; per NF002 this never affects
  request handling, since forwarding happens outside the request path. The
  mitigation available without a code change is to raise `LOG_LEVEL` for
  that environment in its `.do/.env.deploy.<environment>` values file (the
  existing env var already declared in `.do/app.yaml`) and redeploy with
  `.do/deploy.sh`.

- **EC005 — mandatory end-to-end delivery test.** See step 4 of the setup
  procedure above: an environment is not considered monitored until a
  downtime notification and a recovery notification have both been
  deliberately forced and confirmed received.

- **EC006 — distinguishing platform lines from application lines.** The
  forwarded stream mixes DigitalOcean App Platform's own build/deploy/
  lifecycle lines with the backend's structured JSON lines. In Better Stack
  Logs, restrict search results to the backend's own structured lines with
  a query such as `_exists_: requestId` (or any query requiring one of the
  backend's own fields, e.g. `level:*`) so that filtering by a `requestId`
  value returns only application log lines, not unrelated platform output.

- **NF001 — one-time inspection for secrets and PII.** No secret, token,
  credential or personal data must reach the external log destination. As a
  mandatory one-time setup step per environment, inspect the forwarded
  stream in Better Stack Logs after the first deploy with `log_destinations`
  enabled and confirm no value classified as secret in `.do/app.yaml`
  (`DATABASE_URL`, the Clerk keys, `RESEND_API_KEY`, the Mobbex credentials)
  and no PII appears in any line, per the logging policy in
  `duck-spec/docs/BACKEND.md`.

- **NF002 — a log destination failure never degrades the service.**
  DigitalOcean App Platform ships stdout/stderr lines to `log_destinations`
  outside the request path. If Better Stack Logs is unreachable, rejecting,
  or throttling ingestion, `GET /health` keeps returning HTTP 200 and
  request handling keeps working with no added latency and no error
  surfaced to clients — this is a platform-level guarantee of the App
  Platform log pipeline, not something implemented by this feature.

- **NF003 — probe request volume against the contracted plan quota.**
  `BETTERSTACK_CHECK_FREQUENCY_SECONDS` and `BETTERSTACK_CHECK_TIMEOUT_SECONDS`
  are configurable per environment so the monitor never exceeds the
  contracted plan's request quota by itself; the resulting monthly request
  volume (see EC003) must stay within that plan's quota. Record the
  contracted plan's monthly quota and the configured interval's resulting
  volume per environment here.

## Current monitors

| Environment | Monitor URL | Check frequency | Last updated |
|---|---|---|---|
| | | | |
