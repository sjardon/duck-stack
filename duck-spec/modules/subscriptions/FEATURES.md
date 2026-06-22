# subscriptions

Módulo de suscripciones recurrentes. Define el catálogo de planes, gestiona el ciclo de vida de la suscripción de un usuario u organización (subscribe / cancel), procesa los webhooks de pagos recurrentes (a través del proveedor abstracto del módulo `billing`), expone la pricing page y los billing settings en el frontend, y define el gate de entitlements basado en el plan activo.

Depende del módulo `billing` para la integración con el proveedor de pago.

---

# Lista de features:

## SUBS-001 — Subscription Plans Catalog

**Estado:** TODO

### Contexto

Para vender suscripciones necesitamos un catálogo de planes que el frontend pueda renderizar (pricing page) y que el backend pueda validar al momento de suscribir. Los planes deben ser configurables sin redeploy.

### Objetivo

Definir el modelo de plan, su persistencia, los seeds iniciales (free, pro, business), y un endpoint público que liste los planes disponibles.

### Requerimientos funcionales

- Tabla Supabase `subscription_plans`: `id` (uuid PK), `code` (text unique, ej. `free`, `pro`, `business`), `name` (text), `description` (text), `price` (numeric), `currency` (text), `interval` (text: `month` | `year`), `features` (jsonb: array de strings legibles), `is_active` (boolean), `provider_plan_id` (text nullable — id del plan en el proveedor cuando aplica), `created_at`, `updated_at`
- `GET /billing/plans` (público, sin auth): devuelve los planes con `is_active = true` ordenados por `price asc`
- Seed inicial con tres planes: `free` (price 0), `pro` (price > 0), `business` (price > 0)
- Soporte para vincular un plan local con su contraparte en el proveedor mediante `provider_plan_id` (en Mobbex se crea como suscripción/uid via portal o API y se referencia en este campo)

### Fuera de scope

- Edición de planes desde una UI admin (se hace por migración / seed)
- Planes con add-ons, packs o pricing por uso (usage-based)
- Cupones / descuentos / trials con código promocional
- Planes one-shot / lifetime / con duración fija

### Requerimientos no funcionales

- El endpoint responde en menos de 200ms
- El campo `features` es un array de strings simple (sin objetos anidados) para fácil renderizado en pricing UI

### Edge cases

- Plan free con `price = 0`: el frontend lo marca como "Free" y SUBS-002 no llama al proveedor al crear la suscripción
- Plan deshabilitado (`is_active = false`): no aparece en el catálogo público, pero los usuarios ya suscriptos mantienen su suscripción

### Technical constraints

- Backend: módulo `apps/services/src/modules/subscriptions/`
- Migración Supabase con tabla y seed
- Tipos compartidos: `SubscriptionPlan` en `@repo/types`

### Dependencias

- SERVICES-001
- BILLING-001 — opcional, solo si el provisionamiento del plan en el proveedor se hiciera vía API; alcanza con dejar `provider_plan_id` que el operador completa manualmente

---

## SUBS-002 — Subscribe & Cancel Flow

**Estado:** TODO

### Contexto

Los planes existen (SUBS-001), pero los usuarios no pueden suscribirse aún. Necesitamos un flujo donde el usuario seleccione un plan, sea redirigido al checkout del proveedor para autorizar el débito automático, y al volver tenga una suscripción activa local. También debe poder cancelarla.

### Objetivo

Permitir al usuario u organización suscribirse a un plan (excluyendo `free`), persistir la suscripción local, cancelar una suscripción activa, y consultar la suscripción actual.

### Requerimientos funcionales

- Tabla Supabase `subscriptions`: `id` (uuid PK), `user_id` (FK → users, nullable), `org_id` (FK → organizations, nullable), `plan_id` (FK → subscription_plans), `provider` (text), `provider_subscription_id` (text nullable), `status` (text: `pending` | `active` | `past_due` | `canceled` | `expired`), `current_period_start` (timestamptz nullable), `current_period_end` (timestamptz nullable), `cancel_at_period_end` (boolean default false), `canceled_at` (timestamptz nullable), `created_at`, `updated_at`
- Restricción de unicidad: como máximo una suscripción no terminada (`status not in ('canceled','expired')`) por scope (`user_id, org_id`)
- `POST /billing/subscriptions` protegido con `requireAuth`: recibe `planCode`; valida que el plan existe y está activo; si el plan es `free`, crea la suscripción directamente en `active`; si no, llama al proveedor para crear la suscripción y devuelve `{ checkoutUrl, subscriptionId }`
- `POST /billing/subscriptions/:id/cancel` protegido con `requireAuth`: recibe `atPeriodEnd` (boolean, default `true`); si `true` marca `cancel_at_period_end = true`; si `false` pasa la suscripción a `canceled` y setea `canceled_at`; en ambos casos comunica al proveedor la cancelación
- `GET /billing/subscriptions/me` protegido con `requireAuth`: devuelve la suscripción activa del scope autenticado o `null` si no tiene
- Si el scope ya tiene una suscripción no terminada y se crea otra: 409 `VALIDATION_ERROR` "user/org already has an active subscription"

### Fuera de scope

- Change plan / upgrade / downgrade (feature posterior)
- Prorrateo / créditos por cancelación anticipada
- Pause / resume
- Multi-suscripción simultánea por scope
- Métodos de pago alternativos a tarjeta
- Reactivación automática después de `past_due`

### Requerimientos no funcionales

- Validación Zod de `planCode` (debe matchear un plan activo) y `atPeriodEnd` (boolean)
- El estado local converge al del proveedor mediante los webhooks de SUBS-003 — esta feature solo dispara comandos; el reflejo de eventos lo hace SUBS-003

### Edge cases

- Usuario cancela suscripción `pending` (todavía no completó checkout): se cancela localmente y se intenta cancelar en el proveedor; el caller tolera 404 del proveedor
- Suscripción al plan free: no se crea recurso en el proveedor; queda `active` con `provider_subscription_id = null`
- Usuario re-suscribe después de cancelar: si la anterior está `canceled` o `expired`, se permite crear una nueva
- Usuario abandona el checkout: la suscripción queda en `pending`; un evento webhook posterior puede activarla o no — el cleanup de pending stale queda fuera de scope

### Technical constraints

- Backend: extiende `apps/services/src/modules/subscriptions/`
- Tipos compartidos: `Subscription`, `CreateSubscriptionInput`, `CancelSubscriptionInput` en `@repo/types`

### Dependencias

- SUBS-001 — catálogo de planes
- BILLING-001 — puerto con `createSubscription` y `cancelSubscription`
- AUTH-001 — `requireAuth`

---

## SUBS-003 — Subscription Lifecycle Webhooks

**Estado:** TODO

### Contexto

Las suscripciones generan eventos recurrentes (cobro mensual, fallo de pago, suspensión) que el proveedor notifica vía webhook. El estado local de la tabla `subscriptions` debe reflejar estos eventos para mantener consistencia con el proveedor.

### Objetivo

Procesar los webhooks recurrentes de suscripciones de Mobbex y actualizar el estado de la tabla `subscriptions` con semántica idempotente, reusando la infraestructura de webhooks definida en BILLING-003.

### Requerimientos funcionales

- Reusa el endpoint `POST /webhooks/billing/mobbex` (mismo endpoint y misma verificación de secret); el dispatcher interno decide si es un evento de transacción (BILLING-003) o de suscripción
- Handlers para los eventos de suscripción:
  - `subscription.activated` / pago inicial aprobado → `status = active`, setea `current_period_start` y `current_period_end`
  - `subscription.renewed` / pago recurrente aprobado → extiende `current_period_end` y, si venía de `past_due`, vuelve a `active`
  - `subscription.payment_failed` → `status = past_due`
  - `subscription.canceled` → `status = canceled`, setea `canceled_at`
  - `subscription.expired` → `status = expired`
- Persiste el evento crudo en `billing_webhook_events` con `subscription_id` poblado cuando aplica
- Idempotencia: si el estado actual ya refleja el evento, no-op y responde 200

### Fuera de scope

- Notificación por email al usuario ante fallo de pago (feature de notifications futura)
- Dunning logic / reintentos custom (Mobbex maneja el retry; el sistema solo refleja el resultado)
- Métricas de churn / dashboards
- Recovery flow para `past_due`

### Requerimientos no funcionales

- Mismas restricciones de tiempo y logging que BILLING-003 (responde en < 5s, logging estructurado)
- Cuando el payload incluya un identificador único de evento (`event_id` de Mobbex), se chequea para idempotencia adicional persistiendo el id en `billing_webhook_events`

### Edge cases

- Llega `subscription.renewed` antes que `subscription.activated`: se acepta y se setea `status = active` igual
- Suscripción ya `canceled` localmente recibe un `payment_failed`: se loguea warning, no se cambia el estado
- El `provider_subscription_id` del evento no existe localmente: el evento se persiste con `subscription_id = null` y se loguea warning
- Llega un evento de tipo desconocido: se persiste en `billing_webhook_events` y se responde 200; no se rompe el endpoint

### Technical constraints

- Backend: extensión de `apps/services/src/modules/webhooks/mobbex/`
- Reuse de `MobbexBillingSyncRepository` extendido con `updateSubscriptionStatus`
- Mapping de event types Mobbex → handler en una tabla pequeña dentro del módulo

### Documentación relevante

- https://mobbex.dev/5aY5-suscripciones
- https://mobbex.dev/webhooks

### Dependencias

- BILLING-003 — endpoint webhook base, verificación de secret, tabla `billing_webhook_events`
- SUBS-002 — tabla `subscriptions`

---

## SUBS-004 — Pricing Page & Billing Settings UI

**Estado:** TODO

### Contexto

El backend expone el catálogo de planes (SUBS-001), el flow de suscribirse (SUBS-002) y el estado de la suscripción actual. El frontend necesita exponer estas operaciones al usuario final, tanto en la landing pública como en la app autenticada.

### Objetivo

Construir la pricing page en `landing` (público) y `web` (autenticado), una página de redirección que dispara el checkout, y una sección de billing settings en `web` que muestra la suscripción actual y permite cancelarla.

### Requerimientos funcionales

- `landing`: nueva sección `Pricing` (o página `/pricing`) que consume `GET /billing/plans` y renderiza una grilla con planes (nombre, precio, intervalo, features, CTA)
- CTA del plan en `landing` redirige a `/sign-up?next=/billing/subscribe?plan=<code>` en `web`
- `web`: página `/billing/subscribe` que, recibiendo `?plan=<code>`, dispara `POST /billing/subscriptions` y redirige al `checkoutUrl` retornado por el backend
- `web`: página `/billing` protegida con `AuthGuard` que muestra la suscripción actual (`GET /billing/subscriptions/me`): plan, status, `current_period_end`, botón "Cancelar"
- El botón "Cancelar" dispara `POST /billing/subscriptions/:id/cancel` con `atPeriodEnd = true` por default, pidiendo confirmación en un diálogo
- Estados visuales por badge: `pending`, `active`, `past_due`, `canceled` (color-coded)
- Si el usuario no tiene suscripción: la billing page muestra "You are on the free plan" + CTA hacia `/pricing` o pricing embebida

### Fuera de scope

- Dashboard de historial de transacciones (feature futura)
- Tarjeta vista (last 4 digits) — lo administra el proveedor en su portal
- Editar método de pago desde `web`
- Trial countdown UI

### Requerimientos no funcionales

- React Query para fetching de planes y suscripción actual
- Componentes de dominio en `apps/web/src/components/domain/billing/` (`PlanCard`, `SubscriptionStatusCard`, `CancelDialog`)
- Sección en `apps/landing/src/components/sections/Pricing.tsx`

### Edge cases

- Suscripción `past_due`: badge rojo + mensaje "Your last payment failed — please update your payment method" con link al portal del proveedor
- Suscripción `canceled` pero todavía dentro del período pagado: muestra "Canceled — access ends YYYY-MM-DD"
- Plan eliminado (deshabilitado) del que el usuario está suscripto: se muestra el plan igual con un label "legacy plan"
- `?plan=<code>` inválido en `/billing/subscribe`: muestra error y CTA de volver a `/pricing`

### Technical constraints

- Frontend: client API en `apps/web/src/api/billing.ts` (`listPlans`, `subscribe`, `getMySubscription`, `cancelSubscription`) y `apps/landing/src/api/plans.ts` (solo `listPlans`)
- Hooks: `usePlans`, `useMySubscription`, `useCancelSubscription`
- Tipos compartidos importados desde `@repo/types`

### Dependencias

- SUBS-001 — endpoint `GET /billing/plans`
- SUBS-002 — endpoints de subscribe / cancel / me
- AUTH-001 — `AuthGuard`, sesión y token

---

## SUBS-005 — Entitlements / Feature Gates

**Estado:** TODO

### Contexto

Con suscripciones activas (SUBS-002), el producto necesita gatear funcionalidades por plan. Sin un gate centralizado, cada feature haría su propio check, produciendo duplicación e inconsistencia.

### Objetivo

Definir un mapeo `plan.code → entitlements` y exponer un mecanismo backend (preHandler) y frontend (hook + componente) para chequear si el scope autenticado tiene acceso a una feature dada.

### Requerimientos funcionales

- Mapeo `plan.code → entitlements: string[]` definido en código (no en DB) por simplicidad
- Backend: preHandler `requireEntitlement(name: string)` que obtiene la suscripción activa del scope, resuelve los entitlements del plan, y retorna 403 `FORBIDDEN` con código `ENTITLEMENT_REQUIRED` si no incluye `name`
- Frontend: hook `useEntitlement(name: string): boolean` que consume `GET /billing/entitlements/me` (cacheado) y devuelve si el usuario tiene la entitlement
- Frontend: componente `<EntitlementGate name="...">{children}</EntitlementGate>` que renderiza children si el entitlement está presente; si no, renderiza un fallback (upgrade CTA)
- Endpoint `GET /billing/entitlements/me` protegido con `requireAuth`: devuelve el array de entitlements del scope (resuelto desde la suscripción activa o desde el plan `free` si no tiene)

### Fuera de scope

- Entitlements granulares por seat / límites de uso (usage limits)
- Trial entitlements automáticos
- Override admin manual de entitlements
- Usage metering / tracking

### Requerimientos no funcionales

- `requireEntitlement` cachea la suscripción y entitlements resueltos en el request (`request.entitlements`) para evitar múltiples queries cuando un handler chequea varios entitlements
- El mapping `plan.code → entitlements` vive en `apps/services/src/modules/subscriptions/entitlements.ts` con sus tipos exportados a `@repo/types`
- El hook frontend hace una sola request al mount y cachea el resultado en React Query con `staleTime` razonable (ej. 5 minutos)

### Edge cases

- Usuario sin suscripción: usa los entitlements del plan `free`
- Plan free no incluye el entitlement requerido: 403 + CTA visible en el frontend
- Suscripción `past_due`: por default mantiene los entitlements del plan; configurable por flag `STRICT_ENTITLEMENTS_ON_PAST_DUE` (env var, default `false`)
- Suscripción `canceled` con período aún vigente: mantiene entitlements hasta `current_period_end`

### Technical constraints

- Tipos compartidos: `EntitlementName` (string literal union) en `@repo/types`, junto al mapping plan→entitlements para que ambos lados del wire usen las mismas constantes
- El mapping plan→entitlements es source-of-truth en backend; el frontend nunca lo recalcula — solo lee el array que devuelve el endpoint

### Dependencias

- SUBS-001 — planes y sus `code`
- SUBS-002 — suscripción activa por scope
