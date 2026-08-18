# web

Módulo de la aplicación web (SaaS frontend). Cubre la estructura, arquitectura en capas y features de la app React + Vite orientada al usuario final del producto.

---

## WEB-001 — Web App Base Structure

**Estado:** DONE

### Contexto

El monorepo está scaffoldeado (INFRA-001) con la app `web` como un proyecto Vite + React vacío. Se necesita establecer la arquitectura base antes de agregar cualquier feature de dominio.

### Objetivo

Establecer la estructura base de la app `web` con arquitectura en capas (api, hooks, components, pages, store), React Query y Zustand, lista para agregar features de dominio.

### Requerimientos funcionales

- Estructura de carpetas: `pages/`, `components/ui/`, `components/domain/`, `api/`, `hooks/`, `store/`, `lib/`
- `api/client.ts`: cliente HTTP base con placeholder para auth header
- Setup de React Query: `QueryClientProvider` configurado en el entry point (`main.tsx`)
- `store/session.store.ts`: Zustand store para datos de sesión del usuario (forma base vacía, extensible)
- `store/ui.store.ts`: Zustand store para estado de UI global (forma base vacía, extensible)
- `lib/formatters.ts`: stubs de funciones de formato (`formatDate`, `formatCurrency`)
- `lib/utils.ts`: helpers genéricos sin dependencias de React
- Ejemplo funcional completo: `api/health.ts` + `hooks/useHealth.ts` + `pages/health/HealthPage.tsx` para validar el patrón end-to-end

### Fuera de scope

- Componentes de dominio específicos de negocio
- Sistema de diseño (tokens CSS, tipografías, paleta de colores)
- Autenticación y sesión real (feature separada)
- Routing más allá del mínimo para el ejemplo de health check

### Requerimientos no funcionales

- Las páginas son los únicos archivos que llaman a hooks de fetching
- Los componentes `ui/` no importan tipos de `@repo/types` ni conocen el dominio
- Los componentes `domain/` nunca llaman a la API directamente

### Technical constraints

- Framework: Vite + React + TypeScript
- Data fetching: React Query (`@tanstack/react-query`)
- Estado global: Zustand
- Tipos de dominio: `@repo/types` (interfaces TypeScript puras)
- HTTP client: fetch nativo envuelto en `api/client.ts`
- Arquitectura: capas estrictas — api → hooks → pages → components

### Dependencias

- INFRA-001 — la app `web` debe existir en el monorepo
- SERVICES-001 — el endpoint `/health` debe existir para el ejemplo funcional

---

## WEB-002 — Error tracking en `web`

**Estado:** DONE

### Contexto

SERVICES-011 dejó visibles los errores del backend, pero la mitad de lo que sufre un usuario ocurre en su navegador. Hoy `web` no reporta nada: un error de render deja la pantalla en blanco, el usuario recarga o se va, y nadie se entera de que ocurrió.

A eso se suma que el bundle publicado está minificado, por lo que cualquier traza que llegara sin resolver sería ilegible y no serviría para diagnosticar.

### Objetivo

Que los errores de la SPA del producto lleguen reportados, agrupados y con trazas que apunten al código fuente original.

### Requerimientos funcionales

- Los errores no capturados y las promesas rechazadas de la SPA se reportan automáticamente
- Las trazas de los reportes se resuelven al código fuente original en lugar del bundle publicado
- Un error de render deja de romper la aplicación en silencio y presenta al usuario una pantalla de error
- Cada reporte indica el environment y la versión desplegada
- Los reportes quedan atribuidos al usuario autenticado mediante su identificador, sin incluir datos personales
- El reporte de errores se activa por configuración y su ausencia no impide que la aplicación funcione

### Fuera de scope

- Reproducción de sesiones y analítica de producto (WEB-003)
- Métricas de rendimiento del frontend
- Instrumentación de `landing` (LANDING-002)
- Reporte de errores originados en la API, que ya cubre el backend
- Traducción o presentación al usuario de los mensajes de error de dominio

### Requerimientos no funcionales

- Los artefactos que permiten resolver las trazas no deben quedar accesibles públicamente junto al bundle
- La instrumentación no debe retrasar de forma perceptible la carga inicial de la aplicación
- No se envían datos personales del usuario ni contenido de los formularios que completa
- Un fallo del proveedor de reportes no puede impedir que la aplicación funcione

### Edge cases

- Sin los artefactos de resolución cargados, las trazas llegan minificadas y el reporte no sirve para diagnosticar
- Los artefactos deben corresponder exactamente a la versión publicada: un desfase produce trazas que apuntan a líneas equivocadas, que es peor que no tenerlas
- Extensiones del navegador y scripts de terceros generan errores ajenos a la aplicación que ensucian el reporte
- Un error dentro del propio límite de error puede dejar la aplicación sin ninguna pantalla que mostrar
- El usuario puede no estar autenticado al momento del error, por lo que la atribución debe ser opcional y su ausencia no debe descartar el reporte
- La configuración del frontend se embebe en el bundle y es de acceso público, por lo que no admite valores sensibles

### Technical constraints

- Proveedor de error tracking: Better Stack, compatible con los SDK de Sentry
- Instrumentación con el SDK de Sentry para React apuntado al destino del proveedor mediante configuración
- Los artefactos de resolución de trazas se generan en el build de producción y se publican en el proveedor como parte del despliegue

### Documentación relevante

- `duck-spec/docs/FRONTEND.md` — estructura por capas y convenciones de la app
- `duck-spec/modules/services/FEATURES.md` — SERVICES-011, convenciones de configuración e identificación de environment y versión

### Dependencias

- SERVICES-011 — el proyecto de error tracking y las convenciones de configuración por environment deben estar establecidos

---

## WEB-003 — Product analytics y feature flags en `web`

**Estado:** TODO

### Contexto

Con WEB-002 el producto sabe cuándo se rompe, pero sigue sin saber si se usa. No hay ningún registro de qué hacen los usuarios dentro de la aplicación, qué pantallas visitan ni dónde abandonan, de modo que cualquier decisión sobre el producto se toma por intuición.

Tampoco hay forma de habilitar una funcionalidad para un subconjunto de usuarios sin desplegarla para todos, lo que empuja a mantener ramas largas o a lanzar en bloque.

### Objetivo

Registrar el uso del producto y permitir habilitar funcionalidades por usuario sin necesidad de desplegar.

### Requerimientos funcionales

- Las vistas y las acciones relevantes del producto quedan registradas como eventos
- Los eventos quedan atribuidos al usuario autenticado que los originó
- Las sesiones de usuario pueden reproducirse para diagnosticar problemas reportados
- La aplicación puede consultar si una funcionalidad está habilitada para el usuario actual y renderizar en consecuencia
- Un cambio en la habilitación de una funcionalidad se refleja en la aplicación sin necesidad de desplegar
- La analítica se activa por configuración y su ausencia no impide que la aplicación funcione

### Fuera de scope

- Evaluación de habilitaciones del lado del backend
- Experimentos A/B y su análisis estadístico
- Analítica de la landing (LANDING-003)
- Embudos, informes y paneles a medida dentro del proveedor
- Banner de consentimiento de cookies y gestión del consentimiento
- Reemplazar las verificaciones de permisos, entitlements o suscripción existentes por habilitaciones

### Requerimientos no funcionales

- El registro de eventos no debe bloquear ni retrasar la interacción del usuario
- No se registran datos personales ni contenido sensible dentro de los eventos
- La reproducción de sesiones debe enmascarar la entrada de datos del usuario
- Una habilitación que no pueda resolverse por un fallo del proveedor debe caer en un valor por defecto seguro y nunca dejar la interfaz bloqueada

### Edge cases

- La consulta de habilitaciones es asincrónica: renderizar antes de conocer el valor produce un parpadeo visible en la interfaz
- Un bloqueador de anuncios puede impedir la carga del proveedor, dejando a la aplicación sin eventos y sin habilitaciones a la vez
- La reproducción de sesiones puede capturar datos personales visibles en pantalla si no se enmascara explícitamente
- El usuario puede navegar antes de autenticarse, por lo que esos eventos quedan sin atribución hasta que se identifica
- El volumen de eventos puede agotar la cuota del plan, especialmente si se registran interacciones de alta frecuencia
- Una habilitación consultada antes de que el usuario esté identificado puede resolverse con un contexto distinto al esperado y cambiar de valor al identificarse

### Technical constraints

- Proveedor de analítica de producto y habilitaciones: PostHog

### Documentación relevante

- `duck-spec/docs/FRONTEND.md` — estructura por capas y convenciones de la app

### Dependencias

- WEB-002 — las convenciones de configuración e instrumentación del frontend se establecen ahí
