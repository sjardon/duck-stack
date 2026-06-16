# web

Módulo de la aplicación web (SaaS frontend). Cubre la estructura, arquitectura en capas y features de la app React + Vite orientada al usuario final del producto.

---

## WEB-001 — Web App Base Structure

**Estado:** TODO

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
