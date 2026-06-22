# settings

**Scope:** Preferencias y configuración del usuario autenticado. Centraliza opciones que afectan la experiencia personal del usuario dentro de `apps/web`, como apariencia, idioma o notificaciones futuras. Actúa como módulo contenedor para cualquier feature de configuración que no pertenezca a un dominio de negocio específico.

---

## SETTINGS-001 — Theme (Dark/Light Mode)

**Estado:** TODO

**Contexto:** `apps/web` no tiene sistema de theming. El `useUiStore` existe pero está vacío, diseñado para ser extendido. No hay página de settings ni ruta `/settings`. El proyecto es un starter pack, por lo que el sistema de theming debe ser una base extensible que los adoptantes puedan personalizar sin tocar la lógica de componentes.

**Objetivo:** Permitir al usuario autenticado cambiar entre modo oscuro y claro desde una página de settings, con detección automática de la preferencia del sistema operativo y persistencia de la selección entre sesiones.

**Requerimientos funcionales:**
- En la primera visita, la app detecta la preferencia de color del sistema operativo (`prefers-color-scheme`) y aplica el tema correspondiente sin intervención del usuario.
- La selección del usuario se persiste en `localStorage` y se restaura en recargas posteriores, tomando precedencia sobre la preferencia del sistema.
- Existe una ruta `/settings` accesible dentro del layout autenticado (`AppLayout`).
- La página `/settings` muestra un control de toggle para cambiar entre modo claro y oscuro.
- Al cambiar el tema desde el toggle, el cambio se aplica de forma inmediata en toda la app sin necesidad de recargar la página.
- El tema activo se aplica mediante CSS custom properties en el elemento `<html>`, de forma que los adoptantes puedan reemplazar los valores de los tokens sin modificar componentes.

**Requerimientos no funcionales:**
- Los valores de los CSS custom properties son placeholders con colores mínimos funcionales; no forman un sistema de diseño completo.
- `useUiStore` se extiende con el valor del tema activo (`'light' | 'dark'`), siguiendo el patrón ya establecido de extensión in-place del store.
- La lógica de lectura/escritura de `localStorage` y detección de `prefers-color-scheme` no debe vivir en componentes — debe encapsularse en una utilidad o hook dedicado.

**Fuera de scope:**
- Theming para `apps/landing`.
- Sistema de diseño completo (paleta de colores definitiva, tipografía, espaciado).
- Toggle de tema en el header o en cualquier lugar fuera de `/settings`.
- Cualquier otra preferencia de usuario más allá del tema.
- Soporte para temas adicionales más allá de claro y oscuro.

**Edge cases:**
- El usuario tiene `prefers-color-scheme: dark` pero ya había seleccionado modo claro manualmente — debe respetarse la preferencia guardada en `localStorage`.
- `localStorage` no está disponible (contexto privado/incógnito en algunos browsers) — la app debe operar en modo degradado usando solo la preferencia del sistema, sin lanzar errores.
- El usuario cambia la preferencia del sistema operativo mientras tiene la app abierta — si no hay preferencia guardada en `localStorage`, el cambio debe reflejarse en vivo.

**Technical constraints:**
- El tema se aplica añadiendo/quitando una clase (`dark`) en `<html>`, lo que permite que los CSS custom properties de ambos temas coexistan en el mismo stylesheet.
- `useUiStore` (Zustand) es la fuente de verdad del tema activo en runtime; `localStorage` es solo persistencia.

**Documentación relevante:**
- `duck-spec/docs/FRONTEND.md` — convenciones de capas, estructura de stores
- `apps/web/src/store/ui.store.ts` — store a extender
- `apps/web/src/components/layout/AppLayout.tsx` — layout autenticado donde se añade la ruta `/settings`

**Dependencias:**
- WEB-001 — la estructura base de `apps/web` y `useUiStore` deben existir.
