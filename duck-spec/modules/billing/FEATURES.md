# billing

Módulo de pagos y transacciones. Cubre la abstracción de proveedores de pago, el procesamiento de checkouts, el registro de transacciones y las devoluciones. Diseñado para soportar múltiples proveedores de pago mediante un patrón de puerto/adaptador. El proveedor inicial es Mobbex.

---

## BILLING-001 — Payment Provider Abstraction Layer

**Estado:** TODO

### Contexto

El producto necesita cobrar a usuarios por checkouts únicos y por suscripciones recurrentes. Antes de integrar cualquier proveedor concreto, se necesita una capa de abstracción que permita intercambiar proveedores (Mobbex, Stripe, MercadoPago, etc.) sin modificar la lógica de negocio. Esta feature establece las interfaces, el adaptador Mobbex y el factory de proveedores.

### Objetivo

Definir las interfaces de proveedor en `@repo/types`, implementar el adaptador `MobbexPaymentProvider` en `services`, y exponer un factory que retorna el proveedor activo según configuración.

### Requerimientos funcionales

- Interfaz `IPaymentProvider` en `@repo/types` con métodos:
  - `createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>`
  - `refund(transactionId: string, amount?: number): Promise<RefundResult>`
  - `getTransaction(providerTransactionId: string): Promise<TransactionResult>`
- Interfaz `ISubscriptionProvider` en `@repo/types` con métodos:
  - `createSubscriptionPlan(params: CreatePlanParams): Promise<PlanResult>`
  - `subscribeCustomer(params: SubscribeCustomerParams): Promise<SubscriptionCheckoutResult>`
  - `cancelSubscription(providerSubscriptionRef: string): Promise<void>`
- Tipos compartidos en `@repo/types`: `CreateCheckoutParams`, `CheckoutResult`, `RefundResult`, `TransactionResult`, `CreatePlanParams`, `PlanResult`, `SubscribeCustomerParams`, `SubscriptionCheckoutResult`
- `MobbexPaymentProvider` en `apps/services/src/modules/billing/providers/mobbex/` implementando `IPaymentProvider` e `ISubscriptionProvider`
  - Autenticación via headers `x-api-key` y `x-access-token` leídos de variables de entorno
  - Endpoint base: `https://api.mobbex.com/p/`
  - `createCheckout`: `POST /checkout` con `total`, `description`, `currency`, `reference`, `customer`, `webhook`, `return_url`
  - `refund`: endpoint de devolución de Mobbex
  - `getTransaction`: consulta de operación por ID
  - `createSubscriptionPlan`: crea suscripción dinámica en Mobbex
  - `subscribeCustomer`: `POST /checkout` con `items: [{ type: "subscription", reference: planRef }]`
  - `cancelSubscription`: cancela la suscripción en Mobbex
- `PaymentProviderFactory` en `apps/services/src/modules/billing/providers/factory.ts`:
  - Lee `PAYMENT_PROVIDER` de env (default: `"mobbex"`)
  - Retorna instancia singleton del proveedor correspondiente
  - Lanza error claro si el proveedor configurado no está registrado
- Variables de entorno nuevas en `services`: `PAYMENT_PROVIDER`, `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`

### Fuera de scope

- Implementación de otros adaptadores (Stripe, MercadoPago, etc.) — la interfaz los habilitará sin cambios adicionales
- Webhooks de proveedores (BILLING-003)
- Persistencia en base de datos (BILLING-002)
- UI de cualquier tipo

### Requerimientos no funcionales

- El adaptador Mobbex debe manejar errores HTTP del proveedor y relanzarlos como `DomainError` con código `PAYMENT_PROVIDER_ERROR`
- `PaymentProviderFactory` debe ser invocable múltiples veces sin crear nuevas instancias (singleton por proveedor)
- Los tipos en `@repo/types` no deben tener dependencias de ningún proveedor concreto

### Technical constraints

- Tipos de dominio: `@repo/types` (interfaces TypeScript puras, sin runtime deps)
- HTTP hacia Mobbex: `fetch` nativo en Node.js (sin librerías adicionales)
- Patrón: Port & Adapter (hexagonal)
- Variables de entorno gestionadas con la configuración existente de `services`

### Dependencias

- SERVICES-001 — la estructura base de `services` debe existir
- INFRA-001 — `@repo/types` debe existir como paquete del monorepo

---

## BILLING-002 — Checkout & Transaction Records

**Estado:** TODO

### Contexto

Con el adaptador de proveedor en place (BILLING-001), se necesita el caso de uso de checkout: iniciar un pago único desde el backend, registrar la transacción en Supabase en estado pendiente, y exponer endpoints para que el frontend pueda listar el historial de pagos.

### Objetivo

Crear la tabla `transactions` en Supabase, exponer `POST /billing/checkout` para iniciar un pago único, y `GET /billing/transactions` / `GET /billing/transactions/:id` para consultar el historial.

### Requerimientos funcionales

- Migración Supabase: tabla `transactions`
  - `id` (uuid PK)
  - `user_id` (uuid FK → users, not null)
  - `org_id` (uuid FK → organizations, nullable)
  - `provider` (text not null) — nombre del proveedor (`"mobbex"`, etc.)
  - `provider_transaction_id` (text unique nullable) — ID asignado por el proveedor al confirmar
  - `provider_checkout_id` (text unique not null) — ID del checkout creado
  - `status` (text not null, default `'pending'`) — `pending | approved | failed | cancelled | refunded | partially_refunded`
  - `amount` (numeric not null)
  - `currency` (text not null, default `'ars'`)
  - `description` (text not null)
  - `metadata` (jsonb nullable) — datos arbitrarios del contexto que originó el pago
  - `created_at`, `updated_at`
- `POST /billing/checkout` (requiere `requireAuth`):
  - Body (validado con Zod): `{ amount: number, description: string, currency?: string, metadata?: object }`
  - Genera un `reference` único (`uuid`)
  - Llama a `IPaymentProvider.createCheckout()` con datos del usuario autenticado como `customer`
  - Persiste en `transactions` con `status = 'pending'`
  - Retorna `{ checkoutUrl: string, transactionId: string }`
- `GET /billing/transactions` (requiere `requireAuth`):
  - Paginado: query params `page` (default 1) y `limit` (default 20, max 100)
  - Filtra por `user_id` del usuario autenticado (o `org_id` si `requireOrg` está activo)
  - Retorna `{ data: Transaction[], total: number, page: number }`
- `GET /billing/transactions/:id` (requiere `requireAuth`):
  - Retorna la transacción si pertenece al usuario autenticado; 404 si no existe o no es del usuario

### Fuera de scope

- Pagos de suscripciones (SUBS-002)
- Actualización de estado de transacción (BILLING-003 via webhook)
- Devoluciones (BILLING-004)
- Frontend (SUBS-004 lo cubre para el historial de pagos)

### Requerimientos no funcionales

- `POST /billing/checkout` debe responder en menos de 500ms (la llamada al proveedor domina la latencia)
- `GET /billing/transactions` debe responder en menos de 200ms
- El campo `reference` enviado al proveedor debe ser el `id` de la fila de `transactions` para poder correlacionar eventos del webhook
- Zod debe rechazar `amount <= 0`

### Technical constraints

- Migraciones: Supabase CLI
- Validación de body: Zod
- Autenticación: `requireAuth` (AUTH-001)
- Acceso a DB: cliente Supabase singleton (`shared/infrastructure/supabase.ts`)

### Dependencias

- BILLING-001 — `IPaymentProvider` y `MobbexPaymentProvider` deben existir
- AUTH-002 — tabla `users` debe existir para la FK

---

## BILLING-003 — Payment Webhooks

**Estado:** TODO

### Contexto

Mobbex (y cualquier proveedor) notifica el resultado final de un pago via webhook POST. Se necesita un endpoint que reciba estos eventos, valide su autenticidad, actualice el estado de la transacción en Supabase y emita un evento de dominio interno para que otros módulos reaccionen (ej: activar suscripción).

### Objetivo

Exponer `POST /webhooks/mobbex/payment` para recibir eventos de pago de Mobbex, actualizar el estado de la transacción correspondiente en Supabase, y emitir eventos de dominio internos.

### Requerimientos funcionales

- Endpoint `POST /webhooks/mobbex/payment` registrado antes de cualquier plugin de JSON parsing (para preservar raw body si se requiere)
- Handler de webhook extrae del payload:
  - `data.payment.id` → `provider_transaction_id`
  - `data.payment.status.code` → código de estado Mobbex
  - `data.checkout.id` → `provider_checkout_id` (para buscar la transacción en Supabase)
  - `type` → tipo de evento (`"checkout"` o `"subscription_execution"`)
- Mapeo de códigos de estado Mobbex a estado interno:
  - 200, 201, 300, 301, 302 → `approved`
  - 1, 2, 3, 100 → `pending`
  - 400–419, 500, 603 → `failed`
  - 600, 601, 610 → `cancelled`
  - 602, 605 → `refunded` / `partially_refunded`
- Busca la transacción por `provider_checkout_id`; si no existe, responde 200 (evento desconocido, ignorar)
- Si la transacción ya está en estado final (`approved`, `failed`, `cancelled`, `refunded`), ignora la actualización (idempotencia)
- Actualiza `status` y `provider_transaction_id` en la fila de `transactions`
- Emite evento de dominio interno `payment.confirmed` o `payment.failed` con `{ transactionId, providerTransactionId, type }` para que el módulo de suscripciones lo consuma
- Siempre responde HTTP 200 (Mobbex reintenta si recibe non-2xx)
- Variable de entorno `MOBBEX_WEBHOOK_SECRET` para verificación de autenticidad si Mobbex la soporta

### Fuera de scope

- Handlers de eventos de suscripción en este endpoint (delegado a SUBS-003 que se suscribe al evento de dominio)
- Webhooks de otros proveedores de pago (cada adaptador tendrá su propio endpoint)
- Notificaciones al usuario (emails, in-app) — módulo futuro

### Requerimientos no funcionales

- El endpoint debe responder en menos de 300ms
- El procesamiento del evento (actualización de DB) debe ocurrir antes de responder
- La lógica de idempotencia debe ser atómica (upsert o `WHERE status NOT IN (...)`)

### Technical constraints

- El endpoint no usa `requireAuth` (es una llamada externa del proveedor)
- El raw body debe estar disponible si se implementa verificación de firma
- El sistema de eventos de dominio interno puede ser un `EventEmitter` singleton o un simple observer pattern en `services` — sin dependencias externas de mensajería

### Dependencias

- BILLING-002 — tabla `transactions` y la FK `provider_checkout_id` deben existir
- BILLING-001 — la constante de mapeo de status codes puede vivir en el adaptador de Mobbex

---

## BILLING-004 — Refunds

**Estado:** TODO

### Contexto

Las transacciones aprobadas pueden necesitar ser devueltas total o parcialmente. Se necesita un endpoint autenticado que inicie la devolución en el proveedor y actualice el registro en Supabase.

### Objetivo

Exponer `POST /billing/transactions/:id/refund` para iniciar devoluciones totales o parciales a través del proveedor de pago activo.

### Requerimientos funcionales

- `POST /billing/transactions/:id/refund` (requiere `requireAuth`):
  - Body (Zod): `{ amount?: number, reason?: string }` — si `amount` está ausente, se devuelve el total
  - Verifica que la transacción exista y pertenezca al usuario autenticado; 404 si no
  - Verifica que el `status` sea `approved`; 409 si ya fue devuelta o está en otro estado no-reversible
  - Llama a `IPaymentProvider.refund(providerTransactionId, amount)`
  - Actualiza `status` a `refunded` (si monto total) o `partially_refunded` (si parcial)
  - Agrega columnas `refunded_amount` (numeric nullable) y `refund_reason` (text nullable) a la tabla `transactions` via migración
  - Retorna la transacción actualizada
- `requireAuth` en el endpoint — solo el dueño de la transacción puede iniciar la devolución

### Fuera de scope

- Devoluciones de suscripciones (lógica distinta, se gestiona en SUBS módulo)
- Aprobación de devoluciones por admin — solo el propietario en este starter
- Notificaciones al usuario sobre la devolución

### Requerimientos no funcionales

- Zod debe rechazar `amount` negativo o mayor al `amount` original de la transacción
- El endpoint debe responder en menos de 800ms (la llamada al proveedor puede ser lenta)

### Technical constraints

- Migración adicional sobre `transactions`: columnas `refunded_amount`, `refund_reason`
- La lógica de validación de monto máximo requiere leer la transacción antes de llamar al proveedor

### Dependencias

- BILLING-001 — `IPaymentProvider.refund()` debe estar implementado
- BILLING-002 — tabla `transactions` debe existir
- AUTH-001 — `requireAuth` debe existir
