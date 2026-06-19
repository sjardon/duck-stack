# auth

Módulo de autenticación y gestión de tenants. Cubre la integración de Clerk como proveedor de identidad en el frontend (`web`) y la verificación de tokens en el backend (`services`), con soporte para Organizations (multi-tenancy opcional).

---

## AUTH-001 — Clerk Authentication Integration

**Estado:** DONE

### Contexto

Las apps `web` y `services` están scaffoldeadas (INFRA-001, WEB-001, SERVICES-001) pero no tienen autenticación. Se necesita integrar Clerk como proveedor de identidad end-to-end: componentes React en el frontend y verificación de JWT en el backend.

### Objetivo

Integrar Clerk en `web` y `services` para soportar autenticación con email + password (con verificación de email) y OAuth con Google, incluyendo Organizations para multi-tenancy opcional.

### Requerimientos funcionales

- `web`: `ClerkProvider` configurado en `main.tsx` con la clave pública de Clerk
- `web`: página `/sign-in` usando el componente `<SignIn />` de Clerk
- `web`: página `/sign-up` usando el componente `<SignUp />` de Clerk con verificación de email por código OTP
- `web`: componente `AuthGuard` (wrapper de rutas protegidas) que redirige a `/sign-in` si el usuario no está autenticado
- `web`: hook `useCurrentUser` que wrappea `useUser` de Clerk
- `web`: hook `useCurrentOrg` que wrappea `useOrganization` de Clerk
- `web`: página `/org/create` con el componente `<CreateOrganization />` de Clerk
- `web`: soporte para invitaciones de org via la UI built-in de Clerk (`<OrganizationProfile />`)
- `web`: `<UserButton />` de Clerk en el layout de la app autenticada
- `services`: plugin Fastify `clerk-auth.plugin.ts` que verifica el JWT de Clerk en el header `Authorization: Bearer <token>` y decora el request con `userId: string` y `orgId: string | null`
- `services`: preHandler `requireAuth` que retorna 401 si el request no tiene un JWT válido
- `services`: preHandler `requireOrg` que retorna 403 si `orgId` es null (guard opcional para rutas que requieren tenancy)
- Métodos de autenticación soportados: email + password con verificación de email (OTP), OAuth con Google

### Fuera de scope

- OAuth con otros providers (GitHub, Microsoft, etc.)
- MFA/2FA, magic link, passkeys
- Custom roles (se usan `admin` y `member` por defecto de Clerk)
- Edición de perfil de usuario custom (se usa la UI de Clerk)
- Panel de administración de usuarios
- `orgId` obligatorio a nivel de starter — cada proyecto decide si agrega `requireOrg` a sus rutas
- Integración de Clerk en `landing` (solo links de redirección a `/sign-in` y `/sign-up` de `web`)

### Requerimientos no funcionales

- El plugin de Fastify debe verificar el JWT localmente (sin llamada a la API de Clerk por request) usando la clave pública de Clerk
- `orgId` es nullable en el contexto del request — el starter no fuerza multi-tenancy

### Technical constraints

- Proveedor de identidad: Clerk
- `web`: `@clerk/clerk-react`
- `services`: `@clerk/fastify` o `@clerk/backend` para verificación de JWT
- Variables de entorno: `VITE_CLERK_PUBLISHABLE_KEY` en `web`, `CLERK_SECRET_KEY` en `services`

### Dependencias

- WEB-001 — la estructura base de `web` debe existir
- SERVICES-001 — la estructura base de `services` debe existir

---

## AUTH-002 — Supabase Schema & Clerk Sync

**Estado:** TODO

### Contexto

Clerk maneja la identidad, pero el producto necesita persistir datos de usuarios y organizaciones en Supabase para poder asociarles entidades de negocio. Se necesita un schema base y un mecanismo de sync automático desde Clerk.

### Objetivo

Establecer las tablas `users`, `organizations` y `organization_members` en Supabase, y mantenerlas sincronizadas con Clerk mediante un webhook endpoint en `services`.

### Requerimientos funcionales

- Setup de Supabase CLI con estructura de migraciones bajo `apps/services/supabase/migrations/`
- Tabla `users`: `id` (uuid PK), `clerk_user_id` (text, unique), `email` (text), `name` (text), `avatar_url` (text nullable), `created_at`, `updated_at`
- Tabla `organizations`: `id` (uuid PK), `clerk_org_id` (text, unique), `name` (text), `slug` (text, unique), `created_at`, `updated_at`
- Tabla `organization_members`: `user_id` (FK → users), `org_id` (FK → organizations), `role` (text), PK compuesta `(user_id, org_id)`, `created_at`
- Endpoint `POST /webhooks/clerk` en `services` que verifica la firma Svix usando `CLERK_WEBHOOK_SIGNING_SECRET`
- Handler para `user.created`: inserta o actualiza registro en `users`
- Handler para `user.updated`: actualiza `email`, `name`, `avatar_url` en `users`
- Handler para `organization.created`: inserta registro en `organizations`
- Handler para `organizationMembership.created`: inserta registro en `organization_members`
- Seeds para desarrollo local con usuarios y organizaciones de ejemplo

### Fuera de scope

- Endpoints REST de perfil de usuario (AUTH-003)
- Frontend de perfil (AUTH-003)
- Handlers para eventos de eliminación (`user.deleted`, `organization.deleted`)
- Tablas de otros dominios (billing, etc.)
- Soft delete o auditoría avanzada
- Row Level Security (RLS) de Supabase

### Requerimientos no funcionales

- El body del request en `/webhooks/clerk` debe procesarse como raw buffer (no JSON parseado) para que la verificación de firma funcione en Fastify
- El endpoint debe responder 400 si la firma es inválida y 200 si el evento fue procesado correctamente

### Technical constraints

- Migraciones: Supabase CLI
- Verificación de webhook: `verifyWebhook` de `@clerk/backend/webhooks`
- Variable de entorno adicional: `CLERK_WEBHOOK_SIGNING_SECRET` en `services`
- La ruta del webhook debe registrarse antes del plugin de JSON parsing de Fastify para preservar el raw body

### Dependencias

- AUTH-001 — Clerk debe estar integrado como proveedor de identidad
- SERVICES-001 — la estructura base de `services` debe existir

---

## AUTH-003 — User Profile

**Estado:** TODO

### Contexto

Los datos del usuario están sincronizados en Supabase (AUTH-002), pero no hay endpoints ni UI para que el usuario consulte o edite su perfil. Se necesita exponer el perfil y permitir editar las preferencias que el producto gestiona (locale, timezone).

### Objetivo

Exponer un endpoint de perfil autenticado y una página de perfil en `web` que muestre los datos del usuario y permita editar locale y timezone.

### Requerimientos funcionales

- Migración que agrega columnas `locale` (text, nullable) y `timezone` (text, nullable) a la tabla `users`
- `GET /users/me` en `services`: retorna el perfil del usuario autenticado (nombre, email, avatar_url, locale, timezone) leyendo desde Supabase por `clerk_user_id`
- `PATCH /users/me` en `services`: actualiza `locale` y/o `timezone` del usuario autenticado; retorna el perfil actualizado
- Ambos endpoints protegidos con `requireAuth`
- Página `/profile` en `web` que muestra nombre, email, avatar, locale y timezone del usuario
- Formulario en `/profile` para editar locale y timezone con feedback de guardado

### Fuera de scope

- Edición de nombre, email o avatar (lo gestiona Clerk)
- Onboarding flow y campos de segmentación (feature posterior)
- Página de perfil de organización
- Eliminación de cuenta
- Validación de valores de locale/timezone contra listas canónicas

### Requerimientos no funcionales

- `GET /users/me` debe responder en menos de 200ms
- `PATCH /users/me` debe validar con Zod que solo se envíen los campos permitidos (locale, timezone)

### Technical constraints

- Backend: Fastify + Supabase client (`@supabase/supabase-js`)
- Frontend: React Query para fetching y mutación del perfil
- Tipos compartidos: interfaz `UserProfile` en `@repo/types`

### Dependencias

- AUTH-001 — `requireAuth` y el contexto de `userId` en el request deben existir
- AUTH-002 — la tabla `users` en Supabase debe existir

---

## AUTH-004 — Onboarding

**Estado:** TODO

### Contexto

Los usuarios recién registrados entran directamente al dashboard sin haber proporcionado datos de segmentación. Se necesita interceptar ese primer acceso para capturar job_role, company_size y primary_use_case antes de permitir el acceso a la app.

### Objetivo

Capturar datos de segmentación del usuario en su primer acceso mediante una pantalla de onboarding obligatoria, y bloquearlo en `/onboarding` hasta completarla.

### Requerimientos funcionales

- Migración que agrega `job_role` (text, nullable), `company_size` (text, nullable), `primary_use_case` (text, nullable) y `onboarding_completed` (boolean, default false) a la tabla `users`
- `POST /users/me/onboarding` en `services`: recibe `job_role`, `company_size` y `primary_use_case`, los guarda y setea `onboarding_completed = true` en una sola operación; protegido con `requireAuth`
- `AuthGuard` extendido: si el usuario está autenticado pero `onboarding_completed` es false, redirige a `/onboarding`; si está en `/onboarding` y ya completó el onboarding, redirige al dashboard
- Página `/onboarding` en `web`: mensaje de bienvenida, formulario con los tres campos y botón de submit
- Al guardar exitosamente: redirige al dashboard

### Fuera de scope

- Wizard multi-step
- Resources, tutoriales o contenido de producto específico
- Edición posterior de los campos de onboarding desde `/profile`
- Re-trigger o reset del onboarding

### Requerimientos no funcionales

- `POST /users/me/onboarding` debe validar con Zod que los tres campos estén presentes y sean strings no vacíos
- El redirect al onboarding debe ocurrir antes de renderizar cualquier página protegida

### Technical constraints

- Backend: Fastify + Supabase client
- Frontend: la lógica de redirect vive en `AuthGuard`, no en las páginas individuales
- El estado de `onboarding_completed` se obtiene del mismo fetch que el perfil del usuario (`GET /users/me`)

### Dependencias

- AUTH-001 — `requireAuth` y `AuthGuard` deben existir
- AUTH-002 — la tabla `users` en Supabase debe existir
- AUTH-003 — `GET /users/me` debe exponer `onboarding_completed` para que `AuthGuard` pueda leerlo
