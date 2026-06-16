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

**Estado:** DONE

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

---

## INFRA-003 — Static Hosting (S3 + CloudFront)

**Estado:** DONE

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

---

## INFRA-004 — CI/CD Pipeline (GitHub Actions)

**Estado:** TODO

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
