# subscriptions

Módulo de suscripciones y planes recurrentes. Cubre la definición de planes, la suscripción de usuarios/organizaciones a esos planes, el ciclo de vida de la suscripción (activación, renovación, fallo de pago, cancelación), el frontend de precios y upgrade, y el sistema de entitlements para gates de features. Depende del módulo `billing` para la abstracción del proveedor de pago.

---

## SUBS-001 — Subscription Plans

**Estado:** TODO

### Contexto

El producto necesita tener planes definidos con precio, intervalo de facturación y capacidades (features). Los planes son la referencia que usan tanto el checkout de suscripción como el sistema de entitlements. Deben poder referenciarse a planes existentes en el proveedor de pago (Mobbex) via una referencia externa.

### Objetivo

Crear la tabla `subscription_plans` en Supabase, sembrar los planes base (free, pro, enterprise), y exponer un endpoint público para listar los planes activos.

### Requerimientos funcionales

- Migración Supabase: tabla `subscription_plans`
  - `id` (uuid PK)
  - `name` (text not null) — nombre visible al usuario
  - `slug` (text unique not null) — identificador interno (`free`, `pro`, `enterprise`)
  - `description` (text nullable)
  - `price_monthly` (numeric not null, default 0) — precio mensual en `currency`
  - `price_yearly` (numeric nullable) — precio anual (puede ser null si solo hay mensual)
  - `currency` (text not null, default `'ars'`)
  - `interval` (text not null) — `'monthly'` | `'yearly'`
  - `provider_plan_refs` (jsonb nullable) — mapa de proveedor a referencia externa, e.g. `{ "mobbex": "plan_uid_xyz" }`
  - `features` (jsonb not null, default `'{}'`) — capacidades del plan como key-value, e.g. `{ "max_users": 5, "api_access": true }`
  - `is_active` (boolean not null, default true)
  - `sort_order` (integer not null, default 0)
  - `created_at`, `updated_at`
- Seed Supabase con tres planes base:
  - `free`: precio 0, features `{ "max_users": 1, "api_access": false }`
  - `pro`: precio mensual, features `{ "max_users": 10, "api_access": true }`
  - `enterprise`: precio mensual mayor, features `{ "max_users": -1, "api_access": true }` (-1 = ilimitado)
- `GET /subscriptions/plans` — endpoint público (sin auth), retorna planes activos ordenados por `sort_order`
- Interfaz `SubscriptionPlan` añadida a `@repo/types`

### Fuera de scope

- CRUD de planes por admin via API (los planes se gestionan via seed/migraciones en este starter)
- Trial periods
- Descuentos o cupones
- Planes con cobro por uso (usage-based pricing)

### Requerimientos no funcionales

- `GET /subscriptions/plans` debe responder en menos de 150ms
- El campo `features` debe ser opaco para el backend — la lógica de entitlements vive en SUBS-005

### Technical constraints

- Migraciones y seeds: Supabase CLI
- `@repo/types`: interfaz `SubscriptionPlan` sin deps de proveedor
- El endpoint es público; no requiere `requireAuth`

### Dependencias

- SERVICES-001 — la estructura base de `services` debe existir
- AUTH-002 — convención de migraciones Supabase CLI ya establecida

---

## SUBS-002 — Subscribe & Cancel

**Estado:** TODO

### Contexto

Con los planes definidos (SUBS-001) y el proveedor de pago en place (BILLING-001), se necesita el flujo de suscripción: el usuario elige un plan, el backend crea un checkout de suscripción en el proveedor, y la suscripción queda en estado `incomplete` hasta que el webhook confirme el primer pago. También se necesita la cancelación.

### Objetivo

Crear la tabla `subscriptions` en Supabase y exponer endpoints para suscribirse a un plan, consultar la suscripción activa y cancelar.

### Requerimientos funcionales

- Migración Supabase: tabla `subscriptions`
  - `id` (uuid PK)
  - `user_id` (uuid FK → users, not null)
  - `org_id` (uuid FK → organizations, nullable) — si la suscripción es a nivel de organización
  - `plan_id` (uuid FK → subscription_plans, not null)
  - `provider` (text not null) — proveedor que gestiona la recurrencia
  - `provider_subscription_ref` (text unique nullable) — referencia de la suscripción en el proveedor
  - `status` (text not null, default `'incomplete'`) — `incomplete | active | past_due | cancelled | expired`
  - `current_period_start` (timestamptz nullable)
  - `current_period_end` (timestamptz nullable)
  - `cancel_at_period_end` (boolean not null, default false)
  - `cancelled_at` (timestamptz nullable)
  - `created_at`, `updated_at`
- `POST /subscriptions/subscribe` (requiere `requireAuth`):
  - Body (Zod): `{ planId: string, interval: 'monthly' | 'yearly', orgId?: string }`
  - Verifica que el plan exista y esté activo; 404 si no
  - Verifica que el usuario no tenga ya una suscripción `active` o `past_due`; 409 si ya tiene una
  - Llama a `ISubscriptionProvider.subscribeCustomer()` con el `provider_plan_refs[provider]` del plan
  - Persiste fila en `subscriptions` con `status = 'incomplete'`
  - Registra también una transacción pendiente en `transactions` (BILLING-002) vinculando el checkout
  - Retorna `{ checkoutUrl: string, subscriptionId: string }`
- `GET /subscriptions/me` (requiere `requireAuth`):
  - Retorna la suscripción activa del usuario (o de su org si se pasa `orgId`) con el plan anidado
  - Si no hay suscripción activa, retorna `{ subscription: null, plan: null }`
- `POST /subscriptions/:id/cancel` (requiere `requireAuth`):
  - Verifica ownership de la suscripción; 404 si no corresponde
  - Verifica que el `status` sea `active` o `past_due`; 409 si ya está cancelada
  - Body (Zod): `{ immediately?: boolean }` — si `false` (default), `cancel_at_period_end = true`; si `true`, cancela inmediato
  - Llama a `ISubscriptionProvider.cancelSubscription(providerSubscriptionRef)` solo si `immediately = true`
  - Actualiza `cancel_at_period_end` o `status = 'cancelled'` + `cancelled_at` según corresponda
  - Retorna la suscripción actualizada
- Interfaz `Subscription` añadida a `@repo/types`

### Fuera de scope

- Cambio de plan (upgrade/downgrade) — feature posterior
- Reactivación de suscripción cancelada
- Suscripción sin checkout (plan free sin pago) — el plan free tiene `price_monthly = 0` y se asigna por seed, no por este endpoint

### Requerimientos no funcionales

- `POST /subscriptions/subscribe` debe responder en menos de 600ms
- La verificación de suscripción existente debe ser atómica para evitar duplicados bajo concurrencia
- `GET /subscriptions/me` debe responder en menos de 200ms

### Technical constraints

- Validación: Zod
- Autenticación: `requireAuth` (AUTH-001)
- El `orgId` opcional permite multi-tenancy: la suscripción puede pertenecer a una org, no solo a un user

### Dependencias

- BILLING-001 — `ISubscriptionProvider.subscribeCustomer()` debe existir
- BILLING-002 — tabla `transactions` debe existir para registrar el checkout de suscripción
- SUBS-001 — tabla `subscription_plans` debe existir

---

## SUBS-003 — Subscription Lifecycle Webhooks

**Estado:** TODO

### Contexto

El estado de la suscripción evoluciona con cada ciclo de facturación. Mobbex notifica cada intento de cobro recurrente via webhook con tipo `subscription_execution`. Se necesita un handler que procese estos eventos, actualice el estado de la suscripción, y registre cada intento en un log de pagos.

### Objetivo

Manejar los eventos de ciclo de vida de suscripciones que llegan por BILLING-003 y mantener el estado de cada suscripción en Supabase actualizado y auditable.

### Requerimientos funcionales

- Migración Supabase: tabla `subscription_payments` (log de ciclos de facturación)
  - `id` (uuid PK)
  - `subscription_id` (uuid FK → subscriptions, not null)
  - `provider_payment_id` (text unique nullable)
  - `amount` (numeric not null)
  - `currency` (text not null)
  - `status` (text not null) — `approved | failed | pending`
  - `occurred_at` (timestamptz not null)
  - `created_at`
- Consumidor del evento de dominio interno `payment.confirmed` emitido por BILLING-003:
  - Si `type === 'subscription_execution'` y `status = approved`:
    - Busca la suscripción por `provider_subscription_ref` (incluida en el payload del webhook de Mobbex en `data.subscription.uid`)
    - Actualiza `status = 'active'`, extiende `current_period_start` y `current_period_end` según el intervalo del plan
    - Inserta fila en `subscription_payments` con `status = 'approved'`
  - Si `type === 'subscription_execution'` y `status = failed`:
    - Actualiza `status = 'past_due'`
    - Inserta fila en `subscription_payments` con `status = 'failed'`
  - Si `type === 'checkout'` y la transacción es el primer pago de una suscripción (suscripción en `incomplete`):
    - Actualiza `status = 'active'`, setea `current_period_start = now()`, `current_period_end = now() + interval`
    - Guarda `provider_subscription_ref` desde el payload del webhook si Mobbex lo incluye
- Consumidor del evento de dominio interno `payment.failed` para eventos de tipo `subscription_execution`:
  - Incrementa contador lógico de fallos (puede ser en memoria o en un campo `payment_failure_count` en `subscriptions`)
  - Si el proveedor cancela automáticamente tras N fallos, el webhook de cancelación actualiza `status = 'cancelled'`
- Columnas adicionales en `subscriptions` via migración: `payment_failure_count` (integer default 0)
- Handler de evento de cancelación (si Mobbex emite un evento de cancelación de suscripción): actualiza `status = 'cancelled'`, `cancelled_at = now()`

### Fuera de scope

- Emails de notificación por pago fallido o cancelación (módulo de emails futuro)
- Reintentos manuales de cobro desde la API de este starter
- Lógica de grace period configurable

### Requerimientos no funcionales

- El handler debe ser idempotente: si el mismo `provider_payment_id` ya existe en `subscription_payments`, no insertar duplicado
- El handler de `payment.confirmed` debe actualizar la suscripción en la misma transacción de DB que inserta el `subscription_payment`

### Technical constraints

- El sistema de eventos de dominio es el `EventEmitter` interno definido en BILLING-003
- El cálculo de `current_period_end` usa la misma lógica: `+30 días` para `monthly`, `+365 días` para `yearly`
- Sin dependencias externas de cola de mensajes

### Dependencias

- BILLING-003 — eventos de dominio `payment.confirmed` y `payment.failed` deben existir
- SUBS-002 — tabla `subscriptions` debe existir

---

## SUBS-004 — Frontend: Pricing Page & Billing Settings

**Estado:** TODO

### Contexto

Los planes y el flujo de suscripción están implementados en el backend. Se necesita el frontend: una página de pricing pública en `landing`, y una sección de billing en `web` donde el usuario autenticado vea su plan actual, inicie un upgrade y consulte su historial de pagos.

### Objetivo

Agregar la página `/pricing` en `landing` y la página `/settings/billing` en `web` con el flujo de upgrade completo.

### Requerimientos funcionales

**`apps/landing`**
- Página `/pricing` con cards de planes:
  - Consume `GET /subscriptions/plans` al cargar (o datos estáticos como fallback)
  - Muestra `name`, `description`, `price_monthly` y lista de features del plan
  - CTA "Empezar" por plan: si el usuario no está autenticado, redirige a `web/sign-up?plan=<slug>`; si ya lo está, redirige a `web/settings/billing`
  - Badge "Popular" en el plan pro (o el designado por `sort_order` intermedio)

**`apps/web`**
- Hook `usePlans()` en `hooks/usePlans.ts`: `GET /subscriptions/plans` via React Query, cache de 5 minutos
- Hook `useMySubscription()` en `hooks/useMySubscription.ts`: `GET /subscriptions/me` via React Query
- Hook `useMyTransactions()` en `hooks/useMyTransactions.ts`: `GET /billing/transactions` paginado
- Página `/settings/billing`:
  - Sección "Plan actual": muestra nombre del plan, estado (`active`, `past_due`, `cancelled`) y fecha de próxima renovación si aplica
  - Si el plan es `free` o no hay suscripción activa: botón "Mejorar plan" que navega a `/settings/billing/upgrade`
  - Si hay suscripción activa: botón "Cancelar suscripción" que llama a `POST /subscriptions/:id/cancel` con confirmación modal
  - Sección "Historial de pagos": tabla con últimas 10 transacciones (fecha, descripción, monto, estado)
- Página `/settings/billing/upgrade`:
  - Lista de planes disponibles (excluye el plan actual)
  - Al seleccionar un plan y hacer click en "Suscribirse": llama a `POST /subscriptions/subscribe`, recibe `checkoutUrl` y redirige al usuario al checkout de Mobbex
  - Al volver del checkout: verifica el `status` en query param de `return_url`, muestra mensaje de éxito o error
- Tipos compartidos: `SubscriptionPlan`, `Subscription` de `@repo/types`

### Fuera de scope

- Edición de método de pago
- Facturas descargables
- Comparación visual avanzada de planes (tabla de features)
- Página de pricing en `web` (la de `landing` cubre el caso público)

### Requerimientos no funcionales

- La página `/settings/billing` debe estar protegida por `AuthGuard`
- `usePlans()` y `useMySubscription()` deben mostrar un loading skeleton mientras cargan
- El redirect al checkout de Mobbex debe ocurrir en la misma tab (no en nueva ventana)

### Technical constraints

- Data fetching: React Query (`@tanstack/react-query`)
- Tipos: `@repo/types` (`SubscriptionPlan`, `Subscription`)
- El `return_url` configurado en el checkout debe apuntar a `/settings/billing?payment=result`
- Sin librerías de UI externas adicionales — usar los primitivos existentes en `components/ui/`

### Dependencias

- SUBS-001 — `GET /subscriptions/plans` debe existir
- SUBS-002 — `GET /subscriptions/me` y `POST /subscriptions/subscribe` deben existir
- BILLING-002 — `GET /billing/transactions` debe existir
- AUTH-001 — `AuthGuard` debe existir
- AUTH-003 — la estructura de `/settings` debe existir (o crearse aquí si no existe)

---

## SUBS-005 — Subscription Entitlement Gate

**Estado:** TODO

### Contexto

Algunos features del producto solo deben estar disponibles para usuarios con un plan específico. Se necesita un sistema de entitlements que sea extensible (basado en el campo `features` JSONB del plan), con un preHandler en el backend y un hook + componente en el frontend para mostrar o bloquear features según el plan activo.

### Objetivo

Implementar `requirePlan` en `services` y `useEntitlement` + `<EntitlementGate>` en `web` para bloquear features por plan.

### Requerimientos funcionales

**`apps/services`**
- `requirePlan(featureKey: string)` — preHandler factory en `src/shared/plugins/require-plan.ts`:
  - Lee la suscripción activa del usuario (por `userId` del request) desde Supabase
  - Si no hay suscripción activa o `status !== 'active'`, responde 402 con `{ code: 'SUBSCRIPTION_REQUIRED', message: '...' }`
  - Lee `features` del plan asociado a la suscripción
  - Si `features[featureKey]` es `false`, `0`, o no existe, responde 402 con `{ code: 'PLAN_UPGRADE_REQUIRED', requiredFeature: featureKey, currentPlan: slug }`
  - Si `features[featureKey]` es truthy, llama a `next()` (el handler continúa)
- El preHandler es composable: puede usarse en conjunto con `requireAuth` en la misma ruta
- `DomainError` subclases: `SubscriptionRequiredError` y `PlanUpgradeRequiredError` con sus códigos HTTP 402

**`apps/web`**
- Hook `useEntitlement(featureKey: string)` en `hooks/useEntitlement.ts`:
  - Lee `useMySubscription()` y `usePlans()` desde cache de React Query (sin fetch adicional)
  - Retorna `{ allowed: boolean, requiredPlan: SubscriptionPlan | null, isLoading: boolean }`
  - `allowed = true` si el plan activo tiene `features[featureKey]` truthy
  - `requiredPlan` es el plan más bajo que tiene ese feature habilitado (para mostrar en el prompt de upgrade)
- Componente `<EntitlementGate feature={string} fallback={ReactNode}>` en `components/domain/EntitlementGate.tsx`:
  - Si `allowed === true`: renderiza `children`
  - Si `allowed === false`: renderiza `fallback` (por default un banner "Mejora tu plan para acceder a esta función" con link a `/settings/billing/upgrade`)
  - Si `isLoading`: renderiza skeleton neutral

### Fuera de scope

- Entitlements por cantidad (e.g., límite de `max_users` — requiere lógica de conteo extra no incluida aquí)
- Entitlements a nivel de organización (solo por usuario en este starter)
- Caching de la suscripción en el request de Fastify (optimización futura)

### Requerimientos no funcionales

- `requirePlan` debe hacer una sola query a Supabase por request (join de `subscriptions` + `subscription_plans`)
- `useEntitlement` no debe hacer fetch propio — consume el cache de `useMySubscription()` para evitar waterfalls

### Technical constraints

- El preHandler `requirePlan` requiere `requireAuth` antes en la cadena de preHandlers
- `features` es un JSONB arbitrario; la validación de su formato es responsabilidad del seed/migración, no del preHandler
- El componente `EntitlementGate` vive en `components/domain/` (conoce el dominio) no en `components/ui/`

### Dependencias

- SUBS-002 — tabla `subscriptions` y `GET /subscriptions/me` deben existir
- SUBS-001 — campo `features` en `subscription_plans` debe existir
- AUTH-001 — `requireAuth` debe preceder a `requirePlan` en la cadena
- SUBS-004 — la página `/settings/billing/upgrade` debe existir para el fallback del `EntitlementGate`
