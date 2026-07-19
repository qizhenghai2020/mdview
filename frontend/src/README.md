# Frontend Source Layout

This project keeps files grouped by responsibility without splitting large feature files just for structure.

- `app/`: application entry, root Vue component, and global app styles.
- `modules/`: feature areas. A module owns its UI, state helpers, and feature-specific utilities.
- `shared/`: reusable code used by more than one module, such as markdown rendering, shared components, and diagnostics.
- `assets/`: static files imported by the app, including images and bundled fonts.

Use the `@/` alias for cross-folder imports, for example `@/modules/settings/constants`.
Use relative `./` imports for files in the same folder.
