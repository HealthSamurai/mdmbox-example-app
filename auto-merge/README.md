# Auto-Merge

This example shows how to configure Aidbox to notify a small auto-merge proxy
when a new Patient is created.

The proxy receives the notification, asks MDMbox if the new Patient is a
duplicate, and if it is, sends the merge request.

The path is simple:

```text
Aidbox -> auto-merge proxy -> MDMbox
```

## Set Up Aidbox and MDMbox

First of all, start Aidbox, MDMbox, the notebook, and the auto-merge proxy:

```bash
$ docker compose up
```

Once Aidbox is up and running, browse http://localhost:8888 and click
"Continue with Aidbox account". This will automatically issue a developer
license for you and redirect you back.

Then do the same with MDMbox. Open http://localhost:3003 and click
"Sign in to activate".

You'll see the [Welcome to MDMBox](http://localhost:3003/welcome) page.
Click your way through the setup steps. Import sample patients. Install the
matching model. Run the checks there.

Do this MDMbox welcome setup before using the notebook. The notebook assumes
that MDMbox has the `patient-example` matching model installed.

## Open the Notebook

Open http://localhost:3300.

The notebook will walk you through the requests slowly:

1. `PUT /fhir/AidboxSubscriptionTopic/mdmbox-patient-created` — create the topic for `Patient/create`.
2. `POST /fhir/AidboxTopicDestination` — create the webhook destination.
3. `PUT /fhir/Patient/main-jane-doe` — create the existing Patient that should survive.
4. `POST /fhir/Patient` — create the new duplicate Patient.
5. `GET /api/events?patientId={id}` — read proxy events for the new Patient.
6. `GET /fhir/Patient/{id}` — read the merged target Patient.

Each notebook section is one REST request. The section header is the method and
the URL. If the request has a body, the collapsed block contains only that body.

## How it works

The auto-merge proxy talks to MDMbox using a client.

If MDMbox auth is enabled, that client does not need to be created by hand.
In this compose file MDMbox creates it automatically because these envs are set
on the `mdmbox` service:

```yaml
MDMBOX_API_CLIENT_ID: mdmbox-automerge-client
MDMBOX_API_CLIENT_SECRET: mdmbox-automerge-secret
```

The proxy uses the same credentials when it calls MDMbox:

```yaml
MDMBOX_CLIENT_ID: mdmbox-automerge-client
MDMBOX_CLIENT_SECRET: mdmbox-automerge-secret
```

So the idea is simple: MDMbox starts, sees the `MDMBOX_API_CLIENT_ID` and
`MDMBOX_API_CLIENT_SECRET` envs, creates the client, and then the auto-merge
proxy can use that client to call MDMbox.

The notebook creates an `AidboxSubscriptionTopic` for `Patient/create`:

```json
{
  "resourceType": "AidboxSubscriptionTopic",
  "id": "mdmbox-patient-created",
  "url": "http://mdmbox.example/SubscriptionTopic/mdmbox-patient-created",
  "status": "active",
  "trigger": [
    {
      "resource": "Patient",
      "supportedInteraction": [
        "create"
      ]
    }
  ]
}
```

Then the notebook creates an `AidboxTopicDestination`. This tells Aidbox where
to send the event:

```json
{
  "resourceType": "AidboxTopicDestination",
  "id": "mdmbox-automerge-webhook",
  "meta": {
    "profile": [
      "http://aidbox.app/StructureDefinition/aidboxtopicdestination-webhook-at-least-once"
    ]
  },
  "status": "active",
  "kind": "webhook-at-least-once",
  "topic": "http://mdmbox.example/SubscriptionTopic/mdmbox-patient-created",
  "content": "full-resource",
  "includeEntryAction": true,
  "includeVersionId": true,
  "parameter": [
    {
      "name": "endpoint",
      "valueUrl": "http://proxy:3301/webhooks/patient-created"
    },
    {
      "name": "header",
      "valueString": "Authorization: Bearer aidbox-to-bun-secret"
    }
  ]
}
```

After that, continue with the remaining requests in the notebook: create the
existing Patient, create the new Patient, read proxy events, and read the final
Patient.
