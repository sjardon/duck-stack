# landing

Módulo de la landing page del SaaS. Cubre la estructura y componentes de las páginas de marketing, orientadas a conversión y presentación del producto.

---

## LANDING-001 — Landing Base Structure

**Estado:** TODO

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
