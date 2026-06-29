# MDMbox $merge that Deactivates the Source

A tiny Bun notebook. You create patients in **Aidbox**, then run **mdmbox `$merge`**
over them. Aidbox and mdmbox share one database, so a Patient created in Aidbox is
visible to mdmbox.

The merge plan **does not delete** the source — it PUTs the source back with
`active: false` and a `replaced-by` link to the surviving target, so the duplicate
is retired but stays queryable for audit/history.

No subscriptions, no webhooks — just a manual `$merge` call.

## Flow

```
browser ──seed──▶ Bun ──PUT /fhir/Patient/{id}──▶ Aidbox   (create source + target)
browser ──merge─▶ Bun ──POST /api/$merge──────────▶ mdmbox  (source → active:false)
```

## Run

```bash
$ docker compose up
```

Then open http://localhost:3300.

- Aidbox: http://localhost:8888 (seed / read patients)
- mdmbox: http://localhost:3003 ($merge)
- notebook: http://localhost:3300

> **License note.** Aidbox and mdmbox in this stack share one database. Each needs
> its own activation, and they must not overwrite each other's license record in
> the shared DB. If a service redirects every request to its login/activation page
> (the notebook surfaces this as a clear error), activate it and retry. Aidbox will
> refuse to start with `Required license for 'aidbox', got 'mdmbox'` if the shared
> DB holds an mdmbox license — sort the activations out before running the flow.

## Use it

1. **Seed sample patients in Aidbox** (Cell 1) — creates a target
   (`merge-target-jane`) and a source (`merge-source-jane`) via Aidbox FHIR. Skip if
   you already have patients.
2. **Run `$merge`** (Cell 2) — pick the source/target ids and a preview flag, then
   run. With `preview: false` the notebook reads the source back and shows it is now
   `active: false`. **Read source after merge** re-checks at any time.

## The merge plan

`$merge` executes the transaction Bundle the client sends. This example builds two
`PUT` entries (no `DELETE`):

1. **Target** — the surviving record (target wins scalar conflicts, arrays
   union-merged, missing target fields filled from the source), plus a
   `replaces` link back to the source:

```json
{
  "resource": {
    "resourceType": "Patient",
    "id": "merge-target-jane",
    "link": [
      { "type": "replaces", "other": { "reference": "Patient/merge-source-jane" } }
    ]
  },
  "request": { "method": "PUT", "url": "Patient/merge-target-jane" }
}
```

2. **Source** — the same source resource with `active: false` and a `replaced-by`
   link to the target (the reciprocal of the target's `replaces`):

```json
{
  "resource": {
    "resourceType": "Patient",
    "id": "merge-source-jane",
    "active": false,
    "link": [
      { "type": "replaced-by", "other": { "reference": "Patient/merge-target-jane" } }
    ]
  },
  "request": { "method": "PUT", "url": "Patient/merge-source-jane" }
}
```

mdmbox `$merge` has no built-in "deactivate" flag. Deleting vs. deactivating is
purely what the plan contains: a `DELETE` entry, or this `PUT` with `active: false`.
The `$merge` operation still records Task/Provenance for audit and unmerge.
