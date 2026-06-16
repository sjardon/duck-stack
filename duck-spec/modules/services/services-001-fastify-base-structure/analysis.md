# SERVICES-001 — Fastify Base Structure — Analysis

## Reason for being

The monorepo has been scaffolded by INFRA-001 and the `services` app currently exists as an empty Fastify project. Before any real domain module (auth, users, etc.) can be added, the backend needs a well-defined base architecture so that every future module plugs into a consistent, predictable structure.

The objective is to establish the base structure of the Fastify app using a simplified hexagonal architecture with vertical slicing. This includes the Fastify instance bootstrap, the server entry point with graceful shutdown, a configured Pino logger (pretty in development, JSON in production), shared infrastructure (logger instance, Supabase client), a shared domain error model with an HTTP error-handler plugin, baseline security plugins (CORS and Helmet), a health-check module used as the canonical example of a functional module, and a Dockerfile ready for deployment on AWS App Runner.

## Scope

Base architecture and bootstrap code for the `services` Fastify backend:
- Fastify app instance (`app.ts`) that registers plugins and modules.
- Server entry point (`server.ts`) that starts Fastify and handles graceful shutdown.
- Pino logging configured both at the Fastify level (request-scoped) and as a reusable instance for non-request code (use cases, repositories).
- Shared error model: `DomainError` base class and typed domain errors, plus a Fastify error-handler plugin that maps domain errors to HTTP responses.
- Shared Fastify plugins for CORS and Helmet.
- Shared Supabase singleton client.
- A `health` module under `modules/` used as a reference example for the vertical-slicing convention.
- A Dockerfile suitable for App Runner deployment.

## Out of scope

- Real domain modules (auth, users, etc.).
- Database migrations.
- Unit or integration tests.
- Full environment variable management beyond the minimum required to boot the service.

## Functional requirements

| ID   | Requirement |
|------|-------------|
| R001 | The system shall provide an `app.ts` module that creates a Fastify instance and registers all shared plugins and feature modules. |
| R002 | The system shall provide a `server.ts` entry point that boots the Fastify instance and listens on the configured host and port. |
| R003 | WHEN the process receives a termination signal (SIGINT or SIGTERM), the system shall perform a graceful shutdown of the Fastify server before exiting. |
| R004 | The system shall configure Fastify's built-in Pino logger to use pretty-print formatting in development and JSON formatting in production. |
| R005 | The system shall expose a reusable Pino logger instance from `shared/infrastructure/logger.ts` for use outside the Fastify request context (use cases, repositories). |
| R006 | The system shall define a `DomainError` base class and a typed domain-error model in `shared/errors.ts` from which concrete domain errors extend. |
| R007 | WHEN a request handler throws a `DomainError`, the error-handler plugin in `shared/plugins/error-handler.ts` shall intercept it and map it to the corresponding HTTP response. |
| R008 | The system shall register a CORS plugin from `shared/plugins/cors.ts` that configures cross-origin access for the Fastify app. |
| R009 | The system shall register a Helmet plugin from `shared/plugins/helmet.ts` that applies security-related HTTP headers to every response. |
| R010 | The system shall expose a singleton Supabase client from `shared/infrastructure/supabase.ts` that can be imported by infrastructure code. |
| R011 | The system shall expose a health-check module at `modules/health/routes.ts` that responds to health-check requests and serves as the reference example of a vertical-sliced functional module. |
| R012 | The system shall provide a `Dockerfile` that produces a container image of the `services` app suitable for deployment on AWS App Runner. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NF001 | WHEN the health-check endpoint is called, the system shall respond in under 100ms. |
| NF002 | The system shall include a request ID in every log line emitted within the scope of an HTTP request to enable traceability. |

## Technical constraints

- Runtime: Node.js with TypeScript.
- Framework: Fastify.
- Logger: Pino (built into Fastify) with `pino-pretty` in development.
- Database client: Supabase (`@supabase/supabase-js`).
- Architecture: simplified hexagonal + vertical slicing.
- Dependency injection: manual constructor injection.
- Domain errors: classes that extend `DomainError`.

## Dependencies

- INFRA-001 — the `services` app must already exist in the monorepo.

## Effort estimate

**high** — 12 functional requirements covering bootstrap, graceful shutdown, dual logging strategy, shared error model, two security plugins, a Supabase singleton, a reference health module, and a Dockerfile; NFRs that include a hard performance bound (sub-100ms health check) and a traceability constraint (request ID in every log line); and an upstream dependency on INFRA-001 that the base structure must integrate with.
