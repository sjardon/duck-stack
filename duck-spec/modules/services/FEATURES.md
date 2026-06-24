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

**Estado:** DONE

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

---

## SERVICES-003 — Centralize `process.env` reads in config files

**Estado:** DONE

### Contexto

`duck-spec/docs/BACKEND.md` establece que ningún código de aplicación debe leer `process.env` directamente: toda variable de entorno debe consumirse a través de un objeto de configuración tipado bajo `src/shared/configs/<scope>Config.ts`, salvo dos excepciones explícitamente documentadas (`shared/infrastructure/db.ts` para `DATABASE_URL` y `clerkAuthPlugin` para `CLERK_SECRET_KEY`). Hoy hay múltiples archivos que violan esta regla: `app.ts`, `server.ts`, `shared/plugins/cors.ts`, `shared/infrastructure/logger.ts`, `shared/plugins/clerk-auth.plugin.ts` (para `CLERK_JWT_KEY`), `modules/webhooks/clerk/routes.ts` y `modules/billing/providers/resolveProvider.ts`. La consecuencia es que el acoplamiento a variables de entorno está disperso, los defaults no son descubribles desde un único lugar y nuevas dependencias de configuración pueden agregarse sin pasar por la capa de config.

### Objetivo

Que todas las lecturas de `process.env` queden centralizadas en archivos bajo `src/shared/configs/`, dejando al código de aplicación dependiendo solamente de objetos de configuración tipados.

### Requerimientos funcionales

- Existe un archivo de configuración por scope lógico bajo `src/shared/configs/` que expone, como objeto tipado, todas las variables de entorno que el scope necesita
- El módulo de bootstrap del servidor consume host, puerto, nivel de log y entorno desde el objeto de configuración correspondiente, no desde `process.env`
- El plugin de CORS consume el origen permitido desde el objeto de configuración, no desde `process.env`
- El plugin de autenticación consume la clave pública JWT de Clerk desde el objeto de configuración, no desde `process.env`
- El módulo de webhooks de Clerk consume el secreto de firma desde el objeto de configuración, no desde `process.env`
- El resolver de proveedor de pagos y el proveedor Mobbex consumen todas sus credenciales y flags desde el objeto de configuración, no desde `process.env`
- El logger reutilizable fuera del scope de request consume nivel de log y entorno desde el objeto de configuración, no desde `process.env`
- El comportamiento observable de la app (defaults, errores de arranque, respuestas) es idéntico al anterior tras la centralización

### Fuera de scope

- Renombrar archivos o clases existentes
- Cambios de comportamiento, nuevas variables de entorno o nuevos defaults
- Mover las dos excepciones documentadas (`DATABASE_URL` en `db.ts`, `CLERK_SECRET_KEY` en `clerkAuthPlugin`)
- Validación de schema de variables de entorno (p.ej. con Zod) más allá del tipado de TypeScript
- Documentación de variables de entorno fuera del código

### Requerimientos no funcionales

- La app debe seguir fallando temprano y con mensaje claro cuando una variable de entorno requerida (secretos, credenciales del proveedor) está ausente
- Ningún archivo fuera de `src/shared/configs/` y de las dos excepciones documentadas en BACKEND.md puede contener una referencia a `process.env`

### Edge cases

- Variables ausentes con default: deben mantener el mismo default tras la centralización
- Variables ausentes sin default cuyo consumo es obligatorio: el error de arranque debe lanzarse igual que antes, en el mismo punto del ciclo de vida
- `MOBBEX_TEST_MODE` acepta tanto `"true"` como `"1"` — el objeto de configuración debe preservar esta semántica

### Dependencias

- SERVICES-001 — la estructura base de `services` y los archivos de configuración deben existir

---

## SERVICES-004 — Normalize file naming to lowercase camelCase

**Estado:** DONE

### Contexto

`duck-spec/docs/BACKEND.md` define la convención de nombres de archivo como camelCase iniciando en minúscula, sin sufijos separados por punto ni `kebab-case`. Hoy hay archivos que violan esta convención: los plugins (`error-handler.ts`, `require-auth.ts`, `require-org.ts`, `clerk-auth.plugin.ts`), las entidades de todos los módulos (`user.entity.ts`, `subscriptionPlan.entity.ts`, `transaction.entity.ts`, `refund.entity.ts`) y los DTOs (`checkout.dto.ts`, `updateProfile.dto.ts`, `completeOnboarding.dto.ts`). La inconsistencia dificulta el descubrimiento de archivos, vuelve los criterios de naming negociables por archivo y bloquea futuras auditorías automatizadas de convenciones.

### Objetivo

Que todos los archivos de `apps/services/src/` cumplan la regla de naming camelCase en minúscula, sin sufijos separados por punto ni `kebab-case`.

### Requerimientos funcionales

- Los archivos de plugins en `src/shared/plugins/` usan nombres camelCase en minúscula sin guiones ni sufijos `.plugin.ts`
- Los archivos de entidades en cada módulo usan nombres camelCase en minúscula sin sufijo `.entity.ts`
- Los archivos de DTOs en cada módulo usan nombres camelCase en minúscula sin sufijo `.dto.ts`
- Todas las referencias y `import`s del código fuente y de los tests apuntan a los nuevos nombres
- El comportamiento observable (rutas, respuestas, logs) de la app es idéntico al anterior
- Los tests existentes pasan sin cambios en su lógica, sólo en sus imports

### Fuera de scope

- Renombrar clases, funciones, interfaces o tipos
- Cambios de comportamiento o de contenido de los archivos renombrados
- Renombrado de archivos de declaración de tipos (`*.d.ts`)
- Renombrado de carpetas
- Reorganizar la estructura de módulos

### Requerimientos no funcionales

- Ningún archivo dentro de `apps/services/src/` puede contener guiones ni sufijos separados por punto distintos a `.ts`, `.d.ts` y `.test.ts`
- El historial de Git debe poder seguir el rename de cada archivo (un commit por rename o renames detectables por similitud)

### Edge cases

- Archivos importados desde fuera de `apps/services/` (p.ej. tests de integración o scripts) deben actualizar sus imports
- Imports relativos que dependen del nombre antiguo en cadenas de re-export deben actualizarse
- El cambio no debe romper la resolución de módulos en entornos case-insensitive (p.ej. macOS)

### Dependencias

- SERVICES-001 — la estructura de módulos sobre la que se aplican los renames debe existir

---

## SERVICES-005 — Propagate request-bound logging context via AsyncLocalStorage

**Estado:** DONE

### Contexto

`duck-spec/docs/BACKEND.md` establece que toda línea de log emitida durante el ciclo de vida de un request debe incluir el `requestId` para poder correlacionar trazas. Hoy, los repositorios (`TransactionDBRepository`, `MobbexBillingSyncRepository`, `ClerkSyncRepository`, `UserDBRepository`, `SubscriptionPlanDBRepository`), los use cases del módulo `billing` y los dispatchers de webhooks importan el logger Pino estático de `src/shared/infrastructure/logger.ts` y emiten sus logs a través de él. Como ese logger no conoce el contexto del request, las líneas de log emitidas durante un request (latencia de queries, warnings de negocio, outcomes de transacciones y refunds) no incluyen `requestId` y quedan desconectadas de la traza del request original. La única ruta que cumple la regla hoy es `modules/webhooks/mobbex/routes.ts`, que loggea directamente con `request.log`.

### Objetivo

Que toda línea de log emitida durante el ciclo de vida de un request incluya el `requestId`, sin modificar la firma de use cases, repositorios ni dispatchers, y manteniendo intacto el comportamiento de los logs emitidos fuera del scope de un request.

### Requerimientos funcionales

- Toda línea de log emitida durante el procesamiento de un request HTTP incluye el campo `requestId`
- El `requestId` incluido en los logs coincide con el ID que Fastify asigna al request (`request.id`)
- El comportamiento de logging fuera del scope de un request (arranque del servidor, wiring inicial de DB, factory de proveedor de pagos) no cambia: la línea de log no incluye `requestId`
- Los repositorios, use cases y dispatchers siguen emitiendo logs a través del logger Pino estático de `shared/infrastructure/logger.ts` — no se modifica ninguna firma de método ni de función
- Los logs emitidos por dos requests concurrentes no se mezclan: cada línea lleva el `requestId` del request que la originó
- El texto, nivel y campos estructurados de cada línea de log existente se preservan idénticos tras el cambio

### Requerimientos no funcionales

- El logger Pino estático sigue siendo la única instancia compartida; no se introducen child loggers ni instancias adicionales por request
- No se introducen dependencias externas nuevas — sólo `node:async_hooks` (built-in de Node.js) y la API `mixin` de Pino, ya disponible en la versión usada

### Fuera de scope

- Modificar firmas de métodos de use cases, repositorios o dispatchers para recibir un logger por parámetro
- Cambios al texto, al nivel o al schema de campos estructurados de los logs existentes
- Agregar logs nuevos en lugares que hoy no logean
- Introducir un sistema de tracing distribuido (OpenTelemetry, etc.)
- Cambios en el transporte de logs (`pino-pretty` vs JSON)
- Propagar campos de contexto distintos a `requestId` (tenantId, userId, etc.)

### Edge cases

- Dos requests concurrentes en vuelo simultáneo no deben compartir ni filtrar `requestId` entre sí
- Código que cruza fronteras async (`await`, `setImmediate`, `setTimeout`, callbacks de drivers de DB) debe preservar el `requestId` del request original a lo largo de toda la cadena
- Errores anteriores al handler (fallas de parsing, validación de schema, verificación de firma de webhook) deben seguir siendo capturados por el error handler global y emitir el log con el `requestId` del request
- Logs emitidos en código compartido entre request y no-request (utilidades reusadas en arranque y en handlers) deben incluir `requestId` cuando se ejecuta dentro del request y omitirlo cuando se ejecuta fuera, sin duplicar implementación

### Technical constraints

- El contexto del request se almacena en una instancia de `AsyncLocalStorage` de `node:async_hooks`
- El store se popula en un hook `onRequest` de Fastify, envolviendo el resto del ciclo de vida del request en `asyncLocalStorage.run(...)` con `{ requestId: request.id }`
- El logger Pino estático de `shared/infrastructure/logger.ts` se configura con un `mixin` que lee el store en cada línea de log y, si existe, mergea `{ requestId }` en el output
- Cuando el store está vacío (código que corre fuera del scope de un request), el mixin retorna `{}` y `requestId` se omite, preservando el comportamiento actual

### Documentación relevante

- `duck-spec/docs/BACKEND.md` (sección **Logging strategy**, líneas 47–56): la tabla "HTTP requests → Fastify built-in logger / Non-request code → standalone pino" y la regla "inside a request use the Fastify-bound logger so the `requestId` is included automatically" quedan desactualizadas con este cambio. El paso de `ds-docs` debe refrescar ambas para reflejar que el logger estático de `shared/infrastructure/logger.ts` es ahora la única instancia, y que `requestId` se inyecta automáticamente vía un mixin Pino respaldado por `AsyncLocalStorage` cuando se ejecuta dentro del scope de un request.

### Dependencias

- SERVICES-001 — el logger Pino estático y la base Fastify deben existir

---

## SERVICES-006 — Mirror test paths under `tests/unit/modules/`

**Estado:** TODO

### Contexto

`duck-spec/docs/BACKEND.md` establece que los paths de los tests unitarios deben espejar la estructura del archivo bajo prueba: un archivo en `src/modules/<x>/...` debe testearse en `tests/unit/modules/<x>/...`. Hoy los tests de los módulos `users` y `billing` viven en `tests/unit/users/` y `tests/unit/billing/`, sin el prefijo `modules/`. La inconsistencia rompe la regla de mirroring y hace que la auditoría de cobertura por módulo no sea trivial.

### Objetivo

Que la estructura de directorios bajo `tests/unit/` espeje exactamente la estructura bajo `src/` para todos los módulos.

### Requerimientos funcionales

- Los tests unitarios del módulo `users` viven bajo `tests/unit/modules/users/`
- Los tests unitarios del módulo `billing` viven bajo `tests/unit/modules/billing/`
- Los imports relativos dentro de los tests movidos siguen resolviendo correctamente al código bajo `src/`
- La suite de tests completa pasa tras el movimiento
- Ningún test unitario fuera de `tests/unit/modules/<module>/` testea código que vive bajo `src/modules/`

### Fuera de scope

- Cambios al contenido de los tests
- Agregar tests nuevos o aumentar cobertura
- Reorganizar mocks compartidos bajo `tests/mocks/`
- Mover tests de integración (sólo se trata de los tests unitarios bajo `tests/unit/`)

### Requerimientos no funcionales

- La configuración de Jest debe seguir descubriendo y ejecutando los tests movidos sin cambios en el patrón de búsqueda (o con el ajuste mínimo si el patrón actual lo impide)
- El historial de Git debe poder seguir el move de cada archivo (renames detectables por similitud)

### Edge cases

- Imports relativos con muchos `../` deben recalcularse correctamente tras el move
- Si Jest tiene un mapeo de paths o un `rootDir` que asume la estructura vieja, debe ajustarse

### Dependencias

- SERVICES-001 — los módulos y la infraestructura de tests deben existir
