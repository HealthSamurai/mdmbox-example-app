# mdmbox-example-app

Example application demonstrating [mdmbox-sdk](https://github.com/HealthSamurai/mdmbox-sdk) usage — patient matching, merging, and deduplication on FHIR servers.

Built with React, Vite, Tailwind CSS, and [MDMbox](https://www.health-samurai.io/) as the FHIR backend (via its libox FHIR-proxy).

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Bun](https://bun.sh/) runtime

## Quick start

```bash
git clone https://github.com/HealthSamurai/mdmbox-example-app.git
cd mdmbox-example-app

bun install

# Start infrastructure (Postgres, MDMbox)
docker compose up -d

# Start the dev server
bun dev
```

Then open http://localhost:3003 ("Welcome to MDMbox") and set things up
through the UI — see [First run](#first-run) below. Once that's done, open
http://localhost:3002 in your browser to use the app.

## Infrastructure

`docker compose up -d` starts two services:

| Service | Image | Port | Description |
|---|---|---|---|
| `mdmbox-db` | `postgres:18` | 5438 | PostgreSQL database |
| `mdmbox` | `healthsamurai/mdmbox:edge` | 3003 | MDMbox (matching engine + libox FHIR-proxy) |

## First run

The first time you start the stack, set MDMbox up through its own UI — no
scripts required. Open http://localhost:3003 ("Welcome to MDMbox") and:

1. **Activate the license** — go to `/admin` and activate the license.
2. **Load sample patients** — import some patient data so there's something to
   match against (e.g. the public `fake1000.ndjson.gz` dataset).
3. **Create a matching model** — define a `MatchingModel` for `Patient`. The
   app's model picker lists every Patient model it finds, defaulting to one
   named `patient-model`.

Everything above is done by clicking through the MDMbox UI. Once a Patient
model exists and patients are loaded, the app at http://localhost:3002 is
ready to use.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MDMBOX_URL` | `http://localhost:3003` | MDMbox API URL |
| `PORT` | `3000` | Production server port |

## Features

- **Patient search** — search, filter, and paginate patients via FHIR search
- **Duplicate matching** — find potential duplicates using MDMbox matching models with configurable thresholds
- **Record merging** — side-by-side field comparison, reference relinking, merge preview and execution
- **Merge history** — browse and inspect past merge operations with provenance details

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start Vite dev server (port 3002) |
| `bun run build` | Type-check and build for production |
| `bun run serve` | Serve production build with Bun (port 3000) |
| `bun run typegen` | Regenerate FHIR R4 type definitions |

## Production

```bash
bun run build
bun run serve
```

The production server proxies `/api/*` and `/fhir-server-api/*` to MDMbox, and serves the SPA from `dist/`.

## License

[MIT](LICENSE) — Health Samurai
