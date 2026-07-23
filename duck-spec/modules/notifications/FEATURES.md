# notifications

Módulo de notificaciones del producto. Provee una interfaz abstracta para que cualquier módulo del sistema (auth, billing, subscriptions, futuros) solicite el envío de notificaciones sin acoplarse al canal, al proveedor ni al mecanismo de entrega. Inicialmente cubre el canal de email transaccional, con espacio para sumar otros canales (in-app, SMS, push) en el futuro.

---

## NOTIFICATIONS-001 — Email Core: Port, SES Adapter, Async Delivery

**Estado:** DONE

### Contexto

Los módulos `auth` (implementado), `billing` y `subscriptions` (planeados) van a necesitar enviar emails transaccionales — bienvenida, recibo de pago, suscripción activada, etc. Hoy no existe ningún mecanismo en el stack para emitir emails, ni hay convención sobre dónde viven los templates ni cómo se entregan. Hace falta un módulo base que ofrezca esta capacidad de forma abstracta y asíncrona, sin que cada consumidor tenga que conocer al proveedor concreto ni la mecánica de cola.

### Objetivo

Construir el módulo `notifications` con una interfaz tipada de envío de email, templates en código y entrega asíncrona via cola. La feature deja el módulo listo para que cualquier consumidor defina sus templates y dispare envíos sin acoplarse al proveedor.

### Requerimientos funcionales

- El módulo expone una interfaz que permite a cualquier consumidor solicitar el envío de un email indicando qué template usar y las variables que requiere ese template, validando en compile time que las variables correctas y completas estén presentes
- El consumidor solicita el envío sin esperar a que el email sea efectivamente entregado: la solicitud retorna inmediatamente y la entrega ocurre de forma asíncrona en un componente separado
- Si la entrega falla transitoriamente, el sistema reintenta automáticamente; tras agotar reintentos, el envío queda capturado en una cola separada para inspección posterior
- Cada operación de envío genera logs estructurados correlacionables (request id, user id si aplica, template id, resultado, duración del envío)
- Una solicitud de envío con un template id desconocido es rechazada antes de encolarse
- El módulo incluye al menos un template de ejemplo (no de negocio) que valida el flujo end-to-end

### Fuera de scope

- Templates concretos de negocio (welcome, password reset, payment receipt, etc.) — irán como tasks dentro de las features de los módulos consumidores
- Wiring real con `auth`, `billing` o `subscriptions`
- Persistencia del histórico de envíos y estados finales de entrega (NOTIFICATIONS-002)
- Webhook de eventos del proveedor (delivery / bounce / complaint) (NOTIFICATIONS-002)
- Suppression list y supresión automática por bounces o complaints (NOTIFICATIONS-003)
- Canales que no sean email (in-app, SMS, push, webhooks salientes)
- Adapters alternativos al inicial (Resend, SendGrid, etc.) — el módulo permite sumarlos pero esta feature solo entrega uno
- Templates por idioma / i18n
- Multi-tenant template overrides
- Programación de envíos (scheduled / delayed) y attachments
- UI para gestión de templates

### Requerimientos no funcionales

- Seguridad: credenciales del proveedor y ARNs de infraestructura viven en variables de entorno; nunca en el repo
- Privacidad: los logs no incluyen el cuerpo renderizado del email ni el contenido completo de las variables del template — solo identificadores
- Reliability: una caída transitoria del proveedor no debe perder mensajes — la cola los retiene hasta que el worker pueda procesarlos; la dead-letter queue captura los que agotan reintentos
- El componente que procesa la cola debe ser desplegable y escalable de forma independiente al API

### Edge cases

- Mensaje malformado en la cola (deserialización falla): el worker loggea el error y descarta el mensaje sin reintentar, para no bloquear la cola con un poison message
- El envío al proveedor responde con un error transitorio: el mensaje vuelve a la cola y reintenta según la política configurada
- El envío al proveedor responde con un error permanente (dirección inválida, payload inválido): el mensaje no reintenta indefinidamente y termina en la dead-letter queue
- El worker es interrumpido entre el envío exitoso al proveedor y el acknowledgment a la cola: el mensaje se re-procesa; en esta feature un duplicado es aceptable (la deduplicación robusta llega con NOTIFICATIONS-002)

### Technical constraints

- Patrón: Port & Adapter — puerto `IEmailNotifier` con adapter inicial sobre AWS SES
- Templates definidos en código (no en la plataforma del proveedor), implementados con React Email
- Entrega asíncrona via AWS SQS con un worker dedicado; el use case del consumidor publica a la cola y no llama al proveedor sincrónicamente
- Reintentos y dead-letter queue gestionados por la configuración de SQS

### Documentación relevante

- AWS SES — Sending email: https://docs.aws.amazon.com/ses/latest/dg/send-email.html
- AWS SQS — Dead-letter queues: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
- React Email: https://react.email
- `duck-spec/docs/BACKEND.md` — convenciones de error model y logging

### Dependencias

- SERVICES-001 — la estructura base de `apps/services` debe existir

---

## NOTIFICATIONS-002 — Email Delivery Tracking via Provider Webhook

**Estado:** DONE

### Contexto

NOTIFICATIONS-001 deja el sistema enviando emails de forma asíncrona, pero sin visibilidad sobre qué pasa con cada envío más allá de los logs del worker. No se sabe si el proveedor efectivamente entregó el email, si rebotó o si el destinatario reportó spam. Para diagnosticar problemas de delivery, auditar envíos y, más adelante, alimentar la suppression list (NOTIFICATIONS-003), hace falta persistir el ciclo de vida de cada envío y consumir las notificaciones de eventos finales del proveedor.

### Objetivo

Persistir cada solicitud de envío y su estado final (delivered / bounced / complained / failed) consumiendo las notificaciones que el proveedor emite, e idempotentizar el envío para que reintentos no produzcan duplicados.

### Requerimientos funcionales

- Cada solicitud de envío queda registrada al momento de ser aceptada en estado `queued`
- El estado evoluciona a `sent` cuando el worker despacha el envío al proveedor, y luego a `delivered`, `bounced`, `complained` o `failed` según el resultado real reportado por el proveedor
- El proveedor de email notifica eventos de entrega final via un webhook expuesto por el sistema; estas notificaciones actualizan el estado del registro correspondiente
- El webhook rechaza con error las notificaciones que no vienen autenticadas correctamente del proveedor
- Un envío al proveedor que tuvo éxito no se vuelve a despachar si el worker re-procesa el mismo mensaje (deduplicación basada en el estado persistido y en el identificador devuelto por el proveedor)

### Fuera de scope

- Métricas agregadas, dashboards o reportes de delivery
- Reintentos manuales desde una UI o un endpoint
- Reenvío automático en estado `failed`
- Suppression list y auto-supresión por bounces o complaints (NOTIFICATIONS-003)
- Retención y purga del histórico
- Exposición de los registros via API consumible por el frontend

### Requerimientos no funcionales

- Idempotencia: notificaciones duplicadas del proveedor para el mismo identificador de envío no deben corromper el estado
- Idempotencia: el re-procesamiento de un mismo mensaje encolado no debe producir un envío duplicado al proveedor
- El registro se persiste al aceptar la solicitud, no al enviar — un envío no entregado queda visible para diagnóstico
- Seguridad: la verificación de firma del webhook usa la clave o mecanismo oficial del proveedor

### Edge cases

- Notificación del proveedor (bounce / complaint / delivery) llega antes de que el registro esté en estado `sent` (race entre el worker y el webhook): la actualización debe tolerar la desincronización sin perder el evento
- Notificación recibida para un identificador de envío que no existe en el sistema: se loggea y se descarta sin error
- El envío al proveedor tiene éxito pero la actualización del registro a `sent` falla: en el siguiente reintento, el worker detecta el identificador ya emitido por el proveedor y no reenvía
- Estados terminales (`delivered`, `bounced`, `complained`, `failed`) son inmutables: una notificación tardía que intente revertirlos se descarta

### Technical constraints

- Persistencia en Supabase, siguiendo la convención de migraciones del módulo `auth`
- Tabla `email_deliveries` con el ciclo de vida indicado
- Notificaciones del proveedor recibidas via AWS SNS y consumidas por un endpoint webhook en `apps/services`
- Verificación de firma de las notificaciones SNS según la guía oficial de AWS

### Documentación relevante

- AWS SES — Configuring event notifications via SNS: https://docs.aws.amazon.com/ses/latest/dg/configure-sns-notifications.html
- AWS SNS — Verifying signatures of notification messages: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
- `duck-spec/docs/BACKEND.md` — convenciones de webhooks y logging

### Dependencias

- NOTIFICATIONS-001 — el puerto, el adapter SES y el flujo asíncrono via SQS deben existir
- AUTH-002 — el setup de Supabase CLI y la convención de migraciones deben existir

---

## NOTIFICATIONS-003 — Email Suppression List

**Estado:** DONE

### Contexto

Con el tracking de delivery en NOTIFICATIONS-002, el sistema sabe qué direcciones rebotan o reportan spam, pero sigue intentando enviarles. AWS SES penaliza la reputación de la cuenta (e incluso suspende el envío) si las tasas de bounce y complaint superan ciertos umbrales. Hace falta mantener una lista de direcciones suprimidas y evitar reenviar a ellas automáticamente.

### Objetivo

Mantener una lista de direcciones de email suprimidas, alimentarla automáticamente a partir de los eventos de bounce permanente y complaint, y evitar que cualquier solicitud destinada a una dirección suprimida termine despachada al proveedor.

### Requerimientos funcionales

- El sistema mantiene una lista de direcciones de email suprimidas, cada una con la razón y el momento en que fue agregada
- Cuando el webhook recibe un bounce permanente o un complaint, la dirección destinataria se agrega automáticamente a la suppression list
- Antes de que el worker despache un envío al proveedor, se consulta la lista: si la dirección está suprimida, el registro de envío pasa al estado `suppressed` y el worker no llama al proveedor
- Una dirección agregada a la lista por una razón posterior no la duplica: actualiza la entrada existente

### Fuera de scope

- UI o endpoint para gestionar la lista (consultar, agregar manualmente, remover)
- Expiración automática de entradas (las supresiones son permanentes en esta feature)
- Distinción de scope por organización: la lista es global para el deployment
- Sincronización con la suppression list nativa de AWS SES
- Reactivación de direcciones via doble opt-in

### Requerimientos no funcionales

- La consulta a la suppression list debe ocurrir antes del envío al proveedor y no debe agregar latencia perceptible al worker
- La inserción desde el webhook debe ser idempotente: el mismo evento recibido dos veces no produce error ni duplicados

### Edge cases

- Bounce transitorio (soft bounce): no agrega a la suppression list — solo los bounces permanentes lo hacen
- Una solicitud encolada antes de que la dirección fuera suprimida llega al worker después: el worker detecta la supresión y registra `suppressed` sin enviar
- El registro de envío ya está en estado `sent` o terminal cuando llega un complaint: la dirección igualmente se agrega a la lista; el estado del envío original no cambia
- Múltiples solicitudes en paralelo para la misma dirección recién suprimida: todas resuelven en `suppressed`

### Technical constraints

- Tabla `email_suppressions` en Supabase con dirección de email como clave única
- El nuevo estado `suppressed` se agrega al ciclo de vida de `email_deliveries`

### Dependencias

- NOTIFICATIONS-001 — el flujo de envío via worker debe existir
- NOTIFICATIONS-002 — la tabla `email_deliveries` y el webhook de eventos del proveedor deben existir
