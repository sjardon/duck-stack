# subscriptions

Módulo de suscripciones recurrentes. Define el catálogo de planes, gestiona el ciclo de vida de la suscripción de un usuario u organización (subscribe / cancel), procesa los webhooks de pagos recurrentes (a través del proveedor abstracto del módulo `billing`), expone la pricing page y los billing settings en el frontend, y define el gate de entitlements basado en el plan activo.

Depende del módulo `billing` para la integración con el proveedor de pago.

---

# Lista de features:

## SUBS-001 — Subscription Plans Catalog

**Estado:** DONE

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

**Estado:** DONE

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

**Estado:** DONE

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

**Estado:** DONE

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

---

## SUBS-006 — Plan Usage Quotas (backend)

**Estado:** DONE

### Contexto

SUBS-005 introduce gates booleanos por plan (entitlements), pero no cubre límites numéricos de uso (ej. "100 requests por mes en el plan free"). El producto necesita además contar el consumo por scope y bloquear cuando se exceda el umbral del plan, manteniendo la fuente de verdad en el backend.

### Objetivo

Trackear el uso por scope (`user_id` u `org_id`) de cuotas nombradas contra los umbrales del plan activo, bloquear los requests al alcanzar el límite duro, y exponer el uso actual para que el frontend renderice warnings y gates.

### Requerimientos funcionales

- Mapeo `plan.code → quotas: Record<string, { soft_limit: number, hard_limit: number }>` definido en código (no en DB) junto al mapping de entitlements de SUBS-005; ambos viven en `apps/services/src/modules/subscriptions/entitlements.ts`
- Tabla Supabase `usage_counters`: `id` (uuid PK), `user_id` (FK → users, nullable), `org_id` (FK → organizations, nullable), `quota_name` (text), `period_start` (timestamptz), `count` (integer default 0), `created_at`, `updated_at`; unique `(user_id, org_id, quota_name, period_start)`; check `(user_id IS NOT NULL OR org_id IS NOT NULL)`
- Suscripción sintética del plan `free`: si el scope autenticado no tiene suscripción activa al momento de ejecutar `requireQuota`, se crea perezosamente una suscripción `free` con `status = active` y `current_period_start = date_trunc('month', now())`, `current_period_end = current_period_start + 1 month`
- Backend: preHandler `requireQuota(name: string)` que (1) resuelve el scope autenticado, (2) obtiene/crea la suscripción activa, (3) lee el `current_period_start` y los thresholds del plan para `name`, (4) ejecuta un upsert atómico `INSERT … ON CONFLICT (user_id, org_id, quota_name, period_start) DO UPDATE SET count = usage_counters.count + 1, updated_at = now() RETURNING count`, (5) compara el `count` retornado con `hard_limit`; si `count > hard_limit` retorna 429 con código `QUOTA_EXCEEDED` y body `{ quota: name, count, soft_limit, hard_limit, period_end }`; en caso contrario continúa
- Si el plan no define la quota solicitada: el preHandler hace no-op (cuota ilimitada para ese plan)
- `GET /billing/quotas/me` protegido con `requireAuth`: devuelve un objeto `{ quotas: Array<{ name, count, soft_limit, hard_limit, period_start, period_end, state }> }` donde `state` ∈ `normal` | `soft_exceeded` | `hard_exceeded` resolviéndose como `count > hard_limit → hard_exceeded`, `count > soft_limit → soft_exceeded`, sino `normal`
- Renovación del período: cuando el `current_period_start` de la suscripción cambia (rollover por webhook de SUBS-003 o nuevo período de la suscripción sintética free), el siguiente `requireQuota` crea naturalmente una nueva fila al no encontrar match en el unique constraint; las filas anteriores quedan como histórico

### Fuera de scope

- Hook y componente de frontend (cubierto en SUBS-007)
- Trials y planes con duración fija (feature futura)
- Override admin manual de thresholds por usuario
- Cron / job de limpieza de filas históricas de `usage_counters` (se puede agregar después; las filas no rompen nada)
- Decrementar el contador (no hay "devoluciones" de uso)
- Quotas con ventana deslizante (ej. "100 por hora") — solo se soporta el período de la suscripción
- Notificación por email cuando se alcanza `soft_limit` o `hard_limit` (feature de notifications futura)

### Requerimientos no funcionales

- El upsert debe ser atómico bajo concurrencia: dos requests simultáneos del mismo scope no deben perder incrementos (garantizado por el unique constraint + `ON CONFLICT DO UPDATE`)
- `requireQuota` debe agregar < 20ms p95 al request handler
- `GET /billing/quotas/me` responde en menos de 200ms
- El mapping plan→quotas es source-of-truth en backend; el frontend solo lee el endpoint
- Tipos compartidos en `@repo/types`: `QuotaName` (string literal union), `QuotaThresholds`, `QuotaUsage` (la entrada del array de respuesta), `QuotaState`

### Edge cases

- Suscripción `past_due`: las quotas se evalúan contra los thresholds del plan activo (igual que las entitlements en SUBS-005 con `STRICT_ENTITLEMENTS_ON_PAST_DUE = false`)
- Suscripción `canceled` con período aún vigente: las quotas siguen aplicando hasta `current_period_end`
- Usuario downgradea a un plan con `hard_limit` más bajo que su `count` actual: queda en `hard_exceeded` inmediatamente y todos los nuevos requests reciben 429 hasta el próximo período
- Plan sin la quota solicitada: no se inserta fila, el handler continúa normalmente (uso ilimitado para ese plan)
- Scope con `user_id` y `org_id` simultáneos en el contexto de auth: se prioriza `org_id` para el conteo (la organización paga la suscripción) y `user_id` queda `null` en la fila
- Suscripción sintética free creada justo cuando el usuario completa una suscripción paga: la fila free queda como histórico; el siguiente `requireQuota` usa la suscripción paga porque es la `active` no terminada
- Race en la creación de la suscripción sintética free (dos requests concurrentes del mismo user sin sub previa): la unique constraint de `subscriptions` sobre `(user_id, org_id)` para `status not in ('canceled','expired')` (SUBS-002) hace que el segundo insert falle; el preHandler maneja el error reintentando con el SELECT

### Technical constraints

- Backend: extensión de `apps/services/src/modules/subscriptions/`
- Migración Supabase con la tabla `usage_counters` e índices `(user_id, quota_name, period_start)` y `(org_id, quota_name, period_start)`
- El upsert se ejecuta vía RPC de Supabase o query parametrizada con `@supabase/supabase-js`
- La creación lazy de la suscripción free vive en un helper `ensureActiveSubscription(scope)` reutilizable

### Dependencias

- SUBS-005 — patrón de mapping plan→config en código y resolución del plan activo
- SUBS-002 — tabla `subscriptions` con `current_period_start` y unicidad de suscripción activa por scope
- SUBS-001 — catálogo de planes con `code` (necesario para resolver el plan activo del scope)
- AUTH-001 — `requireAuth` y contexto `userId` / `orgId` en el request

---

## SUBS-007 — Quota UI Gates (frontend)

**Estado:** DONE

### Contexto

SUBS-006 expone el uso y los thresholds del scope autenticado vía `GET /billing/quotas/me`, pero no hay UI que consuma ese estado. El producto necesita esconder, deshabilitar o destacar features según el uso actual del usuario, y sugerir upgrade de plan cuando esté cerca del límite.

### Objetivo

Exponer el estado de quotas a los componentes de React mediante un hook y un componente gate, soportando estados `normal`, `soft_exceeded` y `hard_exceeded`, con CTA de upgrade contextual solo cuando el usuario no está en el plan más caro.

### Requerimientos funcionales

- Hook `useQuota(name: QuotaName): { count, soft_limit, hard_limit, state, period_end, isLoading }` que consume `GET /billing/quotas/me` (cacheado con React Query) y devuelve la entrada correspondiente a `name`; si la quota no existe en la respuesta (plan sin esa quota), devuelve `state = 'normal'` y `hard_limit = Infinity`
- Componente `<QuotaGate name="..." fallbackBlocked={...} fallbackWarning={...}>{children}</QuotaGate>`:
  - Si `state === 'hard_exceeded'`: renderiza `fallbackBlocked` (o un fallback default con mensaje "You have reached the limit of your plan" y CTA upgrade si aplica)
  - Si `state === 'soft_exceeded'`: renderiza `children` + `fallbackWarning` superpuesto o adyacente (banner/tooltip) con CTA upgrade si aplica
  - Si `state === 'normal'`: renderiza `children` sin decoración
- El check de `hard_exceeded` siempre tiene precedencia sobre `soft_exceeded` y `normal`
- CTA de upgrade: se muestra solo cuando el usuario no está en el plan de mayor `price` del catálogo (`GET /billing/plans`); el CTA redirige a `/pricing` o a `/billing/subscribe?plan=<next-plan-code>` donde `next-plan-code` es el siguiente plan más caro al actual
- Si el usuario ya está en el plan más caro y la quota está en `soft_exceeded` o `hard_exceeded`: se muestra un mensaje informativo sin CTA ("You are on our highest plan — contact us for custom limits")

### Fuera de scope

- Enforcement del lado del servidor (lo hace SUBS-006)
- Componente visual de medidor de uso (`<QuotaMeter />` tipo barra de progreso) — puede agregarse después
- Custom fallback con render-prop avanzado (los consumers pasan ReactNode simple)
- Animaciones / transiciones de estado
- Polling en tiempo real del uso (se refresca por `staleTime` de React Query o invalidación manual tras mutaciones)
- Toast / notificación al cambiar de `normal` → `soft_exceeded` durante una sesión

### Requerimientos no funcionales

- React Query con `staleTime` razonable (ej. 60s) y refetch on window focus
- Una sola request a `GET /billing/quotas/me` por sesión es compartida por todas las instancias de `useQuota` y `<QuotaGate>` mediante el query key común
- Tipos compartidos importados de `@repo/types` (`QuotaName`, `QuotaUsage`, `QuotaState`)
- El cálculo de "next plan" se hace en el frontend ordenando los planes por `price asc` y eligiendo el primero con `price > currentPlan.price`

### Edge cases

- Loading inicial: el hook devuelve `isLoading = true` y `state = 'normal'` para no bloquear el árbol durante el primer fetch; los consumers pueden decidir mostrar un skeleton si lo necesitan
- Usuario sin suscripción (race con la creación lazy de la suscripción free): el endpoint igual devuelve el array de quotas con la suscripción free recién creada; el hook funciona transparente
- Plan del usuario eliminado del catálogo (deshabilitado) y sin sucesor de mayor `price`: se trata como "plan más caro" y se oculta el CTA de upgrade
- `period_end` ya pasó pero el counter aún no rolloveó porque no se hicieron requests nuevos: el frontend muestra el estado tal como lo devuelve el backend
- Mutación que consume quota (ej. un `POST` que el backend cuenta): el consumer debe invalidar `GET /billing/quotas/me` para reflejar el nuevo conteo; el componente expone un helper `useInvalidateQuotas()` para esto

### Technical constraints

- Frontend: `apps/web/src/components/domain/billing/QuotaGate.tsx`, hook en `apps/web/src/hooks/useQuota.ts`
- Client API en `apps/web/src/api/billing.ts`: extender con `getMyQuotas()`
- El catálogo de planes ya está disponible vía `usePlans()` (SUBS-004) — se reusa para resolver "next plan"

### Dependencias

- SUBS-006 — endpoint `GET /billing/quotas/me` y tipos `QuotaName` / `QuotaUsage` / `QuotaState`
- SUBS-004 — `usePlans` y client API de billing
- SUBS-001 — catálogo de planes ordenado por `price` para resolver "next plan"
- AUTH-001 — sesión autenticada para que el endpoint resuelva el scope

---

## SUBS-008 — Free Trial Mode (backend)

**Estado:** DONE

### Contexto

SUBS-006 cubre el modo freemium: los usuarios nuevos caen perezosamente a una suscripción `free` permanente. El starter pack además necesita soportar el modelo alternativo "free trial": todo usuario nuevo arranca con un período de prueba del plan más caro, y al expirar debe elegir un plan explícitamente para seguir usando la app. El operador que adopta el starter elige uno de los dos modelos vía configuración; no coexisten para un mismo proyecto.

### Objetivo

Introducir el modo `free_trial` al starter pack: al hacer signup, el usuario recibe automáticamente una suscripción `trialing` del plan más caro del catálogo, con duración configurable. Al expirar el trial, el acceso a rutas protegidas queda bloqueado hasta que el usuario elija un plan explícitamente (incluyendo "free" si está en el catálogo).

### Requerimientos funcionales

- Variables de entorno: `SIGNUP_MODE` (`freemium` | `free_trial`, default `freemium`) y `FREE_TRIAL_DAYS` (integer, default `14`)
- Migración: agrega `trialing` al CHECK constraint de `subscriptions.status` y la columna `trial_ends_at` (timestamptz nullable)
- En modo `free_trial`, el handler de `user.created` (extendido de AUTH-002) crea una suscripción inmediatamente con: `status = trialing`, `plan_id = <plan con price máximo entre los is_active = true>`, `trial_ends_at = now() + FREE_TRIAL_DAYS days`, `current_period_start = now()`, `current_period_end = trial_ends_at`
- En modo `freemium`, el handler de `user.created` no crea suscripción (mantiene el comportamiento actual; SUBS-006 maneja la creación lazy de free)
- Transición lazy `trialing` → `expired`: al resolver la suscripción activa de un scope (en cualquier preHandler o endpoint que la lea), si `status = trialing` y `trial_ends_at < now()`, se actualiza a `expired` en la misma operación
- PreHandler `requireActiveSubscription` que retorna 403 con código `TRIAL_EXPIRED` y body `{ trialEndedAt }` cuando (1) el modo es `free_trial`, (2) la última suscripción del scope está `expired`, (3) no existe otra suscripción `active` ni `trialing` para el scope
- `requireActiveSubscription` se aplica como guard global a las rutas autenticadas excepto: rutas bajo `/billing/*` (para permitir suscribirse), endpoints de catálogo público (`GET /billing/plans`), y los webhooks
- En modo `free_trial`, la creación lazy de suscripción free de SUBS-006 queda desactivada: el preHandler `requireActiveSubscription` bloquea antes. SUBS-006 sigue operando normalmente para usuarios que sí tienen suscripción (de cualquier plan)
- `GET /billing/subscriptions/me` (de SUBS-002) extendido: cuando la suscripción está `trialing`, incluye `trial_ends_at` y `days_remaining` (integer, días enteros desde `now()` hasta `trial_ends_at`, mínimo 0) en la respuesta

### Fuera de scope

- UI del frontend (cubierto en SUBS-009)
- Trial vía cupón / link especial / coupon code
- Trial con tarjeta requerida y cobro automático al final
- Trial de múltiples planes o elegible por usuario
- Email "your trial expires in N days" (módulo notifications futuro)
- Re-trial bajo cualquier flujo: el trial solo se dispara una vez, en el primer `user.created` de Clerk para ese usuario
- Modificar el comportamiento del modo freemium o el comportamiento de SUBS-006 cuando hay sub activa
- Acortar / extender el trial desde admin
- Backfill retroactivo de trial para usuarios existentes al cambiar el modo

### Requerimientos no funcionales

- La creación de la suscripción `trialing` debe ser idempotente respecto del webhook `user.created` (si Clerk reintenta, no se crean dos suscripciones); se apoya en la unique constraint de SUBS-002 sobre suscripciones no terminadas por scope
- El cálculo del "plan más caro" se hace en runtime al procesar el webhook, sin caché, tomando el plan con mayor `price` entre los `is_active = true`
- Si en modo `free_trial` no hay planes con `is_active = true` y `price > 0`, se loguea un error y la creación del trial falla silenciosamente; el usuario queda sin suscripción y será bloqueado por `requireActiveSubscription` en el primer request protegido
- La transición lazy `trialing → expired` debe ser segura ante concurrencia: el UPDATE filtra por `status = 'trialing'` para garantizar una única transición efectiva
- Tipos compartidos en `@repo/types`: `SubscriptionStatus` extendido con `trialing`, `Subscription` con `trial_ends_at` y `days_remaining` opcionales

### Edge cases

- Trial expira mientras el usuario está navegando: el siguiente request protegido dispara la transición lazy y retorna 403 `TRIAL_EXPIRED`; el frontend (SUBS-009) redirige a `/trial-expired`
- Operador cambia `SIGNUP_MODE` de `freemium` a `free_trial` con usuarios existentes: los usuarios viejos no reciben trial retroactivo; solo los nuevos signups posteriores al cambio
- Operador cambia `SIGNUP_MODE` de `free_trial` a `freemium`: los trials en curso siguen su curso natural hasta expirar; los nuevos signups caen al flujo freemium
- Usuario en trial hace `POST /billing/subscriptions` para suscribirse a un plan pago antes del fin del trial: el trial se cancela (status `canceled`) y se crea la nueva suscripción según SUBS-002
- Usuario en trial expirado entra a `/billing/*` (única área no bloqueada): puede ver su suscripción y elegir un plan
- Plan más caro deshabilitado (`is_active = false`) después de que un usuario está en trial: el trial sigue su curso normal con el plan asignado al inicio
- Trial con `trial_ends_at` exactamente en `now()`: se considera expirado (comparación estricta `trial_ends_at < now()`)
- Race en la creación del trial (dos webhooks `user.created` concurrentes para el mismo user): la unique constraint de SUBS-002 hace fallar al segundo; el handler captura y devuelve 200 (idempotencia)

### Technical constraints

- Backend: extensión del handler de Clerk webhook en `apps/services/src/modules/webhooks/clerk/`
- Backend: nuevo preHandler en `apps/services/src/modules/subscriptions/`
- Migración Supabase que actualiza el CHECK de `subscriptions.status` y agrega `trial_ends_at`
- Helper `ensureActiveSubscription` (introducido en SUBS-006) extendido para ser mode-aware

### Dependencias

- SUBS-002 — tabla `subscriptions`, status enum, endpoint `/billing/subscriptions/me`
- SUBS-006 — coordinación con la creación lazy de suscripción (el helper `ensureActiveSubscription` se vuelve mode-aware)
- AUTH-002 — handler del webhook `user.created` de Clerk donde se engancha la creación del trial
- AUTH-001 — `requireAuth` y contexto del request

---

## SUBS-009 — Trial UI Gates (frontend)

**Estado:** DONE

### Contexto

SUBS-008 introduce el modo trial en el backend: crea automáticamente la suscripción al signup, expone `trial_ends_at`, y bloquea con 403 `TRIAL_EXPIRED` cuando el trial expira. El frontend necesita reflejar este estado al usuario: mostrar urgencia cuando el trial está por terminar y, al expirar, presentarle una pantalla clara de elección de plan.

### Objetivo

Exponer el estado del trial en la app autenticada mediante un banner de urgencia en los últimos 3 días, y forzar una elección de plan cuando el trial expira mediante una página dedicada y la integración con el `AuthGuard`.

### Requerimientos funcionales

- Hook `useTrialStatus()` que consume `GET /billing/subscriptions/me` (cacheado vía React Query, query key compartido con `useMySubscription`) y devuelve `{ isTrialing: boolean, daysRemaining: number | null, trialEndsAt: string | null, isExpired: boolean }`; `isExpired` es `true` cuando la respuesta indica `status = expired` y no hay otra sub activa
- Componente `<TrialBanner />` integrado en el `AuthenticatedLayout`: renderiza una barra superior con "X days left in your trial — upgrade now" y CTA a `/pricing` solo cuando `isTrialing && daysRemaining <= 3`; en otros casos no renderiza nada
- Página `/trial-expired` en `web`: muestra título "Your free trial has ended", lista de planes (consume `GET /billing/plans`, reutiliza `<PlanCard />` de SUBS-004), y un botón "Continue with free" cuando el plan free existe en el catálogo (dispara `POST /billing/subscriptions` con `planCode = 'free'` y al éxito redirige al dashboard)
- `AuthGuard` extendido: si `useTrialStatus().isExpired === true`, redirige a `/trial-expired` desde cualquier ruta protegida; quedan accesibles `/pricing`, `/billing`, `/billing/subscribe`, `/trial-expired` para permitir la elección de plan
- Interceptor del client API: si cualquier endpoint responde 403 con código `TRIAL_EXPIRED`, redirige a `/trial-expired` (fallback por si el `AuthGuard` aún no detectó el cambio)

### Fuera de scope

- Backend enforcement (cubierto en SUBS-008)
- Banner customizable por consumer (color, copy, posición)
- Countdown en tiempo real con segundos (solo días enteros, redondeo abajo)
- Modal de bienvenida al trial, onboarding del trial, tour de features premium
- Encuesta o feedback de cancelación al expirar el trial
- Banner alternativo para `daysRemaining > 3` (intencional: no se muestra durante el período "exploratorio")
- Notificación in-app del cambio de estado en tiempo real (websockets)

### Requerimientos no funcionales

- React Query con `staleTime` razonable (ej. 60s) y refetch on window focus; comparte query key con `useMySubscription` (SUBS-004) para una sola fuente de verdad de la suscripción del usuario
- `<TrialBanner />` debe ser purely additive: no debe causar layout shift cuando aparece (reservar espacio en CSS o usar posición sticky/fixed)
- Tipos compartidos importados desde `@repo/types` (`SubscriptionStatus`, `Subscription` con campos extendidos de SUBS-008)

### Edge cases

- Loading inicial: el hook devuelve `isExpired = false` e `isTrialing = false` hasta que llega la respuesta; el `AuthGuard` no redirige durante loading
- Trial expira mientras el usuario está navegando: el siguiente refetch (on focus o invalidación) actualiza el estado y el `AuthGuard` redirige; alternativamente, el 403 `TRIAL_EXPIRED` del backend dispara la redirección inmediata vía interceptor
- Usuario está en `/trial-expired` y completa una suscripción exitosa: la mutación invalida `getMySubscription`, `isExpired` pasa a `false`, y se redirige al dashboard
- Plan free no existe en el catálogo (operador lo eliminó intencionalmente): la opción "Continue with free" no se renderiza, solo se muestran los planes pagos
- Usuario con trial expirado pero ya con una suscripción `active` (edge case: signup, trial, subscribe paid, cancel paid, expire trial registro viejo): `isExpired = false` porque hay sub activa; no se redirige
- `daysRemaining` cae a 0 pero `trial_ends_at` todavía no pasó: el banner muestra "Less than 1 day left in your trial — upgrade now"

### Technical constraints

- Frontend: `apps/web/src/components/domain/billing/TrialBanner.tsx`, hook `apps/web/src/hooks/useTrialStatus.ts`, página `apps/web/src/pages/TrialExpired.tsx`
- `AuthGuard` extendido en `apps/web/src/components/auth/AuthGuard.tsx`
- Interceptor de respuestas 403 `TRIAL_EXPIRED` en el cliente HTTP global (`apps/web/src/api/client.ts`)

### Dependencias

- SUBS-008 — endpoint `/billing/subscriptions/me` con `trial_ends_at` y `days_remaining`, código de error `TRIAL_EXPIRED`
- SUBS-004 — componente `<PlanCard />`, hook `usePlans`, página `/pricing` y `/billing/subscribe`
- SUBS-002 — endpoint `POST /billing/subscriptions` (necesario para "Continue with free")
- AUTH-001 — `AuthGuard` y la sesión autenticada

---

## SUBS-010 — Variable-Cost Quota Strategies (backend)

**Estado:** TODO

### Contexto

SUBS-006 modela las quotas como un contador que se incrementa en `+1` por cada request bajo `requireQuota`. En la práctica, muchos servicios consumen cantidades variables por operación: una llamada a un endpoint de generación de texto consume N tokens, un upload consume M bytes, un envío de email consume tantas unidades como recipients tenga. El modelo actual no soporta esto: o se subdimensiona el costo (un upload de 1GB cuenta igual que uno de 1KB), o se cuenta una sola unidad por request perdiendo la fidelidad del consumo real.

Además, algunos costos solo se conocen *después* de ejecutar el handler (ej. tokens consumidos por un LLM se determinan al recibir la respuesta del modelo), lo cual no encaja en el patrón actual de "check + increment atómico antes del handler".

### Objetivo

Extender SUBS-006 con un registro de estrategias por quota que permita (1) calcular el costo a partir del request (modo `pre`, costo conocido antes del handler), o (2) reservar un costo conservador antes del handler y reconciliar contra el costo real una vez ejecutado (modo `post`), preservando la idempotencia y la atomicidad bajo concurrencia.

### Requerimientos funcionales

- Nuevo mapeo `quota_name → QuotaStrategy` en `apps/services/src/modules/subscriptions/entitlements.ts` junto al mapping de thresholds de SUBS-006, con la forma:
  ```ts
  type QuotaStrategy = {
    unit: string;                              // ej. 'request', 'token', 'byte', 'recipient'
    mode: 'pre' | 'post';
    compute: (req: FastifyRequest) => number;  // pre: costo real | post: cota superior (reserva)
  }
  ```
- Si una `quota_name` no tiene estrategia registrada, se asume el default `{ unit: 'request', mode: 'pre', compute: () => 1 }` (preserva el comportamiento legacy de SUBS-006)
- El preHandler `requireQuota(name)` de SUBS-006 se extiende:
  - Resuelve la estrategia de `name`
  - Llama a `compute(request)` para obtener el costo (modo `pre`) o la reserva (modo `post`)
  - Ejecuta el upsert atómico de SUBS-006 sumando ese valor en lugar de `1`
  - En modo `post`, persiste la reserva en `request.quotaReservations[name] = { reserved: number, charged: number }` (con `charged = reserved` inicialmente) para que el handler pueda reconciliar después
- Nuevo helper exportado `chargeQuota(request, name, actual: number)` invocable desde el handler en modo `post`:
  - Lee `request.quotaReservations[name]`; si no existe (no hubo `requireQuota` previo para esa quota), lanza error de programación
  - Calcula `delta = actual - reservation.charged`
  - Si `delta !== 0`, ejecuta un UPDATE atómico `count = count + delta` sobre la misma fila `(scope, quota_name, period_start)` resuelta por el preHandler
  - Actualiza `reservation.charged = actual`
- Llamadas adicionales a `chargeQuota` para la misma quota dentro del mismo request son aceptadas y aplican el delta correspondiente sobre el último `charged` (soporta charging incremental durante el handler)
- Si el handler no llama a `chargeQuota` en modo `post`, la reserva queda como costo final (worst-case)
- Llamar `chargeQuota` con `actual` tal que el `count` resultante exceda `hard_limit` está permitido: el request ya pasó la verificación del preHandler, no se puede rechazar mid-handler; se loguea warning y el `count` puede quedar por encima de `hard_limit`
- `GET /billing/quotas/me` (de SUBS-006) extendido con el campo `unit` en cada entrada del array de quotas, leído de la estrategia

### Fuera de scope

- Persistir reservas en DB con un `reservation_id` (la reserva vive en memoria del request; si el proceso crashea entre preHandler y `chargeQuota`, la reserva queda como costo final — aceptable por simplicidad)
- Refund automático cuando el handler tira excepción: si el handler falla, la reserva queda contabilizada igual; el dev puede invocar explícitamente `chargeQuota(request, name, 0)` en un error handler si necesita refund completo
- Estrategias dinámicas por plan (la estrategia es intrínseca a la quota, no varía por plan; lo que varía por plan son los thresholds en SUBS-006)
- Métricas / alertas de reservas no reconciliadas (puede agregarse después con un middleware de logging)
- Costo dependiente del tiempo o del estado externo (la estrategia recibe solo el `request`, no el wall clock ni otros servicios)
- Reservation pooling entre requests (cada request reserva independientemente)
- Rollback del incremento cuando el preHandler retorna 429: se mantiene la semántica de SUBS-006 (el `count` refleja intentos, no operaciones exitosas)

### Requerimientos no funcionales

- El registro de estrategias en `entitlements.ts` es type-safe: `QuotaName` (union de SUBS-006) actúa como key obligatoria del mapping para evitar quotas sin estrategia ni default desactualizado
- `chargeQuota` no debe leer la fila antes de actualizar: el UPDATE atómico con `count = count + :delta` garantiza la consistencia
- Modo `pre` no agrega latencia respecto de SUBS-006 (sigue siendo 1 query por request bajo `requireQuota`)
- Modo `post` agrega exactamente 1 query adicional por request (la reconciliación), aceptable solo para quotas donde el costo no es conocible antes del handler
- Tipos compartidos en `@repo/types`: `QuotaStrategy`, `QuotaMode` (`'pre' | 'post'`), `QuotaUnit` (string literal union de las units soportadas); `QuotaUsage` (de SUBS-006) extendido con `unit`

### Edge cases

- Estrategia con `compute(req)` que retorna `0`: el preHandler no hace upsert (skip silencioso) y no decora `request.quotaReservations`; útil para requests gratuitos dentro de un endpoint quoteable
- Estrategia con `compute(req)` que retorna negativo o no entero: se trata como error de programación, se lanza `ValidationError` antes de tocar la DB
- Reserva en modo `post` que excede el `hard_limit` por sí sola (ej. `compute(req)` devuelve `hard_limit + 1` para un upload gigante): el preHandler rechaza con 429 `QUOTA_EXCEEDED` antes de entrar al handler, igual que en SUBS-006
- Handler en modo `post` llama `chargeQuota` con `actual < 0`: se lanza `ValidationError`
- Handler en modo `post` no llama `chargeQuota` (olvido del dev, early return, branch sin charge): la reserva queda como costo final; el dev que olvida `chargeQuota` infla el contador con el worst-case, visible en `GET /billing/quotas/me` y detectable en review
- `chargeQuota` invocado para una quota cuya estrategia es `mode: 'pre'`: se lanza error de programación (`chargeQuota` solo aplica a modo `post`)
- Cambio de estrategia de `pre` a `post` (o viceversa) para una quota existente: los counters históricos siguen siendo válidos (representan unidades totales consumidas, no requests); los thresholds del plan pueden necesitar revisión por parte del operador
- Quota con `mode: 'post'` consultada vía `GET /billing/quotas/me` durante un request en vuelo: el `count` reportado refleja la reserva (o el último `charged`), no necesariamente el `actual` final; consistente con el contrato del endpoint (snapshot del estado persistido)
- Múltiples quotas distintas con modo `post` en el mismo request: cada una se reconcilia independientemente vía su propia entrada en `request.quotaReservations`

### Technical constraints

- Backend: extensión de `apps/services/src/modules/subscriptions/entitlements.ts` (mapping de estrategias) y del preHandler `requireQuota` introducido en SUBS-006
- `chargeQuota` se exporta desde el mismo módulo de subscriptions y se importa explícitamente en los handlers que usan modo `post`
- La reserva vive en `request.quotaReservations` (decorado en el preHandler vía `fastify.decorateRequest`), con tipos en el module augmentation de `FastifyRequest`
- El UPDATE de `chargeQuota` reusa la misma conexión / pool que SUBS-006 y la misma fila identificada por `(scope, quota_name, period_start)`

### Dependencias

- SUBS-006 — preHandler `requireQuota`, tabla `usage_counters`, endpoint `GET /billing/quotas/me`, mapping de thresholds
- SUBS-005 — patrón de mapping en `entitlements.ts` y tipos compartidos
