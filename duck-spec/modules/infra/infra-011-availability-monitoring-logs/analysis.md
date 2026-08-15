# INFRA-011 — Monitoreo de disponibilidad y agregación de logs — Analysis

## Reason for being

The backend already emits structured JSON logs through the single static Pino logger (`shared/infrastructure/logger.ts`) with stable field names (`timestamp`, `level`, `message`, `requestId`, `userId`, `duration`) and a `requestId` injected into every line emitted during an HTTP request via an `AsyncLocalStorage`-backed mixin. That entire investment is wasted today: the logs only exist inside DigitalOcean App Platform's console, with a bounded retention window and no real search.

There is also nobody watching whether the service is up. INFRA-007 was going to build an alerting channel on CloudWatch + SNS and became obsolete when the stack left AWS (INFRA-010). Today the only way to learn about an outage is a user reporting it.

The goal is to detect backend outages without depending on a user report, and to make the logs searchable and retained outside the compute platform.

## Scope

An external, periodic availability check against the backend's existing `GET /health` endpoint, with downtime and recovery notifications to a configurable recipient, plus forwarding of the backend's log stream from DigitalOcean App Platform to an external log destination where the already-emitted JSON fields are queryable as fields and retention is owned outside the platform. Both the check and the log destination are configured per environment through the existing `.do/app.yaml` placeholder + git-ignored values-file mechanism, with no change to any application source code.

## Out of scope

- Backend exception reporting and grouping (SERVICES-011).
- Public status page.
- On-call schedules, escalation policies and alert silencing.
- Alarms over business metrics or email delivery metrics.
- Custom dashboards and distributed tracing.
- Any change to the source code of the applications (`apps/services`, `apps/web`, `apps/landing`).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall probe the backend's public `GET /health` endpoint from outside the compute platform at a fixed, configured interval, without any manual trigger. |
| R002 | Event-driven | WHEN a probe of `GET /health` does not return a successful HTTP response within the configured timeout, the system shall classify that environment's backend as down, and WHEN a later probe returns a successful HTTP response, it shall classify it as up again. |
| R003 | Event-driven | WHEN an environment's backend is classified as down, the system shall notify the recipient configured for that environment, identifying the affected environment, the checked URL and the observed failure reason (HTTP status, timeout or connection error). |
| R004 | Event-driven | WHEN an environment's backend is classified as up again after having been down, the system shall notify the same configured recipient that the service recovered, including the duration of the outage. |
| R005 | Ubiquitous | The system shall forward every log line the backend writes to its standard output from DigitalOcean App Platform to an external log destination, where lines are searchable by content and time range and are retained for a retention period configured in that destination, independent of the platform's own retention. |
| R006 | Ubiquitous | The system shall make the structured fields the backend already emits (`timestamp`, `level`, `message`, `requestId`, `userId`, `duration`) individually queryable as fields in the external destination — a filter by `requestId` value shall return exactly the lines of that request — instead of only as plain-text substrings. |
| R007 | Ubiquitous | The system shall allow the availability check target, the alert recipient and the log destination credentials to hold different values per environment without forking or duplicating the deployment specification. |
| R008 | Ubiquitous | The system shall version the monitoring and log-forwarding configuration in the repository with every environment-dependent and credential value expressed as a placeholder resolved from the git-ignored per-environment values file, so no token or recipient address is committed. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | No secret, token, credential or personal data shall reach the external log destination: an inspection of the forwarded stream for any environment shall find no value classified as secret in `.do/app.yaml` (`DATABASE_URL`, Clerk keys, `RESEND_API_KEY`, Mobbex credentials) and no PII, per the logging policy in `duck-spec/docs/BACKEND.md`. |
| NF002 | A failure of the external log destination (unreachable, rejecting, or throttling ingestion) shall not degrade the service: with the destination failing, `GET /health` shall keep returning HTTP 200 and request handling shall keep working with no added latency and no error surfaced to clients. |
| NF003 | The availability check shall consume no more than the request volume allowed by the contracted plan for the configured interval, so monitoring never exhausts the plan quota by itself. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the database is unreachable but the process is alive, `GET /health` still returns HTTP 200 `{ status: 'ok' }` because `apps/services/src/modules/health/routes.ts` checks no dependency; the system shall classify the backend as up and shall send no downtime notification, and the monitoring documentation shall state this blind spot explicitly (a dependency-aware health check would require an application code change, which is out of scope). Assumption: the conservative behavior is to keep the check shallow and document the gap rather than infer an unspecified deep check. |
| EC002 | WHEN an outage starts and ends between two consecutive probes, no probe fails and no notification is sent; the system shall configure the shortest interval permitted by the contracted plan and the documentation shall state the resulting maximum undetected outage window (interval × confirmation attempts) as an accepted limit for that environment. |
| EC003 | WHEN the probe interval is set low enough to be a meaningful share of the plan quota or of the traffic recorded for the service, the system shall keep the interval within the value stated in NF003 and shall keep the probe traffic identifiable (all probes hit the fixed `/health` path), and the documentation shall record the chosen interval, its resulting monthly request count, and the query filter that excludes `/health` lines from log searches. |
| EC004 | WHEN the backend emits a burst of log lines that exceeds the destination's ingestion quota, lines may be dropped exactly during an incident; the system shall keep serving HTTP traffic unaffected (per NF002, forwarding happens outside the request path), and the documentation shall record the plan's ingestion quota plus the mitigation available without a code change: raising `LOG_LEVEL` for that environment through the existing env var in `.do/app.yaml` and redeploying. |
| EC005 | WHEN the alert recipient has been configured but has not confirmed its subscription with the provider, notifications are not delivered and silence is indistinguishable from absence of incidents; the system shall not consider an environment monitored until an end-to-end delivery test has been performed (deliberately forcing a downtime/recovery notification and receiving it), and that verification step shall be a mandatory, documented item of the setup procedure for each environment. |
| EC006 | WHEN the forwarded stream mixes platform-generated lines (build, deploy and component lifecycle output) with the backend's JSON lines, a text search returns unrelated results; the system shall keep both kinds distinguishable in the destination and the documentation shall provide the default query that restricts results to the backend's own structured lines, so that filtering by a `requestId` value returns only application log lines. |

## Technical constraints

- Availability monitoring and log aggregation provider: **Better Stack** (Uptime monitor + Logs source). No second provider is introduced.
- No change to the backend source code: the existing `GET /health` endpoint and the existing Pino JSON output are inputs to this feature and must be consumed as they are. This is a structural restriction, not a runtime-observable requirement, so it is recorded here rather than as an NF-ID.
- Log forwarding must be declared in the versioned `.do/app.yaml` through the platform's log-destination mechanism, with the ingestion token as an `${VAR}` placeholder rendered by `.do/deploy.sh` (`envsubst` + `doctl apps create --spec <rendered> --upsert --wait`) from the git-ignored `.do/.env.deploy.<environment>` values file — consistent with how every other secret-classified value is handled.
- No Terraform and no AWS resources: the AWS infrastructure was retired in INFRA-010.
- The availability check must target the public HTTPS URL produced by the DigitalOcean App Platform deploy (INFRA-008) for the corresponding environment.

## Dependencies

- INFRA-010 (AWS retirement) and INFRA-008 (DigitalOcean deploy) — the deployment topology must be final, and the public backend URL per environment must exist before the monitor can be pointed at it.
- A Better Stack account with an Uptime monitor and a Logs source available, plus the ingestion token per environment, before the first deploy that includes the log destination.
- `.do/tests` covers the app specification; any change to `.do/app.yaml` must keep that suite passing.

## Effort estimate

**high** — 8 functional requirements covering an external probe, downtime/recovery notification, log forwarding, field-level queryability and per-environment configuration; three non-functional requirements including a data-leakage guarantee over the forwarded stream and a service-degradation guarantee; six edge cases spanning a shallow health check, undetected short outages, quota consumption on both probes and log ingestion, unconfirmed alert recipients and mixed platform/application log streams; plus dependencies on the finalized deployment topology and on external provider setup.
