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

Go to http://localhost:3003/admin and acitvate license

# Load sample patients and create the matching model
./setup/run.sh

# Start the dev server
bun dev
```

Open http://localhost:3002 in your browser.

## Infrastructure

`docker compose up -d` starts two services:

| Service | Image | Port | Description |
|---|---|---|---|
| `mdmbox-db` | `postgres:18` | 5438 | PostgreSQL database |
| `mdmbox` | `healthsamurai/mdmbox:edge` | 3003 | MDMbox (matching engine + libox FHIR-proxy) |

## Setup

The `setup/` folder contains initialization resources:

| File | Description |
|---|---|
| `run.sh` | Init script — waits for MDMbox, loads sample data, creates the matching model |
| `patient-model.json` | MDMbox matching model configuration |

The init script performs the following steps:

1. Waits for MDMbox to be ready
2. Loads 1000 sample patients via `POST /fhir-server-api/$load`
3. Creates a matching model in MDMbox

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
