# VisionGuard design tokens

`styles.css` is the shared visual foundation. Add new components with the existing
color, spacing, radius, shadow, typography, and motion tokens instead of literal
values. Light mode is the default; override tokens under `[data-theme="dark"]`
for dark mode. Existing application classes such as `.btn`, `.panel`, `.nav-link`,
`.form-grid`, and `.table` remain available while the visual language evolves.

Use `--ease-out-soft` for entrances and layout transitions, `--ease-spring` for
small interactive feedback, and respect `prefers-reduced-motion` for every new
animation.
