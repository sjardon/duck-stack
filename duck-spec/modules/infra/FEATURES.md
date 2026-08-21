# infra

Módulo de infraestructura y tooling. Cubre la configuración base del monorepo, pipelines de build, y paquetes compartidos de configuración y schemas.

---

## INFRA-001 — Monorepo Scaffolding

**Estado:** DONE

### Contexto

El repositorio está en blanco. Se necesita una estructura base de monorepo que soporte las tres capas del SaaS starter pack: frontend de la aplicación (`web`), landing pages (`landing`) y servicios backend (`services`), junto con paquetes compartidos de configuración y schemas.

### Objetivo

Crear la estructura base del monorepo con Turborepo, las tres apps y los paquetes compartidos de configuración TypeScript, ESLint y schemas Zod.

### Requerimientos funcionales

- Inicializar Turborepo con pnpm workspaces
- Crear app `web` con Vite + React + TypeScript
- Crear app `landing` con Vite + React + TypeScript
- Crear app `services` con Fastify + TypeScript
- Crear paquete `@repo/tsconfig` con configuración TypeScript base compartida
- Crear paquete `@repo/eslint-config` con reglas ESLint compartidas
- Crear paquete `@repo/types` con interfaces TypeScript de dominio compartidas entre apps
- Configurar pipeline Turborepo con tareas `build`, `dev` y `lint`

### Fuera de scope

- Paquete `@repo/ui` (componentes React compartidos)
- Autenticación y autorización
- Configuración de CI/CD
- Configuración de deployment (Docker, cloud, etc.)
- Cualquier lógica de negocio de la aplicación

### Requerimientos no funcionales

- Cada app debe poder correr de forma independiente con `pnpm dev`
- El comando `pnpm build` desde la raíz debe compilar todas las apps en orden correcto via Turborepo
- TypeScript strict mode activado en todas las apps y paquetes

### Technical constraints

- Package manager: pnpm
- Monorepo orchestration: Turborepo
- Frontend (web, landing): Vite + React + TypeScript
- Backend (services): Fastify + TypeScript
- Tipos de dominio compartidos: interfaces TypeScript puras (`@repo/types`, sin dependencias externas)

---

## INFRA-002 — AWS Base Infrastructure (Terraform)

**Estado:** DEPRECATED

### Contexto

El monorepo está scaffoldeado (INFRA-001) pero no existe infraestructura cloud. El servicio backend (`services`) necesita correr en AWS como container Docker. La base de datos es Supabase (externa a AWS), por lo que no se requiere RDS. El hosting del frontend estático se define en una feature posterior.

### Objetivo

Configurar la infraestructura base en AWS con Terraform: VPC, ECR y App Runner para el servicio backend.

### Requerimientos funcionales

- Estructura del proyecto Terraform con módulos, variables y backend remoto en S3
- VPC con subnets públicas y privadas
- ECR repository para imágenes Docker de `services`
- App Runner service para `services` conectado a la VPC
- IAM roles y policies necesarios para App Runner

### Fuera de scope

- Hosting de `web` y `landing` (S3 + CloudFront, feature posterior)
- CI/CD pipeline (feature separada)
- Dominios custom y certificados SSL
- Múltiples environments (dev/staging/prod)
- Base de datos en AWS (se usa Supabase)

### Requerimientos no funcionales

- El estado de Terraform debe almacenarse en S3 con locking via DynamoDB
- Los recursos deben estar taggeados con proyecto y environment

### Technical constraints

- IaC: Terraform
- Cloud provider: AWS
- Container orchestration: App Runner
- Container registry: ECR
- Networking: VPC con VPC connector para App Runner
- Base de datos: Supabase (externa, sin gestión en AWS)

### Dependencias

- INFRA-001 — el `services` app que se despliega debe existir primero

### Deprecación

Este diseño de VPC, ECR y App Runner en Terraform fue definido por completo pero nunca aplicado ni operado (never applied, never operated): no se ejecutó jamás un `terraform apply`, por lo que ningún recurso de AWS llegó a existir. Esta baja retira infraestructura-como-código sin usar, no infraestructura corriendo. La capa de compute del backend fue reemplazada por INFRA-008 (DigitalOcean App Platform). El árbol de Terraform fue eliminado del repositorio por INFRA-010.

---

## INFRA-003 — Static Hosting (S3 + CloudFront)

**Estado:** DEPRECATED

### Contexto

Las apps `web` y `landing` son SPAs estáticas generadas con Vite. Necesitan infraestructura para ser servidas de forma pública y eficiente. Los buckets S3 deben ser privados y accedidos únicamente via CloudFront.

### Objetivo

Provisionar con Terraform dos distribuciones CloudFront respaldadas por buckets S3 privados para servir `web` y `landing` como SPAs estáticas.

### Requerimientos funcionales

- S3 bucket privado para assets de `web`
- S3 bucket privado para assets de `landing`
- CloudFront distribution para `web` apuntando a su bucket S3
- CloudFront distribution para `landing` apuntando a su bucket S3
- Origin Access Control (OAC) en cada distribución para acceso privado a S3
- Custom error response en CloudFront: 403/404 → `index.html` con status 200 (para React Router)
- Outputs de Terraform con las URLs de CloudFront de ambas distribuciones

### Fuera de scope

- Dominios custom y certificados SSL (feature posterior)
- CI/CD para subir los assets estáticos (INFRA-004)
- Configuración de WAF o geo-restricciones

### Requerimientos no funcionales

- Los buckets S3 no deben ser públicamente accesibles
- CloudFront debe servir el contenido con HTTPS por defecto

### Technical constraints

- IaC: Terraform
- CDN: AWS CloudFront
- Storage: AWS S3
- Acceso privado: Origin Access Control (OAC)

### Dependencias

- INFRA-001 — las apps `web` y `landing` que se despliegan deben existir primero

### Deprecación

Este diseño de S3 + CloudFront en Terraform fue definido por completo pero nunca aplicado ni operado (never applied, never operated): no se ejecutó jamás un `terraform apply`, por lo que ningún bucket ni distribución llegó a existir. Esta baja retira infraestructura-como-código sin usar, no infraestructura corriendo. El hosting estático de `web` y `landing` fue reemplazado por INFRA-009 (Cloudflare Pages). El árbol de Terraform fue eliminado del repositorio por INFRA-010.

---

## INFRA-004 — CI/CD Pipeline (GitHub Actions)

**Estado:** DEPRECATED

### Contexto

La infraestructura cloud está definida (INFRA-002, INFRA-003) pero no hay automatización para construir y desplegar el proyecto. Se necesita un pipeline que soporte dos environments (dev y prod) alineados con la estrategia de ramas `feature branch → develop → main`, con posibilidad de deploy manual y rollback.

### Objetivo

Configurar workflows de GitHub Actions para build, deploy automático por merge y rollback de los tres apps en los environments dev y prod.

### Requerimientos funcionales

- Workflow de deploy automático: merge a `develop` despliega en dev, merge a `main` despliega en prod
- Build y push de imagen Docker de `services` a ECR con tag igual al commit SHA
- Deploy de `services` en App Runner actualizando la imagen al SHA del commit
- Build y upload de assets estáticos de `web` y `landing` al bucket S3 correspondiente al environment
- Invalidación de caché de CloudFront tras cada deploy de `web` y `landing`
- Workflow manual (`workflow_dispatch`) para deployar un SHA específico a un environment elegido
- Workflow manual para rollback: recibe un SHA anterior y re-despliega ese commit en el environment indicado
- Autenticación con AWS via OIDC (sin access keys almacenadas como secrets)

### Fuera de scope

- Ejecución de tests en el pipeline (feature separada)
- Notificaciones de deploy (Slack, email, etc.)
- Preview environments por pull request
- Custom domains en los environments

### Requerimientos no funcionales

- El pipeline no debe almacenar credenciales AWS como secrets de GitHub — usar OIDC
- Cada job debe indicar claramente el environment y SHA que está desplegando en los logs

### Technical constraints

- CI/CD: GitHub Actions
- Autenticación AWS: OIDC (aws-actions/configure-aws-credentials)
- Estrategia de ramas: feature branch → develop → main
- Environments: dev (develop), prod (main)
- Tagging de imágenes: commit SHA

### Dependencias

- INFRA-002 — ECR y App Runner deben existir en ambos environments
- INFRA-003 — buckets S3 y distribuciones CloudFront deben existir en ambos environments

### Deprecación

A diferencia de INFRA-002/003, estos workflows sí llegaron a ejecutarse — pero siempre contra recursos de AWS que nunca existieron, y siempre fallando desde que el compute y el hosting estático se movieron fuera de AWS (INFRA-008, INFRA-009). Esta baja retira la automatización de deploy hacia AWS; no existe todavía un pipeline automático de reemplazo — queda a cargo de INFRA-012 (forward-linked, aún no construida), mientras tanto el deploy es manual vía los procedimientos de INFRA-008 y INFRA-009. Los seis workflows fueron eliminados del repositorio por INFRA-010.

---

## INFRA-005 — SES Email Infrastructure (Terraform)

**Estado:** DEPRECATED

### Contexto

El módulo de notificaciones ya está implementado (NOTIFICATIONS-001): el adapter de email usa SESv2 y espera recibir por entorno la región de SES y la dirección remitente. Del lado de infraestructura no existe nada de SES: no hay identidad verificada, el instance role de App Runner creado en INFRA-002 solo tiene la policy de acceso a ECR, y el mapa de variables de entorno del servicio está vacío y sin nadie que lo llene.

El resultado es que el backend no puede enviar emails, y además no llega a arrancar: el notifier se resuelve durante el registro del plugin de webhooks, por lo que la ausencia de la dirección remitente aborta el boot del servicio en lugar de degradar el envío.

### Objetivo

Provisionar en Terraform la identidad SES de dominio, el permiso de envío para el servicio backend y la entrega de la configuración de email al runtime de App Runner, de modo que el envío de emails quede operativo en dev y prod.

### Requerimientos funcionales

- Provisionar una identidad SES de dominio, verificable por DKIM, para el dominio remitente del environment
- Exponer como output los registros DNS de DKIM que deben cargarse manualmente en el proveedor de DNS
- Exponer como output el estado de verificación de la identidad para poder diagnosticar envíos bloqueados
- Otorgar al servicio backend permiso de envío de emails a través de esa identidad, y únicamente a través de ella
- Entregar al servicio backend, en tiempo de ejecución, la región de SES y la dirección remitente configuradas
- Permitir configurar el dominio remitente y la dirección remitente de forma independiente por environment

### Fuera de scope

- Configuration set, métricas de reputación y política de TLS en el envío
- Manejo de bounces y complaints (event destinations, SNS, CloudWatch)
- Salida del sandbox de SES — es un trámite manual de soporte, no automatizable por Terraform
- Carga de los registros DNS (DKIM, SPF, DMARC) en el proveedor de DNS: el proyecto no gestiona DNS y la operación es manual
- Cualquier cambio en `apps/services` (adapter, archivos de configuración o validación de variables de entorno al boot)
- Recepción de emails entrantes
- Custom domains y certificados, que siguen diferidos a una feature futura

### Requerimientos no funcionales

- El permiso de envío debe estar acotado a la identidad provisionada; no se admite otorgarlo sobre todos los recursos
- La dirección y el dominio remitente no deben quedar hardcodeados en el código Terraform
- El módulo nuevo debe seguir la estructura de los módulos existentes y no debe acoplar el módulo de App Runner al de SES
- Los recursos nuevos deben quedar alcanzados por el tagging de `project` y `environment` ya aplicado en el proveedor

### Edge cases

- La identidad recién creada queda en estado no verificado hasta que propaguen los registros DKIM; el apply debe completar igual, sin quedar bloqueado esperando la verificación
- La cuenta arranca en el sandbox de SES: solo se puede enviar a destinatarios verificados, con un límite de 200 emails por día y 1 por segundo
- Si el deploy de CI actualiza el servicio de App Runner sin reenviar las variables de runtime, la configuración de email podría perderse y el servicio no volvería a levantar
- SES no está disponible en todas las regiones, por lo que la región de envío puede necesitar diferir de la región general del proyecto
- Aplicar la infraestructura en dev y prod con el mismo dominio remitente generaría identidades en conflicto entre environments

### Technical constraints

- Identidad SES de tipo dominio, verificada por DKIM
- API SESv2, alineada con el SDK que ya usa el adapter de notificaciones
- El permiso se otorga al instance role de App Runner ya existente, sin que el módulo de App Runner conozca SES

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — recursos AWS, estructura de módulos Terraform y pipeline de CI/CD
- `duck-spec/modules/notifications/notifications-001-email-core/design.md` — diseño del adapter y variables de entorno que consume

### Dependencias

- INFRA-002 — el servicio de App Runner y su instance role deben existir
- NOTIFICATIONS-001 — define las variables de entorno que consume el adapter de email

### Deprecación

Este diseño de infraestructura de SES en Terraform queda abandonado junto con el resto de la huella de AWS retirada por INFRA-010. La necesidad subyacente — el envío de emails — no queda abandonada: la cubre ahora **NOTIFICATIONS-002**, que reemplaza el adapter SES por otro proveedor sin depender de esta infraestructura Terraform.

---

## INFRA-006 — SES Delivery Observability

**Estado:** DEPRECATED

### Contexto

INFRA-005 dejó el envío de emails operativo pero completamente ciego. SES exige mantener las tasas de rebote y de queja por debajo de ciertos umbrales; superarlos deriva en revisión de la cuenta y, eventualmente, en la suspensión de la capacidad de envío. Hoy no hay forma de conocer esas tasas: los envíos no se agrupan bajo ningún conjunto de configuración, no se publican métricas de reputación y no se exige transporte cifrado en la entrega.

El proyecto tampoco tiene ninguna pieza de observabilidad en Terraform, por lo que esta feature introduce las primeras métricas de infraestructura.

### Objetivo

Dotar al envío de emails de métricas de entrega consultables y endurecer la configuración de envío, sin requerir cambios en el código del servicio backend.

### Requerimientos funcionales

- Los envíos de email quedan agrupados bajo un conjunto de configuración asociado a la identidad como predeterminado, de modo que todos los envíos quedan alcanzados sin modificar el servicio backend
- El conjunto de configuración exige transporte cifrado en la entrega de los emails
- El conjunto de configuración publica las métricas de reputación de la cuenta
- Los eventos de entrega, rebote y queja de los emails enviados quedan disponibles como métricas consultables
- Los destinatarios que rebotan o generan quejas quedan suprimidos para envíos posteriores
- El nombre del conjunto de configuración se expone como output para diagnóstico

### Fuera de scope

- Alarmas sobre las métricas y canal de notificación — se resuelven en INFRA-007
- Dashboards, agregación de logs, tracing y herramientas de APM de terceros
- Consumo de los eventos de entrega por parte del servicio backend
- Tracking de aperturas y clicks, que requiere un dominio de redirección propio y queda atado a la feature de custom domains
- Cambios en `apps/services`, incluido el adapter de email

### Requerimientos no funcionales

- La asociación del conjunto de configuración no debe requerir cambios en el adapter de email ni en su configuración de entorno
- La configuración debe ser independiente por environment, sin que dev y prod compartan métricas
- Los recursos nuevos deben quedar alcanzados por el tagging de `project` y `environment` ya aplicado en el proveedor

### Edge cases

- Un envío que especifique explícitamente otro conjunto de configuración en la request sobrescribe el predeterminado de la identidad, por lo que sus eventos no quedarían agrupados
- Los eventos solo se registran para envíos posteriores a la asociación del conjunto de configuración; los envíos previos no quedan reflejados en las métricas
- El destino de eventos en CloudWatch exige declarar al menos una dimensión; una dimensión mal configurada agrupa todas las métricas bajo un mismo valor por defecto y las vuelve inútiles para diagnosticar
- Habilitar las métricas de reputación tiene costo por métrica publicada, que crece con el volumen de envío
- La supresión por rebote y queja convive con la lista de supresión a nivel de cuenta, que ya opera por defecto

### Technical constraints

- SESv2: el conjunto de configuración se asocia a la identidad como predeterminado mediante su atributo correspondiente, en lugar de enviarse en cada request de envío

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — recursos AWS y estructura de módulos Terraform

### Dependencias

- INFRA-005 — la identidad SES debe existir para poder asociarle el conjunto de configuración

### Deprecación

Este diseño de observabilidad de entrega de SES en Terraform queda abandonado junto con el resto de la huella de AWS retirada por INFRA-010. La necesidad subyacente — observabilidad y alertas sobre la entrega de emails — no queda abandonada: la cubre ahora **INFRA-011**, sin depender de esta infraestructura Terraform ni de SES.

---

## INFRA-007 — Alerting Foundation

**Estado:** DEPRECATED

### Contexto

INFRA-006 dejó las métricas de entrega de email disponibles para consulta, pero nadie mira consolas de forma proactiva. El proyecto no tiene ningún canal de alertas: no existe forma de que una condición anómala en la infraestructura llegue a una persona sin que alguien vaya a buscarla.

Las tasas de rebote y queja son el primer caso que necesita alerta, porque superarlas deriva en la suspensión de la capacidad de envío de la cuenta. Sin embargo, el canal en sí no es específico de email: los errores del servicio backend, la distribución de contenido estático y la base de datos van a necesitar el mismo mecanismo. Por eso el canal se define de forma genérica y reusable, y el email es simplemente su primer consumidor.

### Objetivo

Proveer un canal de alertas genérico por environment, reusable por cualquier componente de la infraestructura, y colgar de él las primeras alarmas sobre las tasas de rebote y queja del envío de emails.

### Requerimientos funcionales

- Existe un canal de alertas por environment al que cualquier componente de la infraestructura puede publicar notificaciones
- El destinatario de las alertas es configurable de forma independiente por environment
- Una alarma notifica al canal cuando la tasa de rebote de emails supera el umbral configurado
- Una alarma notifica al canal cuando la tasa de queja de emails supera el umbral configurado
- Los umbrales de ambas alarmas son configurables por environment
- El identificador del canal se expone como output para que futuras alarmas puedan colgarse de él sin modificar el módulo que lo define

### Fuera de scope

- Alarmas sobre otros componentes: servicio backend, distribución de contenido estático, base de datos o registro de contenedores
- Dashboards, agregación de logs, tracing y herramientas de APM de terceros
- Canales de notificación distintos del email, como mensajería instantánea, guardias telefónicas o webhooks
- Escalamiento de alertas, rotación de guardias y silenciado temporal
- Respuesta automática ante una alarma, como pausar el envío de emails
- Cambios en `apps/services`

### Requerimientos no funcionales

- El canal no debe quedar acoplado al envío de emails: cualquier componente futuro debe poder publicar en él sin modificar el módulo que lo define
- Los umbrales y el destinatario no deben quedar hardcodeados en el código Terraform
- El módulo debe seguir la estructura de los módulos existentes y quedar alcanzado por el tagging de `project` y `environment`

### Edge cases

- La suscripción de un email al canal requiere confirmación manual por parte del destinatario; hasta que se confirme, la suscripción queda pendiente y las alertas no se entregan
- Con volumen de envío bajo, un único rebote o queja produce una tasa porcentual alta y dispara falsos positivos
- Una alarma sin datos suficientes queda en un estado indeterminado que no debe interpretarse como estado sano
- Un destinatario mal configurado en un environment no genera error visible al aplicar la infraestructura y recién se descubre en el primer incidente
- Una condición anómala sostenida no debe producir una notificación por cada período de evaluación

### Technical constraints

- El canal de alertas se implementa como un tema de notificaciones al que las alarmas publican, de modo que sumar destinatarios o consumidores no requiera tocar las alarmas

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — recursos AWS y estructura de módulos Terraform

### Dependencias

- INFRA-006 — las métricas de rebote y queja deben existir para poder alarmarlas

### Deprecación

Este diseño de canal de alertas genérico en Terraform queda abandonado junto con el resto de la huella de AWS retirada por INFRA-010. La necesidad subyacente — un canal de alertas reusable para toda la infraestructura, con las tasas de rebote/queja de email como primer consumidor — no queda abandonada: la cubre ahora **INFRA-011**.

---

## INFRA-008 — Despliegue del backend en DigitalOcean App Platform

**Estado:** DONE

### Contexto

La infraestructura del backend fue diseñada sobre AWS App Runner (INFRA-002) pero nunca llegó a desplegarse: AWS cerró App Runner a clientes nuevos y la cuenta del proyecto no tiene ningún servicio creado. El Terraform que define VPC, ECR y App Runner nunca fue aplicado.

Ante eso se decidió sacar la capa de compute de AWS y llevarla a DigitalOcean App Platform, eliminando además Terraform del proyecto: con la base de datos en Supabase, la autenticación en Clerk y el resto de las capacidades contratadas como servicios de terceros, no queda ningún recurso cloud que provisionar más allá del propio contenedor.

El backend ya está containerizado, pero su Dockerfile no puede construirse tal como lo invoca el pipeline actual: copia `pnpm-workspace.yaml`, `pnpm-lock.yaml` y los `package.json` de los paquetes compartidos, que solo existen en la raíz del monorepo, mientras que el build usa el directorio de la app como contexto.

### Objetivo

Dejar el backend `services` corriendo en DigitalOcean App Platform a partir de una especificación de aplicación versionada en el repositorio, desplegable de forma manual y repetible.

### Requerimientos funcionales

- El backend queda desplegado y accesible públicamente por HTTPS a partir de una especificación versionada en el repositorio, sin configuración manual en la consola del proveedor
- La imagen del backend se construye desde el Dockerfile existente, tomando la raíz del monorepo como contexto de build
- El servicio recibe en tiempo de ejecución las variables de entorno que necesita, configurables de forma independiente por environment
- Los valores sensibles se entregan al servicio como secretos y no quedan versionados en el repositorio
- La plataforma verifica periódicamente la salud del servicio contra el endpoint de salud ya expuesto por el backend
- El despliegue puede ejecutarse manualmente, de forma repetible, a partir de la especificación versionada
- La URL pública del backend queda disponible para configurar los demás componentes del sistema

### Fuera de scope

- Despliegue automático por merge, despliegue manual de un commit arbitrario y rollback (INFRA-012)
- Hosting de `web` y `landing` (INFRA-009)
- Eliminación del proyecto Terraform y de los flujos de trabajo de AWS (INFRA-010)
- Dominios propios y certificados
- Componentes de trabajos programados o procesos de fondo
- Cualquier cambio en el código de `apps/services`

### Requerimientos no funcionales

- La especificación de la aplicación debe ser la única fuente de verdad de la configuración del servicio: un cambio hecho a mano en la consola debe poder revertirse volviendo a aplicarla
- El despliegue manual debe ser reproducible por cualquier integrante del equipo siguiendo la documentación, sin pasos implícitos ni conocimiento tácito
- Ningún secreto puede quedar versionado en el repositorio

### Edge cases

- El Dockerfile copia archivos que solo existen en la raíz del monorepo; construirlo con el directorio de la app como contexto falla, y es exactamente así como lo invoca el pipeline vigente
- El backend aborta el arranque si falta la dirección remitente de email, porque el notificador se resuelve al registrar el plugin de webhooks; un despliegue sin esa variable no levanta y el síntoma parece un fallo de plataforma
- El servicio no escala a cero: una instancia que falla el chequeo de salud de forma repetida sigue consumiendo presupuesto sin servir tráfico
- Las variables que hoy apuntan a servicios de AWS quedan sin valor válido hasta que las features siguientes las reemplacen
- Un cambio aplicado a mano en la consola del proveedor queda fuera de la especificación y se pierde en el siguiente despliegue

### Technical constraints

- Plataforma de compute: DigitalOcean App Platform, componente de tipo servicio
- Especificación declarativa en `.do/app.yaml`, aplicada con la CLI del proveedor
- Build a partir del Dockerfile de `apps/services`, con la raíz del monorepo como contexto
- Sin Terraform: la especificación de la aplicación reemplaza al módulo de infraestructura como fuente de verdad

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — recursos y topología de despliegue vigentes

---

## INFRA-009 — Hosting de `web` y `landing` en Cloudflare Pages

**Estado:** DONE

### Contexto

INFRA-003 definió el hosting estático de las dos SPAs sobre S3 y CloudFront, pero como el resto de la infraestructura de AWS nunca llegó a aplicarse. Con la salida de AWS ya decidida, `web` y `landing` necesitan un destino nuevo.

Ambas son builds estáticos de Vite que viven dentro del monorepo pnpm y dependen de paquetes del workspace, por lo que su construcción no puede hacerse de forma aislada desde el directorio de cada app.

### Objetivo

Servir `web` y `landing` como SPAs estáticas desde Cloudflare Pages, con el enrutamiento del lado del cliente funcionando y el build resuelto desde el monorepo.

### Requerimientos funcionales

- Cada SPA se sirve públicamente por HTTPS desde su propio proyecto de hosting estático
- El contenido de cada SPA se construye desde el monorepo, resolviendo correctamente las dependencias del workspace
- Las rutas que no corresponden a un archivo estático devuelven el documento raíz de la SPA, para que el enrutador del cliente resuelva la navegación
- Cada SPA recibe en tiempo de build las variables de configuración que necesita, independientes por environment
- La URL pública de cada SPA queda disponible para configurar los orígenes permitidos en el backend

### Fuera de scope

- Despliegue automático por merge (INFRA-012)
- Eliminación del Terraform de S3 y CloudFront (INFRA-010)
- Dominios propios y certificados
- Reglas de caché a medida, WAF y restricciones geográficas
- Cualquier cambio en el código de `apps/web` y `apps/landing`

### Requerimientos no funcionales

- El build de cada SPA no debe requerir pasos manuales previos ni dependencias instaladas fuera del monorepo
- Ninguna variable sensible puede quedar embebida en el bundle publicado, que es de acceso público
- El contenido debe servirse desde una red de distribución, sin exponer un origen accesible de forma directa

### Edge cases

- El build debe correr desde la raíz del monorepo: un comando que asuma el directorio de la app como raíz no resuelve los paquetes del workspace
- Las variables inyectadas en tiempo de build quedan embebidas en el bundle y son visibles para cualquiera, por lo que solo admiten valores públicos
- Sin el fallback al documento raíz, recargar el navegador en una ruta profunda devuelve un error en lugar de la aplicación
- Los orígenes permitidos del backend deben incluir las URLs nuevas o las SPAs no pueden consumir la API
- Cada environment genera una URL distinta, por lo que la configuración de orígenes del backend debe contemplarlas todas

### Technical constraints

- Hosting estático: Cloudflare Pages, un proyecto por app
- Build desde la raíz del monorepo con pnpm

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — recursos y topología de despliegue vigentes
- `duck-spec/docs/FRONTEND.md` — estructura y build de las apps de frontend

---

## INFRA-010 — Retiro de la infraestructura de AWS

**Estado:** DONE

### Contexto

Con el backend corriendo en App Platform (INFRA-008) y las SPAs servidas desde Cloudflare Pages (INFRA-009), ningún componente del sistema depende ya de AWS.

Sin embargo el repositorio conserva el proyecto Terraform completo —VPC, ECR, App Runner, S3, CloudFront— y los flujos de trabajo de despliegue que autentican contra AWS y publican imágenes en ECR. Esos flujos siguen disparándose en cada merge y fallan siempre, generando ruido permanente. Además, la documentación viva sigue describiendo una topología que ya no es la real.

### Objetivo

Eliminar del repositorio toda la infraestructura y la automatización de AWS, y dejar registrado por qué las features que la describían quedaron obsoletas.

### Requerimientos funcionales

- El repositorio deja de contener definiciones de infraestructura de AWS
- Los flujos de trabajo que despliegan contra AWS dejan de ejecutarse en cada merge
- La documentación viva de infraestructura describe la topología vigente y no la abandonada
- Las features que describen infraestructura de AWS ya dada por construida quedan marcadas como obsoletas, con la razón registrada
- Las features de infraestructura de AWS que quedaron pendientes se marcan como obsoletas indicando qué las reemplaza
- Las variables y valores de configuración del repositorio que apuntan a servicios de AWS se retiran junto con la infraestructura

### Fuera de scope

- El nuevo pipeline de CI/CD (INFRA-012)
- Migración del envío de email (NOTIFICATIONS-002) y de la observabilidad (INFRA-011)
- Baja de recursos en la cuenta de AWS: nada llegó a aplicarse, no hay nada que destruir
- Cambios en el código de las aplicaciones

### Requerimientos no funcionales

- La eliminación no debe dejar referencias colgadas: ningún documento vivo ni flujo de trabajo puede seguir nombrando recursos que ya no existen
- El registro de features debe permitir reconstruir por qué se abandonó cada pieza, sin borrarlas del historial

### Edge cases

- El estado remoto de Terraform y su tabla de bloqueo nunca llegaron a crearse, por lo que no hay estado que destruir ni recursos huérfanos que limpiar
- Marcar como obsoletas features en estado DONE puede confundir el estado funcional del módulo si no queda explicado que describían infraestructura que jamás llegó a operar
- Hay features obsoletas cuyo contenido describe necesidades reales y vigentes —envío de email, alertas de entrega—; esas necesidades se cubren en features posteriores y no desaparecen con la deprecación
- El backend puede conservar dependencias del SDK de AWS que dejan de tener infraestructura detrás pero siguen siendo referenciadas por el código hasta NOTIFICATIONS-002

### Technical constraints

- Las features reemplazadas se marcan con estado DEPRECATED en lugar de eliminarse del registro

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — recursos AWS, módulos Terraform y pipeline de CI/CD vigentes
- `duck-spec/docs/ARCHITECTURE.md` — topología de despliegue entre servicios

### Dependencias

- INFRA-008 — el backend debe estar corriendo fuera de AWS
- INFRA-009 — las SPAs deben estar servidas fuera de AWS

---

## INFRA-011 — Monitoreo de disponibilidad y agregación de logs

**Estado:** DONE

### Contexto

El backend emite logs estructurados en JSON con campos estables y un identificador de request inyectado en cada línea, pero esos logs solo viven dentro de la plataforma de compute, con retención acotada y sin capacidad de búsqueda. Toda la inversión en logging estructurado queda desaprovechada.

Tampoco hay nadie observando si el servicio está en pie: INFRA-007 iba a construir un canal de alertas sobre CloudWatch y SNS, y quedó obsoleta al salir de AWS. Hoy la única forma de enterarse de una caída es que la reporte un usuario.

### Objetivo

Detectar caídas del backend sin depender de que las reporte un usuario, y dejar los logs consultables y buscables fuera de la plataforma de compute.

### Requerimientos funcionales

- Un chequeo externo y periódico verifica que el backend responde en su endpoint de salud
- Una caída del backend notifica a un destinatario configurable
- La recuperación del servicio tras una caída también se notifica
- Los logs del backend quedan disponibles fuera de la plataforma de compute, con búsqueda y retención propias
- Los campos estructurados que el backend ya emite quedan consultables como campos y no como texto plano
- La configuración del monitoreo y el destinatario de las alertas son independientes por environment

### Fuera de scope

- Reporte y agrupación de excepciones del backend (SERVICES-011)
- Página de estado pública
- Guardias, escalamiento y silenciado de alertas
- Alarmas sobre métricas de negocio o de entrega de email
- Dashboards a medida y tracing distribuido
- Cualquier cambio en el código de las aplicaciones

### Requerimientos no funcionales

- El monitoreo no debe requerir cambios en el código del backend: el endpoint de salud ya existe y el formato de log ya es estructurado
- Lo que se envíe fuera de la plataforma debe respetar la política de logging vigente, que prohíbe secretos y datos personales
- Un fallo del destino de logs no debe degradar ni interrumpir el servicio

### Edge cases

- El endpoint de salud responde correctamente aunque la base de datos esté caída, porque no verifica dependencias: un servicio reportado como sano puede estar sin poder operar
- Una caída más breve que el intervalo entre chequeos pasa desapercibida
- Un chequeo demasiado frecuente consume cuota del plan y se mezcla con el tráfico real en las métricas
- Un pico de logs puede agotar la cuota de ingesta y perder líneas justo durante un incidente, que es cuando más se necesitan
- El destinatario de las alertas puede requerir confirmar su suscripción; hasta entonces las notificaciones no se entregan y la ausencia de alertas se confunde con ausencia de incidentes
- Los logs de la plataforma mezclan líneas propias del proveedor con las del servicio

### Technical constraints

- Proveedor de monitoreo de disponibilidad y agregación de logs: Better Stack

### Documentación relevante

- `duck-spec/docs/BACKEND.md` — sección "Logging strategy": formato estructurado, campos estables y propagación del identificador de request

### Dependencias

- INFRA-010 — la topología de despliegue debe ser la definitiva antes de instrumentar el monitoreo

---

## INFRA-012 — CI/CD sobre DigitalOcean y Cloudflare

**Estado:** DONE

### Contexto

Desde INFRA-010 el repositorio no tiene automatización de despliegue: cada entrega se hace manualmente contra dos proveedores distintos. Fue una decisión deliberada, porque las features intermedias fueron sumando variables de entorno, secretos y pasos de build —entre ellos la publicación de los artefactos que permiten resolver las trazas de error de las dos SPAs—.

Con ese inventario ya completo y estable, el pipeline puede construirse una sola vez en lugar de modificarse en cada feature.

### Objetivo

Automatizar el despliegue de los tres apps por rama, con despliegue manual de un commit específico y rollback.

### Requerimientos funcionales

- Un merge a la rama de integración despliega los tres apps en el environment de desarrollo
- Un merge a la rama principal despliega los tres apps en el environment de producción
- Un flujo manual permite desplegar un commit específico en el environment elegido
- Un flujo manual permite volver a desplegar un commit anterior en el environment elegido
- El despliegue de cada SPA publica los artefactos que permiten resolver las trazas de error correspondientes a esa versión
- Cada despliegue deja registrado en su salida el environment y el commit que está entregando
- Los despliegues simultáneos al mismo environment se encolan en lugar de cancelarse entre sí

### Fuera de scope

- Ejecución de tests y linting dentro del pipeline
- Environments de previsualización por pull request
- Notificaciones de despliegue a canales externos
- Aprovisionamiento de las cuentas y proyectos en los proveedores
- Migraciones de base de datos como parte del despliegue

### Requerimientos no funcionales

- Los secretos necesarios para desplegar no deben quedar versionados en el repositorio
- Un fallo en el despliegue de un app no debe dejar a los otros en un estado inconsistente sin que quede evidente en la salida
- La configuración por environment debe estar en un único lugar y no duplicada por app

### Edge cases

- El backend y las SPAs se despliegan en proveedores distintos: un despliegue parcial deja el frontend y la API en versiones desalineadas
- Los artefactos de resolución de trazas deben corresponder exactamente a la versión publicada, o los reportes de error quedan apuntando a líneas equivocadas
- Un rollback del backend no revierte los cambios de datos ya aplicados
- Dos merges consecutivos al mismo environment pueden intentar desplegar en paralelo y pisarse
- Una variable de entorno agregada a mano en el proveedor pero no en el pipeline se pierde en el siguiente despliegue si el pipeline reescribe la configuración
- El despliegue de las SPAs y el del backend tienen duraciones muy distintas, por lo que el pipeline no debe dar el conjunto por exitoso antes de que ambos terminen

### Technical constraints

- Automatización: GitHub Actions
- Estrategia de ramas: feature branch → `develop` (dev) → `main` (prod)

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — pipeline de CI/CD y estrategia de environments

### Dependencias

- LANDING-003 — el inventario de variables, secretos y pasos de build debe estar completo antes de automatizarlo

---

## INFRA-013 — Runbook de aprovisionamiento y despliegue

**Estado:** TODO

### Contexto

Al terminar la migración el proyecto depende de un conjunto de proveedores externos: compute, hosting estático, base de datos, autenticación, pagos, email, observabilidad y analítica. Cada uno requiere crear una cuenta, un proyecto y un conjunto de credenciales, y varios exigen pasos manuales que ninguna automatización cubre.

Ese conocimiento hoy existe únicamente en la cabeza de quien hizo la migración, disperso entre una docena de features. Como el proyecto es una base reutilizable pensada para arrancar productos nuevos, ese vacío es el que más caro sale: el código se clona en un minuto y el stack tarda días en reconstruirse.

### Objetivo

Documentar el aprovisionamiento y la operación del stack completo, de modo que alguien que clona el repositorio pueda levantarlo desde cero sin reconstruir el razonamiento detrás de cada decisión.

### Requerimientos funcionales

- El documento enumera los proveedores externos de los que depende el proyecto y para qué se usa cada uno
- El documento describe qué hay que crear en cada proveedor y qué credenciales entrega cada uno
- El documento contiene el inventario completo de variables de entorno, indicando para cada una qué componente la consume y dónde se carga
- El documento describe el aprovisionamiento desde cero, en orden, hasta tener un environment funcionando
- El documento describe cómo desplegar, cómo desplegar un commit específico y cómo hacer rollback
- El documento describe cómo rotar una credencial comprometida
- El documento enumera los pasos manuales que ninguna automatización cubre y en qué momento del aprovisionamiento corresponde hacerlos

### Fuera de scope

- Automatizar el aprovisionamiento de los proveedores
- Guía de desarrollo local y puesta en marcha del entorno de trabajo
- Documentación de la arquitectura de la aplicación, ya cubierta por otros documentos vivos
- Diagnóstico de incidentes y procedimientos de guardia
- Reproducir la documentación de producto de cada proveedor

### Requerimientos no funcionales

- El documento debe permitir levantar un environment nuevo sin consultar a quien hizo la migración
- El inventario de variables debe ser verificable contra el código y la especificación de despliegue, para poder detectar cuándo quedó desactualizado
- El documento no debe contener credenciales ni valores reales, solo el nombre de cada variable y su origen

### Edge cases

- El orden de aprovisionamiento importa: hay valores que un proveedor solo entrega después de configurar otro, y documentarlos en el orden equivocado bloquea a quien lo sigue
- Varios pasos manuales tienen demora externa —verificación de dominio por DNS, confirmación de suscripciones de alerta— y quien los ejecuta debe saber de antemano que hay una espera
- Los planes gratuitos de varios proveedores tienen límites que solo se descubren en producción y conviene dejarlos advertidos
- Un documento de este tipo se desactualiza en el primer cambio de infraestructura si no queda establecido qué lo mantiene al día
- El aprovisionamiento del primer environment difiere del segundo, porque algunos recursos son por cuenta y otros por environment

### Technical constraints

- El runbook se escribe como documento vivo en `duck-spec/docs/RUNBOOK.md`, junto al resto de la documentación del proyecto

### Documentación relevante

- `duck-spec/docs/INFRASTRUCTURE.md` — recursos y topología de despliegue vigentes

### Dependencias

- INFRA-012 — el pipeline de despliegue debe existir para poder documentarlo
