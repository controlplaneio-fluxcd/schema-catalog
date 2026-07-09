# Project logos

Drop a project's logo here as `<name>.svg`, where `<name>` is the project's
`name` from `build/config/sources.yaml` (the same slug used in `/p/<name>`
routes). The build picks it up automatically:

- `scripts/gen-index.ts` flags the matching project with `logo: true` in
  `index.json`, so the UI knows a mark exists without probing for a missing file.
- `scripts/build-ui.ts` copies every `*.svg` here into `dist/assets/logos/`,
  served at `/logos/<name>.svg`.

The UI renders the mark left of the title in the project hero (`/p/<name>`) and
the kind hero (`/k/<group>/<kind>/<version>`). It is sized to a 40×40 box and
`object-fit: contain`, so square marks read best; keep the artwork tight to its
bounds with no baked-in padding.

## Dark marks

Some brand icons are dark-on-transparent (e.g. KEDA's navy octagon, Dapr's
indigo mark) and vanish on the dark theme. Drop those as `<name>.plate.svg`
instead of `<name>.svg`. The build reads the `.plate` suffix, records it in the
index, and the UI renders that mark on a light plate on the dark theme (on the
light theme it reads on the page as-is). The served path stays `/logos/<name>.svg`
— the `.plate` infix is dropped on copy — so the filename is the only place the
distinction lives. No code or CSS edit is needed per logo.

A logo whose basename matches no project name is skipped with a build warning.
Projects without a logo render title-only, unchanged.
