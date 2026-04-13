# mdmbox-example-app

Example application demonstrating [mdmbox-sdk](https://github.com/HealthSamurai/mdmbox-sdk) usage — patient matching, merging, and deduplication on FHIR servers.

Built with React, Vite, Tailwind CSS, and [Aidbox](https://www.health-samurai.io/aidbox) as the FHIR backend.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Running [Aidbox](https://www.health-samurai.io/aidbox) instance with patient data
- Running [MDMbox](https://www.health-samurai.io/mdmbox) instance
- An Aidbox Client configured with Basic authentication — see [Basic HTTP Authentication](https://www.health-samurai.io/docs/aidbox/access-control/authentication/basic-http-authentication) for setup instructions

## Getting started

```bash
# Clone the repo
git clone https://github.com/HealthSamurai/mdmbox-example-app.git
cd mdmbox-example-app

# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env

# Start the dev server
bun run dev
```

Open http://localhost:3002 in your browser.

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
