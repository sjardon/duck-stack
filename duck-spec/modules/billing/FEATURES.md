# billing

Módulo de billing. Abstrae proveedores de pago y maneja transacciones one-off (checkout, refunds, webhooks). Soporta múltiples proveedores mediante un puerto (port/adapter); el adaptador inicial es **Mobbex**. Las suscripciones recurrentes viven en el módulo `subscriptions` pero consumen este módulo para la integración con el proveedor.

---

# Lista de features:

## BILLING-001 — Payment Provider Abstraction & Mobbex Adapter

**Estado:** TODO

### Contexto

El proyecto no tiene capacidad de cobro. Para soportar SaaS necesitamos procesar pagos. El producto debe poder cambiar de proveedor (Mobbex, Stripe, MercadoPago, etc.) sin reescribir lógica de negocio. Primer proveedor: Mobbex (foco Argentina/LATAM).

### Objetivo

Definir un puerto (interfaz) de proveedor de pago independiente de Mobbex e implementar el adaptador Mobbex como primer proveedor. El resto del sistema interactúa solo con el puerto.

### Requerimientos funcionales

- Existe un puerto `PaymentProvider` que expone operaciones para: crear una sesión de checkout (pago one-off), consultar el estado de una transacción, crear una suscripción recurrente, cancelar una suscripción, y verificar un webhook entrante
- Un selector configurable elige el proveedor activo al arranque mediante variable de entorno `BILLING_PROVIDER` (default `mobbex`)
- Existe un adaptador concreto `MobbexProvider` que implementa el puerto contra la API de Mobbex
- El adaptador autentica todas las llamadas con los headers `X-API-Key` y `X-Access-Token`
- Soporte de modo test/sandbox controlado por variable de entorno `MOBBEX_TEST_MODE`
- El sistema falla al arranque si `BILLING_PROVIDER` apunta a un proveedor no implementado o si faltan credenciales del proveedor seleccionado

### Fuera de scope

- Implementación de otros proveedores (Stripe, MercadoPago, PayPal)
- Persistencia de transacciones (BILLING-002)
- Webhooks (BILLING-003)
- Refunds (BILLING-004)
- Suscripciones (módulo `subscriptions`)
- Multi-currency switcher para el usuario final
- Tokenización de tarjetas en el frontend (`Wallet Transparent`)

### Requerimientos no funcionales

- Las credenciales del proveedor nunca se exponen al frontend
- Errores del proveedor se mapean a una clase de dominio `ProviderError` con `statusCode 502` cuando son transitorios y `400` cuando son de validación
- Las llamadas a la API del proveedor tienen timeout configurable (default 10s) para no bloquear el thread del request
- El método `verifyWebhook` del puerto recibe el body raw y los headers del request, y retorna un objeto canonicalizado `WebhookEvent` (type + data) que el caller usa para despachar

### Edge cases

- El proveedor está caído o responde 5xx → el adaptador retorna `ProviderError` y el caller decide reintentar
- Las credenciales son inválidas → 401 desde el proveedor mapea a `ProviderError`
- Mobbex no tiene firma criptográfica nativa de webhooks: la verificación se hace por un token compartido en query (`?secret=...`) y, opcionalmente, whitelist de IP — esta limitación debe documentarse en el SPEC del módulo
- Cambiar `BILLING_PROVIDER` en runtime no está permitido — solo en boot

### Technical constraints

- Backend: nuevo módulo `apps/services/src/modules/billing/` con submódulo `providers/` para los adaptadores
- Tipos compartidos: interfaces `PaymentProvider`, `Money`, `CheckoutInput`, `CheckoutSession`, `TransactionStatus`, `WebhookEvent` en `@repo/types`
- Variables de entorno: `BILLING_PROVIDER`, `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_TEST_MODE`, `MOBBEX_WEBHOOK_SECRET`

### Documentación relevante

- https://mobbex.dev/
- https://mobbex.dev/primeros-pasos
- https://mobbex.dev/webhooks
- https://mobbex.dev/5aY5-suscripciones
- `duck-spec/docs/BACKEND.md` — convenciones de módulos y plugins

### Dependencias

- SERVICES-001 — la estructura base de `services` debe existir

---

## BILLING-002 — Checkout & Transaction Records

**Estado:** TODO

### Contexto

Con el proveedor abstracto disponible (BILLING-001), el sistema puede generar sesiones de pago, pero no las persiste ni las asocia a usuarios u organizaciones. Necesitamos un registro local de transacciones para auditoría, idempotencia y consulta histórica.

### Objetivo

Permitir que el frontend dispare un checkout one-off asociado al usuario u organización autenticado, persistir el registro local con su estado, y exponer endpoints de consulta.

### Requerimientos funcionales

- Tabla Supabase `transactions`: `id` (uuid PK), `user_id` (FK → users, nullable), `org_id` (FK → organizations, nullable), `provider` (text), `provider_transaction_id` (text nullable), `amount` (numeric), `currency` (text), `status` (text: `pending` | `approved` | `failed` | `refunded`), `description` (text), `reference` (text unique), `metadata` (jsonb), `failure_reason` (text nullable), `created_at`, `updated_at`
- `POST /billing/checkout` protegido con `requireAuth`: recibe `amount`, `currency`, `description`, `items` (opcional), `metadata` (opcional); crea registro `transactions` en estado `pending`, llama al proveedor para crear la sesión y devuelve `{ checkoutUrl, transactionId }`
- `GET /billing/transactions/:id` protegido con `requireAuth`: devuelve la transacción local; 404 si no existe; 403 si pertenece a otro usuario/org
- `GET /billing/transactions` protegido con `requireAuth`: lista paginada de transacciones del usuario/org autenticado, orden `created_at desc`
- El `reference` enviado al proveedor coincide con el `id` de la transacción local (idempotency key end-to-end)
- El `checkoutUrl` retornado redirige al usuario a la UI del proveedor

### Fuera de scope

- Actualización del estado de la transacción desde webhook (BILLING-003)
- Refunds (BILLING-004)
- Suscripciones (módulo `subscriptions`)
- Listado/exportación admin de transacciones (dashboard interno)
- Multi-currency conversion

### Requerimientos no funcionales

- Validación con Zod de todos los inputs (`amount > 0`, `currency` en whitelist `ARS|USD`, `description` no vacío)
- Listado paginado con `limit` (default 20, max 100) y `cursor`
- El insert local de `transactions` precede a la llamada al proveedor; si la llamada al proveedor falla, la transacción queda en `pending` con `failure_reason` poblado

### Edge cases

- POST duplicado por timeout/click: idempotencia opcional por header `Idempotency-Key` — si está presente y existe una transacción con esa key, se devuelve la existente
- Usuario navega fuera durante el checkout: la transacción queda en `pending` hasta que llegue el webhook
- `org_id` opcional: si el JWT trae `orgId`, se asocia a la org; si no, solo al user

### Technical constraints

- Backend: módulo `apps/services/src/modules/billing/` — `routes.ts`, `repository.ts`, `service.ts`
- Frontend: client en `apps/web/src/api/billing.ts` con `createCheckout`, `getTransaction`, `listTransactions`
- Tipos compartidos: `Transaction`, `CreateCheckoutInput`, `TransactionListResponse` en `@repo/types`
- Migración Supabase en `apps/services/supabase/migrations/`

### Dependencias

- BILLING-001 — puerto + adaptador Mobbex
- AUTH-001 — `requireAuth`
- AUTH-002 — tablas `users` y `organizations`

---

## BILLING-003 — Payment Webhooks

**Estado:** TODO

### Contexto

Las transacciones quedan en `pending` tras el checkout (BILLING-002) hasta recibir el resultado del proveedor. Mobbex notifica vía webhook el resultado del pago. Necesitamos un endpoint que reciba estos eventos y actualice el estado local de manera idempotente.

### Objetivo

Exponer un endpoint webhook seguro que reciba notificaciones de transacciones desde Mobbex, valide su autenticidad, y actualice el estado en la tabla `transactions` con semántica idempotente. Persistir además el evento crudo para auditoría.

### Requerimientos funcionales

- Endpoint `POST /webhooks/billing/mobbex` registrado como módulo de webhook, NO sujeto al plugin `clerk-auth`
- Verificación de autenticidad mediante un `secret` compartido en query (`?secret=...`) que matchea `MOBBEX_WEBHOOK_SECRET`; rechaza con 401 si no coincide
- El body se procesa como raw buffer (scoped `addContentTypeParser`) y se parsea como JSON dentro del handler
- Handler para eventos de transacción de checkout (`payment.success`, `payment.failure` o equivalentes en la nomenclatura de Mobbex): actualiza `transactions.status` a `approved` o `failed` localizando por `provider_transaction_id` o `reference`
- Si la transacción no existe localmente, loguea warning y responde 200 (no falla — el evento puede haber llegado primero por race)
- Idempotencia: si el estado actual ya iguala al que el evento intenta setear, no-op y responde 200
- Persiste el evento crudo en una tabla `billing_webhook_events` (`id` uuid PK, `provider` text, `event_type` text, `payload` jsonb, `received_at` timestamptz, `transaction_id` uuid nullable FK, `subscription_id` uuid nullable FK) para auditoría
- Responde 200 si el evento fue procesado (incluso si fue no-op), 400 si el payload es inválido, 401 si la verificación falla

### Fuera de scope

- Webhooks de subscriptions (SUBS-003 — pero reusa este endpoint y la misma tabla `billing_webhook_events`)
- Reintentos manuales desde una UI admin
- Alertas/notificaciones por fallos repetidos
- Replay de eventos pasados

### Requerimientos no funcionales

- El handler responde en menos de 5 segundos
- Logging estructurado por evento con `event_type`, `provider_transaction_id`, `outcome`
- El endpoint se registra **antes** del plugin `clerk-auth` en `app.ts` (mismo patrón que el webhook de Clerk)
- El secret de webhook se valida al boot (fail-fast)

### Edge cases

- Evento `success` llega antes que la creación local de la transacción (carrera): se persiste el evento con `transaction_id = null` y se loguea warning
- Mobbex no firma criptográficamente: el secret en query + TLS es la única defensa; esta limitación se documenta en SPEC
- Eventos duplicados: la idempotencia por estado actual previene doble-update

### Technical constraints

- Backend: módulo `apps/services/src/modules/webhooks/mobbex/`
- Sigue el patrón establecido en AUTH-002 para webhooks Clerk (raw body parser scoped, fail-fast secret check, registro previo al auth plugin)
- Repository pattern: `MobbexBillingSyncRepository` con `updateTransactionStatus`, `recordEvent`

### Documentación relevante

- https://mobbex.dev/webhooks
- `duck-spec/docs/BACKEND.md` (sección "Webhook modules")

### Dependencias

- BILLING-001 — método `verifyWebhook` en el puerto
- BILLING-002 — tabla `transactions`
- SERVICES-001

---

## BILLING-004 — Refunds Reflection (Provider-Initiated)

**Estado:** TODO

### Contexto

Las transacciones aprobadas pueden necesitar reintegrarse total o parcialmente (por soporte, dispute, error operativo). El reintegro **no** lo dispara el usuario final desde la app: lo ejecuta un operador desde el portal del proveedor (Mobbex) o, eventualmente, desde una herramienta admin interna futura. El sistema solo necesita reflejar localmente lo que el proveedor reporta vía webhook para mantener consistencia en `transactions` y poder mostrar al usuario un estado correcto.

### Objetivo

Persistir localmente los reintegros que el proveedor reporta vía webhook, mantener la tabla `transactions` consistente (pasar a `refunded` cuando el monto reintegrado iguala al original), y exponer una vista de solo lectura de los refunds asociados a una transacción.

### Requerimientos funcionales

- Tabla Supabase `refunds`: `id` (uuid PK), `transaction_id` (FK → transactions), `amount` (numeric), `reason` (text nullable), `status` (text: `pending` | `approved` | `failed`), `provider_refund_id` (text unique), `created_at`, `updated_at`
- Webhook handler para eventos de refund (`refund.success`, `refund.failure` o equivalentes en la nomenclatura de Mobbex): localiza la transacción asociada por `provider_transaction_id`; hace upsert del refund en la tabla `refunds` por `provider_refund_id` (idempotente)
- Cuando el monto total de refunds en estado `approved` iguala al monto original de la transacción, la transacción pasa a `status = refunded`; si es parcial, queda en `approved` con los refunds acumulados visibles
- `GET /billing/transactions/:id/refunds` protegido con `requireAuth`: devuelve la lista de refunds de la transacción ordenados por `created_at`; 404 si la transacción no existe; 403 si pertenece a otro scope
- No existe ningún endpoint que dispare un refund hacia el proveedor desde el frontend ni desde una API pública

### Fuera de scope

- Endpoint para que el end-user solicite/dispare un refund (decisión explícita: refunds NO son self-service)
- Endpoint admin para disparar refunds desde un dashboard interno (feature futura, requiere modelo de roles admin que aún no existe)
- "Solicitud de refund" como workflow con estado `requested` + aprobación humana
- Disputes / chargebacks automáticos
- Refunds programados o en cuotas

### Requerimientos no funcionales

- El upsert en `refunds` es idempotente por `provider_refund_id` (un mismo evento recibido dos veces no genera duplicados)
- La actualización de `transactions.status` a `refunded` ocurre en la misma operación atómica que el upsert del refund (transaccional, para evitar estado intermedio inconsistente)
- Logging estructurado del evento de refund con `transaction_id`, `provider_refund_id`, `amount`, `outcome`

### Edge cases

- Llega un evento de refund cuyo `provider_transaction_id` no existe localmente: se loguea warning, el evento se persiste en `billing_webhook_events` con `transaction_id = null`, no se crea registro en `refunds`
- Evento duplicado: el upsert por `provider_refund_id` lo neutraliza, responde 200
- Refund parcial sucesivo donde la suma acumulada iguala el monto original: la transacción pasa a `refunded` en el último evento
- Refund `failed`: el registro queda persistido con `status = failed`, la transacción no cambia
- Llega un evento de refund para una transacción en `pending` (caso anómalo): se persiste el refund igual y se loguea warning; la consistencia se resuelve manualmente desde el portal del proveedor

### Technical constraints

- Backend: extiende `apps/services/src/modules/webhooks/mobbex/` (dispatcher reconoce el nuevo event type) y agrega `getRefundsByTransactionId` al repository del módulo billing
- Migración Supabase adicional para la tabla `refunds`
- Tipos compartidos en `@repo/types`: `Refund`

### Dependencias

- BILLING-002 — tabla `transactions`
- BILLING-003 — endpoint webhook base, verificación de secret, tabla `billing_webhook_events`
