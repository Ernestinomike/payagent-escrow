# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## PayAgent Escrow System

Smart contract–backed gig worker payment system on Celo blockchain.

### Contract
- `attached_assets/PayAgentEscrow-2.sol_*.txt` — Solidity source (ERC-20 cUSD escrow)
- Deployed via `/api/admin/deploy` POST endpoint or the standalone script

### Deployment
- **Via API** (requires external RPC access): `POST /api/admin/deploy { "network": "alfajores" }`
- **Via script** (recommended): `pnpm --filter @workspace/scripts run deploy-celo`
  - Requires `DEPLOYER_PRIVATE_KEY`, `AI_AGENT_PRIVATE_KEY` in env
  - Fund deployer wallet at https://faucet.celo.org for alfajores testnet
- **Pre-deployed contract**: Set `CONTRACT_ADDRESS` secret + `CELO_NETWORK` env var to wire in an existing deployment

### API Endpoints
- `POST /api/escrow/deposit` — Employer deposits cUSD into escrow
- `GET  /api/escrow/:jobId` — Get escrow details
- `GET  /api/escrow/worker/:address` — Get worker's jobs
- `GET  /api/escrow/employer/:address` — Get employer's jobs
- `POST /api/payments/release` — AI agent releases payment (autonomous)
- `POST /api/payments/dispute` — Initiate dispute
- `GET  /api/receipts/:jobId` — On-chain receipt for a job
- `GET  /api/receipts/worker/:address` — All receipts for a worker
- `GET  /api/admin/deploy` — Deploy contract to Celo
- `GET  /api/admin/status` — Contract status + config
- `GET  /api/admin/transactions` — Transaction log with pagination

### Live Deployment (Celo Sepolia Testnet)
- **Contract Address:** `0xeCF63926531da7163E26C0adbB4B5E37BB2b957D`
- **Tx Hash:** `0x0ac88f967ad3264f501edf7d4aa2e0833f3b7c2ca8a8188a786ea237178ee7d0`
- **Celoscan:** https://alfajores.celoscan.io/address/0xeCF63926531da7163E26C0adbB4B5E37BB2b957D
- **Deployer:** `0x9d28FB300f06EE34d7A9A9531b363c0153fB979d`
- **AI Agent:** `0xD6E3cFC7095491B4B31253B31b517d9d9aC7CC85`
- **Deployed at block:** 21933441

### Network Config
- `CELO_NETWORK` — "celoSepolia" (testnet, active) | "alfajores" | "celo" (mainnet)
- `CONTRACT_ADDRESS` — set to `0xeCF63926531da7163E26C0adbB4B5E37BB2b957D` (live)
- RPC: Alchemy (`celo-sepolia.g.alchemy.com`) with Forno fallback
- cUSD addresses auto-selected from known Celo addresses per network

### GitHub
- GitHub connector not yet connected (dismissed during OAuth). Options:
  1. Reconnect via Replit GitHub integration
  2. Provide a GitHub Personal Access Token (repo scope) as a secret to push via API

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
