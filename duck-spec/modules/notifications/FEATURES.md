# notifications

Módulo de notificaciones al usuario. Ofrece a los demás módulos un mecanismo simple para enviar notificaciones (comenzando por email transaccional) sin acoplarse al proveedor concreto ni bloquear su flujo. El core expone un puerto abstracto consumido por inyección de constructor, con plantillas identificadas por id rellenadas con variables de contexto que provee el módulo consumidor.

---
# Lista de features:

## NOTIFICATIONS-001 — Core de envío de email transaccional (in-process) + email de bienvenida

**Estado:** DONE

### Contexto

El backend (`services`) tiene módulos que necesitan comunicarse con el usuario por email (bienvenida, avisos transaccionales) pero hoy no existe ningún mecanismo para hacerlo. Se necesita un core de notificaciones por email simple y reutilizable, que cualquier módulo pueda invocar sin bloquear su propio flujo y sin conocer el proveedor concreto de envío. Como primer consumidor real que valida el core end-to-end, al completarse la creación de un usuario se le debe enviar un email de bienvenida.

### Objetivo

Dar a los módulos del backend un mecanismo para enviar emails transaccionales al usuario de forma asincrónica (sin esperar la entrega), usando plantillas identificadas por un id y rellenadas con variables de contexto provistas por el módulo que consume el envío. Validar el core cableando el email de bienvenida en la creación de un usuario.

### Requerimientos funcionales

- Un módulo consumidor puede solicitar el envío de un email indicando el id de la plantilla y un contexto tipado, y su flujo continúa sin esperar a que el email se entregue (envío no bloqueante).
- El email se arma a partir de la plantilla que corresponde al id indicado, rellenada con las variables del contexto recibido, produciendo una versión HTML y una versión de texto plano.
- El email se entrega al destinatario indicado a través del proveedor de email.
- Solicitar el envío con un id de plantilla inexistente no rompe al módulo llamador: la condición se registra en el log y el flujo continúa.
- Un fallo en el armado o la entrega del email se registra en el log y nunca se propaga ni interrumpe el flujo del módulo llamador.
- Al recibir un webhook de usuario nuevo (user.created de Clerk), se le envía un email de bienvenida a su dirección de email.

### Requerimientos no funcionales

- El envío no debe agregar latencia perceptible al flujo del módulo llamador (se dispara y se olvida dentro del mismo proceso).
- Ningún fallo del proveedor de email puede degradar ni interrumpir la request del módulo que originó el envío.
- El contexto de cada plantilla debe ser tipado, de modo que el consumidor no pueda invocar una plantilla con variables incorrectas o incompletas.
- Los módulos consumidores dependen de una abstracción de envío, no del proveedor concreto: cambiar de proveedor no debe requerir cambios en los consumidores.
- No se registran en el log datos sensibles ni PII del cuerpo del email (conforme a la política de logging del backend).

### Fuera de scope

- Tracking de estado de entrega, bounces, quejas o aperturas (webhook del proveedor de email).
- Cola durable, reintentos con persistencia o worker separado (p. ej. SQS + worker).
- Preferencias de notificación del usuario, suscripción/baja (opt-out) o silenciado.
- Otros canales de notificación (SMS, push, in-app).
- Programación diferida o envío por lotes (scheduling / batching).
- Adjuntos en los emails.
- UI de administración o previsualización de plantillas.

### Edge cases

- Id de plantilla inexistente: se registra en el log y no se rompe al llamador.
- Destinatario ausente o con formato inválido: se registra en el log; no interrumpe el flujo del llamador.
- El proveedor de email responde con error o timeout: se registra el error original; el flujo del llamador ya continuó.
- El contexto no incluye todas las variables que la plantilla espera: debe evitarse en tiempo de compilación por el tipado del contexto.
- Webhook de creación de un usuario repetido no debería derivar en múltiples emails de bienvenida no deseados para el mismo evento de completitud.

### Technical constraints

- Envío in-process con patrón fire-and-forget: sin cola SQS ni proceso worker separado. El backend corre como un único proceso en App Runner.
- Proveedor de email: AWS SES v2 (`@aws-sdk/client-sesv2`), detrás de un adapter que implementa un puerto abstracto de envío. Los consumidores nunca importan el adapter directo.
- Puerto abstracto de notificación por email expuesto en `@repo/types`, consumido por los módulos vía inyección de constructor (mismo patrón que el puerto `PaymentProvider` / adapter `MobbexProvider` del módulo `billing`).
- Plantillas construidas con React Email (componentes `.tsx`) identificadas por id, renderizadas server-side a HTML y a texto plano.
- Nueva configuración tipada bajo `src/shared/configs/` para región de SES y dirección remitente (sin lecturas directas de `process.env` fuera de los archivos de config).
- El disparo del email de bienvenida se cablea en el flujo de usuario creado por el webhook de Clerk user.created.

### Documentación relevante

- `duck-spec/docs/BACKEND.md` — arquitectura hexagonal simplificada, puertos/adapters, regla de fire-and-forget async, política de logging y configuración.
- `duck-spec/docs/INFRASTRUCTURE.md` — SES requiere identidad verificada y permiso IAM `ses:SendEmail` en el instance role de App Runner (no gestionado aún en Terraform).
- React Email — render server-side a HTML/texto (`render` de `react-email`, primitivos de `@react-email/components`).

---

## NOTIFICATIONS-002 — Migración del envío de email a Resend

**Estado:** TODO

### Contexto

NOTIFICATIONS-001 dejó operativo el envío de email transaccional detrás de un puerto abstracto, con un adapter que habla con AWS SES v2. Al salir de AWS ese adapter queda sin infraestructura que lo respalde: la identidad de dominio, el permiso de envío y las variables de runtime que INFRA-005 iba a proveer nunca llegaron a construirse, y esa feature quedó marcada como obsoleta junto con el resto de la infraestructura de AWS.

El resultado es que hoy el backend no puede enviar ningún email. Y, además, no llega a arrancar: el notificador se resuelve durante el registro del plugin de webhooks, por lo que la ausencia de la dirección remitente aborta el boot en lugar de degradar el envío.

Este es el punto donde se cobra la inversión en puertos y adapters: el contrato que consumen los módulos no tiene por qué enterarse del cambio de proveedor.

### Objetivo

Reemplazar el proveedor de envío de email por Resend sin alterar el puerto que consumen los demás módulos ni el comportamiento observable del envío.

### Requerimientos funcionales

- El email de bienvenida se entrega al destinatario a través del proveedor nuevo
- El contrato del puerto de envío y la forma en que los módulos lo consumen no cambian
- Las plantillas existentes se siguen renderizando igual y el contenido que recibe el destinatario no cambia
- La credencial del proveedor y la dirección remitente se configuran de forma independiente por environment
- Un fallo del proveedor se registra en el log y no se propaga ni interrumpe el flujo del módulo llamador
- El proyecto deja de depender del SDK del proveedor anterior

### Fuera de scope

- Plantillas nuevas o cambios de contenido en las existentes
- Manejo de bounces, quejas y estado de entrega
- Verificación del dominio remitente ante el proveedor, que es un trámite manual sobre DNS
- Cola durable, reintentos con persistencia o worker separado: el envío sigue siendo in-process
- Cambios en la semántica de arranque del servicio ante configuración de email ausente (SERVICES-010)
- Observabilidad de la entrega más allá del log

### Requerimientos no funcionales

- El cambio no debe requerir modificaciones en los módulos que consumen el puerto de envío
- El envío no debe agregar latencia perceptible al flujo del módulo llamador
- Ningún fallo del proveedor puede degradar ni interrumpir la request que originó el envío
- No se registran en el log datos sensibles ni PII del cuerpo del email

### Edge cases

- La cuenta del proveedor arranca sin el dominio remitente verificado; hasta que la verificación propague, los envíos a destinatarios arbitrarios son rechazados
- Una credencial inválida produce un fallo por cada envío que solo queda en el log, porque el envío es fire-and-forget y nadie observa el resultado
- El proveedor impone límites de tasa; superarlos rechaza envíos que hoy nadie reintenta
- Dev y prod deben usar direcciones remitentes distintas para no mezclar la reputación de envío entre environments
- Las plantillas se renderizan a HTML y a texto plano; el proveedor nuevo debe recibir ambas variantes o el email pierde su versión alternativa
- El adapter anterior y el nuevo no deben coexistir cableados a la vez: dos notificadores activos duplicarían los envíos

### Technical constraints

- Proveedor de email: Resend, detrás del mismo puerto abstracto que ya consumen los módulos
- El adapter de AWS SES v2 se reemplaza y se retira la dependencia `@aws-sdk/client-sesv2`
- Configuración tipada bajo `src/shared/configs/`, sin lecturas directas de `process.env` fuera de los archivos de configuración
- Las plantillas de React Email y su render server-side a HTML y texto plano se mantienen sin cambios

### Documentación relevante

- `duck-spec/modules/notifications/notifications-001-email-core/design.md` — diseño del puerto, el adapter y el wrapper fire-and-forget
- `duck-spec/docs/BACKEND.md` — puertos/adapters, regla de fire-and-forget async, política de logging y configuración

### Dependencias

- INFRA-010 — la infraestructura de AWS debe estar retirada y INFRA-005 e INFRA-006 marcadas como obsoletas
