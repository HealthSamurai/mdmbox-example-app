# mdmbox-example-app

Example application demonstrating [mdmbox-sdk](https://github.com/HealthSamurai/mdmbox-sdk) usage — patient matching, merging, and deduplication on FHIR servers.

Built with React, Vite, Tailwind CSS, and [Aidbox](https://www.health-samurai.io/aidbox) as the FHIR backend.

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Bun](https://bun.sh/) runtime

## Quick start

```bash
# Clone the repo
git clone https://github.com/HealthSamurai/mdmbox-example-app.git
cd mdmbox-example-app

# Install dependencies
bun install

# Start infrastructure (Postgres, Aidbox, MDMbox)
docker compose up -d

# Initialize: create client, load sample data, set up matching model
./setup/run.sh

# Start the dev server
bun run dev
```

Open http://localhost:3002 in your browser.

## Infrastructure

`docker compose up -d` starts three services:

| Service | Image | Port | Description |
|---|---|---|---|
| `aidbox-db` | `postgres:18` | 5438 | PostgreSQL database |
| `aidbox` | `healthsamurai/aidboxone:edge` | 8888 | Aidbox FHIR server |
| `mdmbox` | `healthsamurai/mdmbox:edge` | 3003 | MDMbox matching engine |

## Setup

The `setup/` folder contains initialization resources:

| File | Description |
|---|---|
| `run.sh` | Init script — waits for services, then runs all setup steps |
| `init-sql.json` | Pre-built JSON wrapper for `init.sql` (for Aidbox `/$sql` endpoint) |
| `app-client.json` | Aidbox Client resource with Basic auth |
| `patient-model.json` | MDMbox matching model configuration |
| `patients-query.yaml` | AidboxQuery for patient search |

The init script performs the following steps:

1. Waits for Aidbox and MDMbox to be ready
2. Creates SQL functions (via Aidbox `/$sql`)
3. Creates an Aidbox Client for Basic auth
4. Loads 1000 sample patients
5. Creates an AidboxQuery for patient search
6. Creates a matching model in MDMbox

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AIDBOX_URL` | `http://localhost:8888` | Aidbox FHIR server URL |
| `AIDBOX_AUTH` | `Basic YmFzaWM6c2VjcmV0` | Aidbox Basic auth credentials |
| `MDMBOX_URL` | `http://localhost:3003` | MDMbox API URL |
| `PORT` | `3000` | Production server port |

## Features

- **Patient search** — search, filter, sort, and paginate patients from Aidbox
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

The production server proxies `/mdm-api/*` to MDMbox, `/fhir/*` and `/$query/*` to Aidbox, and serves the SPA from `dist/`.

## License

[MIT](LICENSE) — Health Samurai
