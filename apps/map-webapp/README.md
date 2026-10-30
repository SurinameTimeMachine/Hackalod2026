# Hackalod map webapp

Standalone Next.js package within the Hackalod2026 repository. Existing shared data and documentation remain at the repository root.

## Run locally

Requires Node.js 20.9 or newer and pnpm 11.25.0.

```sh
cd apps/map-webapp
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000.

```sh
pnpm build
pnpm start
pnpm lint
```

App-specific static data lives in `public/data`. Paths are relative to this package; run the commands above from this directory.
