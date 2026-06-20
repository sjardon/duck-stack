# AUTH-002 — Supabase Schema & Clerk Sync

## Reason for being

Clerk currently manages identity end-to-end (AUTH-001), but the product has no persistence layer for user and organization data. Without local records in Supabase, the platform cannot associate business entities (subscriptions, projects, billing, etc.) with users or organizations, and cannot query or join against them.

This feature establishes the foundational Supabase schema (`users`, `organizations`, `organization_members`) and a Clerk webhook endpoint in `services` that keeps those tables synchronized with Clerk's source of truth in near real time.

## Scope

Defines the initial Supabase migration set for identity-related tables, the development seed data, and the `/webhooks/clerk` endpoint that consumes Clerk webhook events (user and organization lifecycle) with Svix signature verification. Covers handlers for create/update events on users, organization creation, and organization membership creation.

## Out of scope

- Endpoints REST de perfil de usuario (AUTH-003)
- Frontend de perfil (AUTH-003)
- Handlers para eventos de eliminación (`user.deleted`, `organization.deleted`)
- Tablas de otros dominios (billing, etc.)
- Soft delete o auditoría avanzada
- Row Level Security (RLS) de Supabase

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall provide a Supabase CLI setup with a migrations directory located at `apps/services/supabase/migrations/`. |
| R002 | Ubiquitous | The system shall define a `users` table with columns `id` (uuid PK), `clerk_user_id` (text, unique), `email` (text), `name` (text), `avatar_url` (text nullable), `created_at`, and `updated_at`. |
| R003 | Ubiquitous | The system shall define an `organizations` table with columns `id` (uuid PK), `clerk_org_id` (text, unique), `name` (text), `slug` (text, unique), `created_at`, and `updated_at`. |
| R004 | Ubiquitous | The system shall define an `organization_members` table with columns `user_id` (FK → `users`), `org_id` (FK → `organizations`), `role` (text), `created_at`, and a composite primary key `(user_id, org_id)`. |
| R005 | Ubiquitous | The system shall expose a `POST /webhooks/clerk` endpoint in `services`. |
| R006 | Event-driven | WHEN a request arrives at `POST /webhooks/clerk`, the system shall verify the Svix signature using `CLERK_WEBHOOK_SIGNING_SECRET`. |
| R007 | Conditional | IF the Svix signature is invalid, THEN the system shall respond with HTTP 400. |
| R008 | Conditional | IF the Svix signature is valid and the event is processed successfully, THEN the system shall respond with HTTP 200. |
| R009 | Event-driven | WHEN a verified `user.created` event is received, the system shall insert or update the corresponding record in the `users` table keyed by `clerk_user_id`. |
| R010 | Event-driven | WHEN a verified `user.updated` event is received, the system shall update `email`, `name`, and `avatar_url` for the matching `users` row. |
| R011 | Event-driven | WHEN a verified `organization.created` event is received, the system shall insert a record in the `organizations` table. |
| R012 | Event-driven | WHEN a verified `organizationMembership.created` event is received, the system shall insert a record in the `organization_members` table. |
| R013 | Ubiquitous | The system shall provide seed data for local development that populates example users and organizations. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The `POST /webhooks/clerk` endpoint shall receive the request body as a raw buffer (not parsed JSON) so that Svix signature verification succeeds under Fastify. |
| NF002 | The `POST /webhooks/clerk` endpoint shall respond with HTTP 400 on invalid signature and HTTP 200 on successful event processing. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN `POST /webhooks/clerk` receives a request without the required Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`), the system shall respond with HTTP 400. |
| EC002 | WHEN a verified webhook event has a `type` that is not handled (e.g. `session.created`), the system shall respond with HTTP 200 without modifying any table. |
| EC003 | WHEN a verified `user.created` event references a `clerk_user_id` that already exists in `users`, the system shall update the existing row rather than insert a duplicate (idempotent upsert keyed by `clerk_user_id`). |
| EC004 | WHEN a verified `user.updated` event references a `clerk_user_id` that does not yet exist in `users`, the system shall upsert the row so the sync is self-healing. Assumption: events may arrive out of order, so `user.updated` is treated as an upsert. |
| EC005 | WHEN a verified `organizationMembership.created` event references a `user_id` or `org_id` not yet present in the local tables, the system shall respond with HTTP 200 and skip the insert without raising a foreign key error. Assumption: missing parent rows are logged for diagnosis; replay will resolve the gap. |
| EC006 | WHEN `POST /webhooks/clerk` is invoked but `CLERK_WEBHOOK_SIGNING_SECRET` is not configured, the system shall fail fast at startup (registration time) so that the endpoint is never served unverified. |
| EC007 | WHEN a verified `organization.created` event references a `slug` that already exists in `organizations`, the system shall treat the operation as idempotent by upserting on `clerk_org_id` and respond with HTTP 200. |

## Technical constraints

- Migraciones gestionadas con Supabase CLI bajo `apps/services/supabase/migrations/`.
- Verificación de firma del webhook mediante `verifyWebhook` de `@clerk/backend/webhooks`.
- Variable de entorno adicional `CLERK_WEBHOOK_SIGNING_SECRET` en `services`.
- La ruta `POST /webhooks/clerk` debe registrarse antes del plugin de JSON parsing de Fastify para preservar el raw body.
- Dependencias previas: AUTH-001 (Clerk integrado como proveedor de identidad) y SERVICES-001 (estructura base de `services`).
