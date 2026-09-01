# Basis brand assets

- `basis-icon-signal.svg` is the product icon source for desktop bundles and
  the compact application lockup.
- `basis-mark-adaptive.svg` is the transparent `currentColor` monogram for
  contexts that must inherit semantic theme color.

Generate the Tauri desktop icon set from the product icon source:

```powershell
pnpm tauri icon assets/brand/basis-icon-signal.svg --output src-tauri/icons
```

Do not hand-edit generated files under `src-tauri/icons/`.
