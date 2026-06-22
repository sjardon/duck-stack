# services

Módulo de la aplicación backend. Cubre la estructura, configuración y lógica de negocio del servidor Fastify con arquitectura hexagonal simplificada y vertical slicing.

---

## SERVICES-001 — Fastify Base Structure

**Estado:** DONE

### Contexto

El monorepo está scaffoldeado (INFRA-001) con la app `services` como un proyecto Fastify vacío. Se necesita establecer la arquitectura base antes de agregar cualquier módulo de dominio real.

### Objetivo

Establecer la estructura base de la app Fastify con arquitectura hexagonal simplificada + vertical slicing, lista para agregar módulos de dominio.

### Requerimientos funcionales

- `app.ts`: instancia Fastify, registra plugins y módulos
- `server.ts`: inicia el servidor y maneja graceful shutdown
- Pino logger configurado en Fastify: pretty-print en desarrollo, JSON en producción
- `shared/infrastructure/logger.ts`: instancia Pino reutilizable fuera del contexto de request (use cases, repositories)
- `shared/errors.ts`: clase base `DomainError` y tipado de errores de dominio
- `shared/plugins/error-handler.ts`: plugin Fastify que intercepta `DomainError` y lo mapea al HTTP response correspondiente
- `shared/plugins/cors.ts`: configuración CORS
- `shared/plugins/helmet.ts`: headers de seguridad con Helmet
- `shared/infrastructure/supabase.ts`: cliente Supabase singleton
- `modules/health/routes.ts`: módulo de health check como módulo funcional de ejemplo
- `Dockerfile`: imagen Docker lista para deployar en App Runner

### Fuera de scope

- Módulos de dominio reales (auth, users, etc.)
- Migraciones de base de datos
- Tests unitarios o de integración
- Gestión completa de variables de entorno (más allá del mínimo para arrancar)

### Requerimientos no funcionales

- El servidor debe responder al health check en menos de 100ms
- Los logs deben incluir request ID en cada línea para trazabilidad

### Technical constraints

- Runtime: Node.js con TypeScript
- Framework: Fastify
- Logger: Pino (built-in de Fastify) + pino-pretty en desarrollo
- Base de datos: Supabase (cliente `@supabase/supabase-js`)
- Arquitectura: hexagonal simplificada + vertical slicing
- DI: manual (constructor injection)
- Errores de dominio: clases que extienden `DomainError`

### Dependencias

- INFRA-001 — la app `services` debe existir en el monorepo

---

## SERVICES-002 — Replace Supabase JS client with direct Postgres driver

**Estado:** TODO

### Contexto

La app `services` usa `@supabase/supabase-js` como cliente de base de datos, el cual se comunica con Postgres a través de la API HTTP de PostgREST. Ninguna funcionalidad específica de Supabase (auth, realtime, storage, RLS) está siendo utilizada — el cliente solo actúa como query builder. Esto agrega una dependencia pesada y un salto HTTP innecesario por cada query.

### Objetivo

Eliminar `@supabase/supabase-js` como dependencia de runtime y reemplazar todas las queries con SQL directo usando `postgres.js`, conectando por TCP al mismo Postgres alojado en Supabase.

### Requerimientos funcionales

- Los endpoints de perfil de usuario (GET y PATCH) devuelven las mismas respuestas que antes
- Los webhook handlers (`upsertUser`, `upsertOrganization`, `createMembership`) se comportan de forma idéntica al comportamiento actual
- `createMembership` emite warnings diferenciados cuando el usuario o la organización no existen en la base de datos
- La app arranca y falla de forma temprana si la variable de entorno de conexión a Postgres está ausente

### Requerimientos no funcionales

- La conexión a la base de datos debe realizarse por TCP directo (sin HTTP intermedio)
- `@supabase/supabase-js` no debe ser una dependencia de runtime de `apps/services`

### Fuera de scope

- Cambios en interfaces, use cases, handlers o routes
- Cambios de schema o migraciones
- Nuevas queries o comportamientos
- Otras apps del monorepo (`web`, `landing`)

### Edge cases

- `createMembership` realiza 3 round trips separados con warnings distintos para usuario no encontrado vs. organización no encontrada — este comportamiento debe preservarse exactamente

### Technical constraints

- Postgres client: `postgres.js`
