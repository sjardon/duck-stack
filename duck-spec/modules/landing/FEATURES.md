# landing

Módulo de la landing page del SaaS. Cubre la estructura y componentes de las páginas de marketing, orientadas a conversión y presentación del producto.

---

## LANDING-001 — Landing Base Structure

**Estado:** DONE

### Contexto

El monorepo está scaffoldeado (INFRA-001) con la app `landing` como un proyecto Vite + React vacío. La landing es una app de marketing estática, más simple que `web`: sin estado global, sin data fetching complejo ni lógica de dominio.

### Objetivo

Establecer la estructura base de la app `landing` con una arquitectura simple orientada a páginas de marketing, lista para agregar secciones y contenido del producto.

### Requerimientos funcionales

- Estructura de carpetas: `components/layout/`, `components/sections/`, `components/ui/`, `pages/`, `api/`, `lib/`
- `components/layout/`: componentes estructurales reutilizables (`Navbar`, `Footer`)
- `components/sections/`: secciones de marketing de ejemplo (`Hero`, `Features`, `CTA`)
- `components/ui/`: primitivos propios de la landing (`Button`, `Badge`)
- `pages/HomePage.tsx`: página principal que compone las secciones
- `api/contact.ts`: función stub para envío de formulario de contacto
- `lib/utils.ts`: helpers genéricos sin dependencias de React
- Routing mínimo: una ruta `/` que renderiza `HomePage`

### Fuera de scope

- React Query (sin data fetching complejo)
- Zustand (sin estado global)
- Tipos de dominio de `@repo/types` (la landing no consume entidades de negocio)
- Sistema de diseño completo (tokens, tipografías, paleta)
- Formulario de contacto funcional (solo stub)
- Páginas adicionales (blog, pricing, etc.)

### Requerimientos no funcionales

- Las secciones deben ser independientes entre sí y componibles en cualquier orden en `HomePage`
- Los componentes `ui/` no deben tener dependencias externas más allá de React

### Technical constraints

- Framework: Vite + React + TypeScript
- Sin React Query ni Zustand
- HTTP: fetch nativo solo donde sea necesario
- Routing: React Router (mínimo)

### Dependencias

- INFRA-001 — la app `landing` debe existir en el monorepo

---

## LANDING-002 — Error tracking en `landing`

**Estado:** DONE

### Contexto

WEB-002 dejó visibles los errores de la SPA del producto. La landing quedó sin cubrir, y es la primera impresión que alguien tiene del producto: un error de render deja la página en blanco frente a un visitante que todavía no tiene ninguna relación con el producto y que simplemente se va sin reportar nada.

Como en `web`, el bundle publicado está minificado, por lo que una traza sin resolver no sirve para diagnosticar.

### Objetivo

Que los errores de la landing lleguen reportados y con trazas que apunten al código fuente original.

### Requerimientos funcionales

- Los errores no capturados y las promesas rechazadas de la landing se reportan automáticamente
- Las trazas de los reportes se resuelven al código fuente original en lugar del bundle publicado
- Un error de render presenta una pantalla de error en lugar de dejar la página vacía
- Cada reporte indica el environment y la versión desplegada
- El reporte de errores se activa por configuración y su ausencia no impide que la landing funcione

### Fuera de scope

- Analítica de conversión (LANDING-003)
- Atribución de los reportes a un usuario: la landing es anónima
- Métricas de rendimiento y de posicionamiento
- Instrumentación de `web` (WEB-002)

### Requerimientos no funcionales

- Los artefactos que permiten resolver las trazas no deben quedar accesibles públicamente junto al bundle
- La instrumentación no debe retrasar de forma perceptible la carga inicial, que en una página de marketing es determinante
- No se envía ningún dato que permita identificar al visitante
- Un fallo del proveedor de reportes no puede impedir que la landing se muestre

### Edge cases

- Sin los artefactos de resolución cargados, las trazas llegan minificadas y el reporte no sirve para diagnosticar
- Los artefactos deben corresponder exactamente a la versión publicada o las trazas apuntan a líneas equivocadas
- Los bloqueadores del navegador son más frecuentes en tráfico de marketing que en el de producto y pueden impedir el propio envío del reporte, sesgando lo que se ve
- Un error dentro del propio límite de error deja la página sin nada que mostrar, justo en la primera impresión del producto
- La configuración se embebe en el bundle público y no admite valores sensibles

### Technical constraints

- Proveedor de error tracking: Better Stack, compatible con los SDK de Sentry
- Instrumentación con el SDK de Sentry para React apuntado al destino del proveedor mediante configuración
- Los artefactos de resolución de trazas se generan en el build de producción y se publican en el proveedor como parte del despliegue

### Dependencias

- WEB-002 — el mecanismo de resolución de trazas y las convenciones de configuración del frontend se establecen ahí

---

## LANDING-003 — Analítica de conversión en `landing`

**Estado:** TODO

### Contexto

LANDING-002 dejó visibles los errores de la landing y WEB-003 instrumentó la analítica del producto. Falta el tramo anterior a ambos: no hay forma de saber cuánta gente llega a la landing, de dónde viene, ni cuántos de esos visitantes terminan registrándose.

Sin ese dato, cualquier cambio en el mensaje o la estructura de la landing se evalúa por intuición, y el recorrido del usuario queda partido en dos mitades que no se pueden unir: lo que pasa antes del registro y lo que pasa después.

### Objetivo

Medir el tráfico de la landing y su conversión hacia el registro, vinculando al visitante anónimo con el usuario que después se crea.

### Requerimientos funcionales

- Las visitas a la landing quedan registradas junto con su origen de tráfico
- Las acciones que llevan al registro quedan registradas como eventos de conversión
- La identidad anónima del visitante se vincula con el usuario cuando este se registra, de modo que el recorrido completo quede unido
- La analítica se activa por configuración y su ausencia no impide que la landing funcione

### Fuera de scope

- Habilitación de funcionalidades y experimentos en la landing
- Reproducción de sesiones en la landing
- Banner de consentimiento de cookies y gestión del consentimiento
- Informes y paneles a medida dentro del proveedor
- Analítica de producto (WEB-003)
- Integración con plataformas publicitarias

### Requerimientos no funcionales

- La instrumentación no debe retrasar de forma perceptible la carga de la landing
- No se registran datos personales del visitante antes de que este se identifique
- El vínculo entre visitante anónimo y usuario registrado no debe romperse al navegar entre la landing y la aplicación, que son dos despliegues distintos

### Edge cases

- La landing y la aplicación son despliegues separados: si no comparten el identificador anónimo, el recorrido queda partido y la conversión no puede atribuirse
- Los bloqueadores del navegador son más frecuentes en tráfico de marketing y pueden impedir el registro de una parte de las visitas, sesgando sistemáticamente la medición
- El origen de tráfico se pierde si el visitante llega, se va y vuelve por otro camino antes de registrarse
- Un visitante que ya es usuario también genera visitas a la landing y no debe contarse como conversión nueva
- El registro ocurre en un proveedor de autenticación externo, por lo que el momento exacto de la conversión puede quedar fuera del alcance de la landing

### Technical constraints

- Proveedor de analítica: PostHog, el mismo que instrumenta el producto, para que ambos recorridos vivan en el mismo lugar

### Dependencias

- LANDING-002 — las convenciones de configuración e instrumentación de la landing se establecen ahí
- WEB-003 — el proyecto de analítica y el modelo de identificación de usuarios se definen ahí
