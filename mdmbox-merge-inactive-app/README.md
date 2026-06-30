# Merge that Deactivates the Source

This example shows how to run an MDMbox `$merge` that **does not delete** the
source patient. Instead of removing the duplicate, the merge plan PUTs it back
with `active: false` and a `replaced-by` link to the surviving target, so the
retired record stays queryable for audit and history.

Aidbox and MDMbox in this stack share one database, so a Patient created in
Aidbox is visible to MDMbox. There are no subscriptions or webhooks here — just a
manual, five-step `$merge` flow.

## Set Up Aidbox and MDMbox

First of all, start Aidbox, MDMbox, and the notebook:

```bash
$ docker compose up
```

Once Aidbox is up and running, browse http://localhost:8888 and click
"Continue with Aidbox account". This will automatically issue a developer
license for you and redirect you back.

Then do the same with MDMbox. Open http://localhost:3003 and click
"Sign in to activate".

You'll see the [Welcome to MDMBox](http://localhost:3003/welcome)
page. Click your way through the setup steps to import sample patients
and install a matching model.

## Run the Merge Flow

Open http://localhost:3300 and follow the instructions there. This is a notebook
that walks through the deactivating `$merge` in five steps:

1. **POST `Patient/1`** — create the target (the survivor).
2. **POST `Patient/2`** — create the source (the duplicate).
3. **POST `$merge`** — merge `Patient/2` into `Patient/1`; the source is kept inactive.
4. **GET `Patient/1`** — read back the merged survivor.
5. **GET `Patient/2`** — read back the retired source (`active: false`).

## How it works

The notebook first creates two patients in Aidbox via FHIR `PUT` (upsert). The
target is the survivor and the source is the duplicate:

```json
{
  "resourceType": "Patient",
  "id": "1",
  "active": true,
  "name": [{ "use": "official", "given": ["Jane"], "family": "Doe" }]
}
```

Then it sends a `$merge` to MDMbox. `$merge` executes the transaction Bundle the
client sends, so deleting vs. deactivating is purely what the plan contains.
This example builds two `PUT` entries (no `DELETE`).

The first entry is the **surviving target** (target wins scalar conflicts,
arrays are union-merged, missing target fields are filled from the source), plus
a `replaces` link back to the source:

```json
{
  "resource": {
    "resourceType": "Patient",
    "id": "1",
    "link": [
      { "type": "replaces", "other": { "reference": "Patient/2" } }
    ]
  },
  "request": { "method": "PUT", "url": "Patient/1" }
}
```

The second entry is the **source**, PUT back with `active: false` and a
`replaced-by` link to the target (the reciprocal of the target's `replaces`):

```json
{
  "resource": {
    "resourceType": "Patient",
    "id": "2",
    "active": false,
    "link": [
      { "type": "replaced-by", "other": { "reference": "Patient/1" } }
    ]
  },
  "request": { "method": "PUT", "url": "Patient/2" }
}
```

MDMbox `$merge` has no built-in "deactivate" flag — the behaviour comes entirely
from the plan: a `DELETE` entry would remove the source, while this `PUT` with
`active: false` retires it. Either way, `$merge` records Task/Provenance for
audit and unmerge.

## Services

- Aidbox: http://localhost:8888 (create / read patients)
- MDMbox: http://localhost:3003 (`$merge`)
- notebook: http://localhost:3300
