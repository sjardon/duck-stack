# auth

Módulo de autenticación y gestión de tenants. Cubre la integración de Clerk como proveedor de identidad en el frontend (`web`) y la verificación de tokens en el backend (`services`), con soporte para Organizations (multi-tenancy opcional).

---

## AUTH-001 — Clerk Authentication Integration

**Estado:** TODO

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
