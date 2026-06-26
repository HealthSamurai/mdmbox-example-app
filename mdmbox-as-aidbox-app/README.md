# mdmbox as an Aidbox App

A single-page **notebook** (served by Bun, styled like mdmbox's `/welcome`) that:

1. **Registers an Aidbox App** which declares two operations — `POST Patient/$match`
   and `POST $merge` — with its http-rpc endpoint pointing at mdmbox's built-in
   `aidbox-app-proxy`.
2. **Runs `$match` through Aidbox** — Aidbox routes the operation straight to
   mdmbox, which runs the probabilistic match and returns the searchset Bundle.
3. **Runs `$merge` through Aidbox** — Aidbox routes the operation to mdmbox's
   `/api/$merge`, which executes the merge plan (a transaction Bundle).

The Bun server only **registers the App** and provides the page. It is **not** in
the match/merge request path.

## Flow

```
browser ──POST /fhir/Patient/$match──▶ Aidbox
Aidbox  ──http-rpc──▶ mdmbox /api/aidbox-app-proxy → /api/fhir/Patient/$match
Aidbox  ──Bundle──▶ browser

browser ──POST /$merge──▶ Aidbox
Aidbox  ──http-rpc──▶ mdmbox /api/aidbox-app-proxy → /api/$merge
Aidbox  ──result──▶ browser
```

mdmbox's proxy maps each operation `path` to `/api/<path…>`, so `["fhir","Patient","$match"]`
becomes `/api/fhir/Patient/$match` and `["$merge"]` becomes `/api/$merge`.

The Aidbox App manifest registered in Cell 1:

```json
{
  "resourceType": "App",
  "id": "mdmbox.match",
  "apiVersion": 1,
  "type": "app",
  "endpoint": {
    "type": "http-rpc",
    "url": "http://host.docker.internal:3003/api/aidbox-app-proxy",
    "secret": "…"
  },
  "operations": {
    "patient-match": { "method": "POST", "path": ["fhir", "Patient", "$match"] },
    "patient-merge": { "method": "POST", "path": ["$merge"] }
  }
}
```

## Run with Docker Compose (recommended)

```bash
docker compose up
```

This brings up `aidbox-db`, `mdmbox`, `aidbox`, and the `notebook`. Open:

- Notebook: http://localhost:3300
- Aidbox:   http://localhost:8888  (admin: `admin` / `password`)
- mdmbox:   http://localhost:3003

In mdmbox, install the matching model (`patient-example`) and load some patients
first — e.g. via the mdmbox `/welcome` page — then use the notebook's Cell 2.

## Run the notebook in dev mode (Aidbox/mdmbox in Docker)

```bash
bun run dev
```

`dev` runs `bun --watch notebook.ts` with the env preset for a Dockerized stack
(`APP_ENDPOINT_URL` points at mdmbox via `host.docker.internal`). Edit `notebook.ts`
and it reloads; refresh the tab to see page changes. Without watch: `bun run start`.

## Configuration (env)

| Variable            | Default                                                   | Purpose                                          |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| `PORT`              | `3300`                                                    | Notebook server port                             |
| `AIDBOX_URL`        | `http://localhost:8888`                                   | Aidbox base URL (register App / call `$match`)   |
| `PUBLIC_AIDBOX_URL` | `http://localhost:8888`                                   | Aidbox URL shown in the page text (display only) |
| `AIDBOX_AUTH`       | `Basic cm9vdDpyb290` (root:root)                          | Auth for registering the App / calling `$match`  |
| `MDMBOX_URL`        | `http://localhost:3003`                                   | mdmbox base URL (display only)                   |
| `MODEL_ID`          | `patient-example`                                         | MatchingModel id used for `$match`               |
| `APP_ENDPOINT_URL`  | `http://host.docker.internal:3003/api/aidbox-app-proxy`   | http-rpc endpoint Aidbox calls (mdmbox's proxy)  |
| `APP_ID`            | `mdmbox.match`                                            | Aidbox App resource id                           |
| `APP_SECRET`        | `mdmbox-match-secret`                                     | http-rpc shared secret                           |
