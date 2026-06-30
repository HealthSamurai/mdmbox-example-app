/**
 * mdmbox-automerge-app - a single-page example served by Bun.
 *
 * Stepwise (no webhook/subscription — that lives in a separate app). You drive
 * the match + merge by hand, one button per call:
 *
 *   1. Setup           - register the MDMbox User/Client/AccessPolicy for this app
 *   2. POST existing   - seed the surviving Patient into Aidbox
 *   3. POST new        - create the incoming duplicate Patient into Aidbox
 *   4. POST $match     - ask MDMbox whether the new Patient matches an existing one
 *   5. POST $merge     - merge the new Patient (source) into the matched one (target)
 *   6. GET  result     - read the surviving Patient back after the merge
 *
 * The matching model is NOT created here — install it via the MDMbox welcome
 * setup. This notebook only references it by id (MODEL_ID).
 */

type JsonRecord = Record<string, any>;

type JsonResponse = {
  ok: boolean;
  status: number;
  url: string;
  body: unknown;
  text: string;
};

const PORT = parseInt(process.env.PORT || "3300", 10);

const AIDBOX_URL = trimSlash(process.env.AIDBOX_URL || "http://localhost:8888");
const PUBLIC_AIDBOX_URL = trimSlash(process.env.PUBLIC_AIDBOX_URL || "http://localhost:8888");
const AIDBOX_AUTH = process.env.AIDBOX_AUTH || "Basic cm9vdDpyb290"; // root:root

const MDMBOX_URL = trimSlash(process.env.MDMBOX_URL || "http://localhost:3003");
const PUBLIC_MDMBOX_URL = trimSlash(process.env.PUBLIC_MDMBOX_URL || "http://localhost:3003");
const MDMBOX_ADMIN_AUTH = process.env.MDMBOX_ADMIN_AUTH || "Basic cm9vdDpyb290"; // root:root

const MODEL_ID = process.env.MODEL_ID || "patient-example";
const MATCH_RESULT_LIMIT = parseInt(process.env.MATCH_RESULT_LIMIT || "1", 10);

const MDMBOX_USER_ID = process.env.MDMBOX_USER_ID || "mdmbox-automerge-user";
const MDMBOX_USER_PASSWORD =
  process.env.MDMBOX_USER_PASSWORD || "mdmbox-automerge-password";
const MDMBOX_CLIENT_ID = process.env.MDMBOX_CLIENT_ID || "mdmbox-automerge-client";
const MDMBOX_CLIENT_SECRET =
  process.env.MDMBOX_CLIENT_SECRET || "mdmbox-automerge-secret";
const MDMBOX_ACCESS_POLICY_ID =
  process.env.MDMBOX_ACCESS_POLICY_ID || "mdmbox-automerge-access";
const MDMBOX_APP_AUTH =
  process.env.MDMBOX_APP_AUTH || basicAuth(MDMBOX_CLIENT_ID, MDMBOX_CLIENT_SECRET);

const EXISTING_PATIENT_ID = process.env.EXISTING_PATIENT_ID || "main-jane-doe";
const NEW_PATIENT_ID = process.env.NEW_PATIENT_ID || "incoming-jane-doe";

const DIR = import.meta.dir;

// ---------------------------------------------------------------------------
// Resource manifests
// ---------------------------------------------------------------------------
function mdmboxUser() {
  return {
    resourceType: "User",
    id: MDMBOX_USER_ID,
    password: MDMBOX_USER_PASSWORD,
  };
}

function mdmboxClient() {
  return {
    resourceType: "Client",
    id: MDMBOX_CLIENT_ID,
    secret: MDMBOX_CLIENT_SECRET,
    grant_types: ["basic"],
  };
}

function mdmboxAccessPolicy() {
  return {
    resourceType: "AccessPolicy",
    id: MDMBOX_ACCESS_POLICY_ID,
    engine: "allow",
    description: "Allows the Bun auto-merge example client to call mdmbox APIs",
    link: [{ reference: `Client/${MDMBOX_CLIENT_ID}` }],
  };
}

function setupManifest() {
  return {
    mdmbox: {
      user: mdmboxUser(),
      client: mdmboxClient(),
      accessPolicy: mdmboxAccessPolicy(),
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function jsonRequest(
  url: string,
  opts: {
    method?: string;
    auth?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<JsonResponse> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...opts.headers,
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth) headers.authorization = opts.auth;

  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    url,
    body: safeJson(text),
    text,
  };
}

async function aidboxFhir(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<JsonResponse> {
  return jsonRequest(`${AIDBOX_URL}/fhir/${path.replace(/^\//, "")}`, {
    ...opts,
    auth: AIDBOX_AUTH,
  });
}

async function mdmboxApi(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<JsonResponse> {
  return jsonRequest(`${MDMBOX_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...opts,
    auth: MDMBOX_APP_AUTH,
  });
}

async function mdmboxAdmin(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<JsonResponse> {
  return jsonRequest(`${MDMBOX_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...opts,
    auth: MDMBOX_ADMIN_AUTH,
  });
}

async function mdmboxIamUpsert(
  resourceType: "User" | "Client",
  id: string,
  resource: JsonRecord,
): Promise<JsonResponse> {
  const path = `/api/iam/${resourceType}/${encodeURIComponent(id)}`;
  const existing = await mdmboxAdmin(path);

  if (existing.ok) {
    return mdmboxAdmin(path, { method: "PUT", body: resource });
  }

  if (existing.status === 404) {
    return mdmboxAdmin(`/api/iam/${resourceType}`, { method: "POST", body: resource });
  }

  return existing;
}

async function mdmboxServerFhir(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<JsonResponse> {
  return mdmboxApi(`/fhir-server-api/${path.replace(/^\//, "")}`, opts);
}

// ---------------------------------------------------------------------------
// Step 1: Setup MDMbox access for this app
// ---------------------------------------------------------------------------
async function registerSetupResources() {
  const results: Record<string, JsonResponse> = {};

  results.mdmboxUser = await mdmboxIamUpsert("User", MDMBOX_USER_ID, mdmboxUser());
  results.mdmboxClient = await mdmboxIamUpsert("Client", MDMBOX_CLIENT_ID, mdmboxClient());

  // In this compose stack Aidbox and mdmbox share the same database. The mdmbox
  // IAM API manages User/Client, while AccessPolicy is still a shared Aidbox
  // system resource linked to the mdmbox client.
  results.mdmboxAccessPolicy = await aidboxFhir(
    `AccessPolicy/${MDMBOX_ACCESS_POLICY_ID}`,
    {
      method: "PUT",
      body: mdmboxAccessPolicy(),
    },
  );

  // Smoke-test the client's credentials against the MDMbox API.
  results.mdmboxClientAuthCheck = await mdmboxApi("/api/models");

  const ok = Object.values(results).every((r) => r.ok);
  return {
    ok,
    status: ok ? 200 : 502,
    resources: setupManifest(),
    results,
  };
}

// ---------------------------------------------------------------------------
// Patient helpers
// ---------------------------------------------------------------------------
function patientFromInput(input: JsonRecord, fallbackId: string): JsonRecord {
  const id = sanitizeId(input.id || fallbackId);
  const telecom = [
    input.phone ? { system: "phone", value: String(input.phone).trim(), use: "mobile" } : undefined,
    input.email ? { system: "email", value: String(input.email).trim(), use: "home" } : undefined,
  ].filter(Boolean);
  const identifier = input.identifier
    ? [
        {
          system: input.identifierSystem || "https://example.org/mrn",
          value: String(input.identifier).trim(),
        },
      ]
    : undefined;
  const address =
    input.line || input.city || input.state || input.postalCode || input.country
      ? [
          {
            line: input.line ? [String(input.line).trim()] : undefined,
            city: input.city || undefined,
            state: input.state || undefined,
            postalCode: input.postalCode || undefined,
            country: input.country || undefined,
          },
        ]
      : undefined;

  return compact({
    resourceType: "Patient",
    id,
    active: true,
    identifier,
    name: [
      {
        use: "official",
        given: splitGiven(input.given),
        family: input.family || undefined,
      },
    ],
    birthDate: input.birthDate || undefined,
    gender: input.gender || undefined,
    telecom,
    address,
  });
}

async function upsertAidboxPatient(patient: JsonRecord) {
  const id = String(patient.id || "").trim();
  if (!id) throw new Error("Patient.id is required");
  const result = await aidboxFhir(`Patient/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: patient,
  });
  return {
    ok: result.ok,
    status: result.status,
    request: { method: "PUT", url: `Patient/${id}`, body: patient },
    response: result.body,
  };
}

async function readAidboxPatient(id: string) {
  const result = await aidboxFhir(`Patient/${encodeURIComponent(id)}`);
  return {
    ok: result.ok,
    status: result.status,
    request: { method: "GET", url: `Patient/${id}` },
    response: result.body,
  };
}

async function readMdmboxPatient(id: string) {
  return mdmboxServerFhir(`Patient/${encodeURIComponent(id)}`);
}

function defaultExistingPatient() {
  return patientFromInput(
    {
      id: EXISTING_PATIENT_ID,
      identifier: "MRN-1000",
      given: "Jane",
      family: "Doe",
      birthDate: "1985-04-12",
      gender: "female",
      phone: "+1-555-0100",
      email: "jane.doe@example.org",
      line: "10 Market Street",
      city: "Boston",
      state: "MA",
      postalCode: "02108",
      country: "US",
    },
    EXISTING_PATIENT_ID,
  );
}

function defaultNewPatient() {
  return patientFromInput(
    {
      id: NEW_PATIENT_ID,
      identifier: "MRN-2000",
      given: "Jane",
      family: "Doe",
      birthDate: "1985-04-12",
      gender: "female",
      phone: "+1-555-0101",
      email: "jane.alt@example.org",
      city: "Boston",
    },
    NEW_PATIENT_ID,
  );
}

// ---------------------------------------------------------------------------
// Step 4: $match
// ---------------------------------------------------------------------------
function buildMatchParameters(patient: JsonRecord) {
  return {
    resourceType: "Parameters",
    parameter: [
      { name: "modelId", valueString: MODEL_ID },
      { name: "resource", resource: patient },
      { name: "onlySingleMatch", valueBoolean: true },
      { name: "count", valueInteger: MATCH_RESULT_LIMIT },
    ],
  };
}

async function runMatch(input: JsonRecord) {
  const id = String(input.id || NEW_PATIENT_ID).trim();
  if (!id) return { ok: false, status: 400, error: "Patient id is required." };

  const read = await aidboxFhir(`Patient/${encodeURIComponent(id)}`);
  if (!read.ok) return { ok: false, status: read.status, error: `Patient/${id} not found in Aidbox`, response: read.body };

  const body = buildMatchParameters(read.body as JsonRecord);
  const result = await mdmboxApi("/api/fhir/Patient/$match", { method: "POST", body });

  const matched = firstMatch(result.body);
  return {
    ok: result.ok,
    status: result.status,
    matchedId: matched?.id,
    total: (result.body as any)?.total,
    request: { method: "POST", url: "/api/fhir/Patient/$match", body },
    response: result.body,
  };
}

function firstMatch(bundle: any): JsonRecord | null {
  const entry = Array.isArray(bundle?.entry) ? bundle.entry[0] : undefined;
  if (!entry) return null;
  const resource = entry.resource || {};
  const id = resource.id || extractIdFromFullUrl(entry.fullUrl || "");
  return id ? { ...resource, id } : resource;
}

// ---------------------------------------------------------------------------
// Step 5: $merge
// ---------------------------------------------------------------------------
function buildMergeParameters(opts: {
  source: string;
  target: string;
  entries: JsonRecord[];
  preview?: boolean;
}) {
  return {
    resourceType: "Parameters",
    parameter: [
      { name: "source", valueReference: { reference: opts.source } },
      { name: "target", valueReference: { reference: opts.target } },
      { name: "preview", valueBoolean: opts.preview === true },
      {
        name: "plan",
        resource: {
          resourceType: "Bundle",
          type: "transaction",
          entry: opts.entries,
        },
      },
    ],
  };
}

function buildPrimitiveMergePlan(sourcePatient: JsonRecord, targetPatient: JsonRecord) {
  const sourceId = requiredId(sourcePatient, "source patient");
  const targetId = requiredId(targetPatient, "target patient");
  const mergedTarget = mergeResourcePreferTarget(sourcePatient, targetPatient);

  const putEntry: JsonRecord = {
    resource: mergedTarget,
    request: {
      method: "PUT",
      url: `Patient/${targetId}`,
    },
  };
  const targetEtag = etag(targetPatient);
  if (targetEtag) putEntry.request.ifMatch = targetEtag;

  const deleteEntry: JsonRecord = {
    request: {
      method: "DELETE",
      url: `Patient/${sourceId}`,
    },
  };
  const sourceEtag = etag(sourcePatient);
  if (sourceEtag) deleteEntry.request.ifMatch = sourceEtag;

  return {
    source: `Patient/${sourceId}`,
    target: `Patient/${targetId}`,
    entries: [putEntry, deleteEntry],
    mergedTarget,
  };
}

async function runMerge(input: JsonRecord) {
  // source = the new (incoming) patient, target = the matched existing one.
  const sourceId = String(input.sourceId || NEW_PATIENT_ID).trim();
  const targetId = String(input.targetId || "").trim();
  if (!sourceId || !targetId) {
    return { ok: false, status: 400, error: "Both source and target Patient ids are required (run $match first)." };
  }

  const sourceRead = await aidboxFhir(`Patient/${encodeURIComponent(sourceId)}`);
  if (!sourceRead.ok) return { ok: false, status: sourceRead.status, error: `Source Patient/${sourceId} not found in Aidbox`, response: sourceRead.body };
  const targetRead = await readMdmboxPatient(targetId);
  if (!targetRead.ok) return { ok: false, status: targetRead.status, error: `Target Patient/${targetId} not found in mdmbox`, response: targetRead.body };

  const plan = buildPrimitiveMergePlan(sourceRead.body as JsonRecord, targetRead.body as JsonRecord);
  const body = buildMergeParameters({ source: plan.source, target: plan.target, entries: plan.entries, preview: false });
  const result = await mdmboxApi("/api/$merge", { method: "POST", body });

  return {
    ok: result.ok,
    status: result.status,
    source: plan.source,
    target: plan.target,
    request: { method: "POST", url: "/api/$merge", body },
    response: result.body,
  };
}

// ---------------------------------------------------------------------------
// Merge strategy
// ---------------------------------------------------------------------------
function mergeResourcePreferTarget(source: JsonRecord, target: JsonRecord): JsonRecord {
  const result: JsonRecord = deepClone(target);
  for (const [key, sourceValue] of Object.entries(source)) {
    if (["resourceType", "id", "meta"].includes(key)) continue;
    result[key] = mergeValuePreferTarget(sourceValue, result[key]);
  }
  result.resourceType = target.resourceType || source.resourceType || "Patient";
  result.id = target.id;
  if (target.meta) result.meta = target.meta;
  return compact(result);
}

function mergeValuePreferTarget(sourceValue: any, targetValue: any): any {
  if (Array.isArray(sourceValue) || Array.isArray(targetValue)) {
    return unionUnique(
      Array.isArray(targetValue) ? targetValue : [],
      Array.isArray(sourceValue) ? sourceValue : [],
    );
  }

  if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
    const result: JsonRecord = deepClone(targetValue);
    for (const [key, value] of Object.entries(sourceValue)) {
      result[key] = mergeValuePreferTarget(value, result[key]);
    }
    return compact(result);
  }

  if (isFilled(targetValue)) return targetValue;
  return deepClone(sourceValue);
}

function unionUnique(targetItems: any[], sourceItems: any[]) {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const item of [...targetItems, ...sourceItems]) {
    if (!isFilled(item)) continue;
    const key = stableStringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(deepClone(item));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
function trimSlash(s: string) {
  return s.replace(/\/$/, "");
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function basicAuth(id: string, secret: string) {
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

function sanitizeId(id: string) {
  return String(id)
    .trim()
    .replace(/[^A-Za-z0-9\-.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitGiven(value: unknown) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function requiredId(resource: JsonRecord, label: string) {
  const id = String(resource?.id || "").trim();
  if (!id) throw new Error(`${label} must have id`);
  return id;
}

function extractIdFromFullUrl(fullUrl: string) {
  const parts = String(fullUrl || "").split("/");
  return parts[parts.length - 1] || "";
}

function etag(resource: JsonRecord) {
  const versionId = resource?.meta?.versionId;
  return versionId ? `W/"${versionId}"` : undefined;
}

function isPlainObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFilled(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => compact(v)).filter(isFilled) as T;
  }
  if (isPlainObject(value)) {
    const result: JsonRecord = {};
    for (const [key, item] of Object.entries(value)) {
      const compacted = compact(item);
      if (isFilled(compacted)) result[key] = compacted;
    }
    return result as T;
  }
  return value;
}

function deepClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === "/" || pathname === "/index.html") {
      return new Response(renderPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (pathname === "/notebook.css") {
      return new Response(Bun.file(`${DIR}/notebook.css`));
    }

    if (pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (pathname === "/api/config" && req.method === "GET") {
      return Response.json({
        aidboxUrl: AIDBOX_URL,
        publicAidboxUrl: PUBLIC_AIDBOX_URL,
        mdmboxUrl: MDMBOX_URL,
        publicMdmboxUrl: PUBLIC_MDMBOX_URL,
        modelId: MODEL_ID,
        mdmboxClientId: MDMBOX_CLIENT_ID,
        existingPatientId: EXISTING_PATIENT_ID,
        newPatientId: NEW_PATIENT_ID,
        resources: setupManifest(),
      });
    }

    // Step 1: setup MDMbox access for this app.
    if (pathname === "/api/setup" && req.method === "POST") {
      try {
        const result = await registerSetupResources();
        return Response.json(result, { status: result.ok ? 200 : 502 });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 502 });
      }
    }

    // Step 2: POST the existing (surviving) patient into Aidbox.
    if (pathname === "/api/existing-patient" && req.method === "POST") {
      try {
        const result = await upsertAidboxPatient(defaultExistingPatient());
        return Response.json(result, { status: result.ok ? 200 : result.status || 502 });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 502 });
      }
    }

    // Step 3: POST the new (incoming, duplicate) patient into Aidbox.
    if (pathname === "/api/new-patient" && req.method === "POST") {
      try {
        const result = await upsertAidboxPatient(defaultNewPatient());
        return Response.json(result, { status: result.ok ? 200 : result.status || 502 });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 502 });
      }
    }

    // Step 4: POST $match for the new patient.
    if (pathname === "/api/match" && req.method === "POST") {
      try {
        const input = await req.json().catch(() => ({}));
        const result = await runMatch(input);
        return Response.json(result, { status: (result as any).ok ? 200 : (result as any).status || 502 });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 502 });
      }
    }

    // Step 5: POST $merge (new patient -> matched patient).
    if (pathname === "/api/merge" && req.method === "POST") {
      try {
        const input = await req.json().catch(() => ({}));
        const result = await runMerge(input);
        return Response.json(result, { status: (result as any).ok ? 200 : (result as any).status || 502 });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 502 });
      }
    }

    // Step 6: GET a patient back from Aidbox.
    if (pathname === "/api/patient" && req.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const result = await readAidboxPatient(id);
      return Response.json(result, { status: result.ok ? 200 : result.status || 502 });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`mdmbox auto-merge example -> http://localhost:${server.port}`);
console.log(`Aidbox:  ${AIDBOX_URL}`);
console.log(`mdmbox:  ${MDMBOX_URL}`);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function renderPage(): string {
  const manifest = JSON.stringify(setupManifest(), null, 2);
  const existingJson = JSON.stringify(defaultExistingPatient(), null, 2);
  const newJson = JSON.stringify(defaultNewPatient(), null, 2);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mdmbox - match + merge</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
  <link rel="stylesheet" href="/notebook.css" />
</head>
<body>
  <nav class="navbar">
    <a class="navbar-brand" href="/"><span class="dot"></span><span>mdmbox &times; Aidbox</span></a>
    <span class="navbar-meta">model: ${escapeHtml(MODEL_ID)}</span>
  </nav>

  <main class="page">
    <header class="page-header">
      <h1 class="page-title">Match &amp; merge a duplicate Patient, step by step</h1>
      <p class="page-subtitle">
        Create two similar patients in Aidbox, ask mdmbox <code>$match</code> whether they
        are the same person, then <code>$merge</code> the new one into the existing record.
        Each step is one explicit API call. The matching model
        (<code>${escapeHtml(MODEL_ID)}</code>) is installed separately via the mdmbox welcome
        setup; this notebook only references it.
      </p>
    </header>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Step 1</span>
        <span class="cell-title">Setup mdmbox access for this app</span>
        <span class="cell-badge" id="badge-1">idle</span>
      </div>
      <div class="cell-body">
        <div class="key-grid">
          <div><span>Aidbox</span><code>${escapeHtml(PUBLIC_AIDBOX_URL)}</code></div>
          <div><span>mdmbox</span><code>${escapeHtml(PUBLIC_MDMBOX_URL)}</code></div>
          <div><span>model</span><code>${escapeHtml(MODEL_ID)}</code></div>
        </div>
        <p class="muted">
          Creates <code>User</code>, <code>Client</code> and an <code>AccessPolicy</code> so this
          app can call mdmbox, then smoke-tests the client credentials.
        </p>
        <details class="disclosure">
          <summary>Resources created by setup</summary>
          <pre class="code">${escapeHtml(manifest)}</pre>
        </details>
        <div class="actions">
          <button class="btn btn-primary" id="btn-1">Setup resources</button>
          <span class="spinner" id="spin-1" hidden>Working...</span>
        </div>
        <div id="out-1"></div>
      </div>
    </section>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Step 2</span>
        <span class="cell-title">POST <code>Patient/${escapeHtml(EXISTING_PATIENT_ID)}</code> (existing, survives)</span>
        <span class="cell-badge" id="badge-2">idle</span>
      </div>
      <div class="cell-body">
        <p class="muted">Seeds the existing patient that the new one should match.</p>
        <details class="disclosure">
          <summary>Request body</summary>
          <pre class="code">${escapeHtml(existingJson)}</pre>
        </details>
        <div class="actions">
          <button class="btn btn-primary" id="btn-2">POST existing Patient</button>
          <span class="spinner" id="spin-2" hidden>Posting...</span>
        </div>
        <div id="out-2"></div>
      </div>
    </section>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Step 3</span>
        <span class="cell-title">POST <code>Patient/${escapeHtml(NEW_PATIENT_ID)}</code> (new, duplicate)</span>
        <span class="cell-badge" id="badge-3">idle</span>
      </div>
      <div class="cell-body">
        <p class="muted">Creates the incoming duplicate that we will match and merge.</p>
        <details class="disclosure">
          <summary>Request body</summary>
          <pre class="code">${escapeHtml(newJson)}</pre>
        </details>
        <div class="actions">
          <button class="btn btn-primary" id="btn-3">POST new Patient</button>
          <span class="spinner" id="spin-3" hidden>Posting...</span>
        </div>
        <div id="out-3"></div>
      </div>
    </section>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Step 4</span>
        <span class="cell-title">POST <code>$match</code></span>
        <span class="cell-badge" id="badge-4">idle</span>
      </div>
      <div class="cell-body">
        <p class="muted">
          Asks mdmbox whether <code>Patient/${escapeHtml(NEW_PATIENT_ID)}</code> matches an
          existing patient (<code>onlySingleMatch</code>). The matched id feeds Step 5.
        </p>
        <div class="actions">
          <button class="btn btn-primary" id="btn-4">POST $match</button>
          <span class="spinner" id="spin-4" hidden>Matching...</span>
        </div>
        <div id="out-4"></div>
      </div>
    </section>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Step 5</span>
        <span class="cell-title">POST <code>$merge</code></span>
        <span class="cell-badge" id="badge-5">idle</span>
      </div>
      <div class="cell-body">
        <p class="muted">
          Merges the new patient (source) into the matched patient (target). Run Step 4 first
          so the matched id is known.
        </p>
        <div class="field-row">
          <div class="field">
            <label for="f-source">Source id (new)</label>
            <input id="f-source" value="${escapeHtml(NEW_PATIENT_ID)}" />
          </div>
          <div class="field">
            <label for="f-target">Target id (matched)</label>
            <input id="f-target" placeholder="run $match first" />
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" id="btn-5">POST $merge</button>
          <span class="spinner" id="spin-5" hidden>Merging...</span>
        </div>
        <div id="out-5"></div>
      </div>
    </section>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Step 6</span>
        <span class="cell-title">GET the merged Patient</span>
        <span class="cell-badge" id="badge-6">idle</span>
      </div>
      <div class="cell-body">
        <p class="muted">Reads the surviving (target) patient back after the merge.</p>
        <div class="field-row">
          <div class="field">
            <label for="f-result">Patient id</label>
            <input id="f-result" placeholder="target id from $merge" />
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" id="btn-6">GET Patient</button>
          <span class="spinner" id="spin-6" hidden>Reading...</span>
        </div>
        <div id="out-6"></div>
      </div>
    </section>
  </main>

  <script>${pageScript()}</script>
</body>
</html>`;
}

function pageScript(): string {
  return `
const $ = (id) => document.getElementById(id);
const NEW_PATIENT_ID = ${JSON.stringify(NEW_PATIENT_ID)};

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function requestJson(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const data = await r.json();
  if (!r.ok && data && data.ok === undefined) data.ok = false;
  return data;
}

function setBadge(id, state, text) {
  const el = $(id);
  el.className = "cell-badge " + (state || "");
  el.textContent = text;
}

function renderOutput(hostId, payload, label) {
  const ok = payload && payload.ok;
  const status = payload && payload.status;
  $(hostId).innerHTML =
    '<div class="output">' +
      '<div class="output-bar">' +
        '<span class="' + (ok ? "status-ok" : "status-err") + '">' + (ok ? (label || "OK") : "HTTP " + (status ?? "error")) + '</span>' +
      '</div>' +
      '<pre class="output-body">' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>' +
    '</div>';
}

// Generic "run a step" wrapper: toggles spinner + badge, renders the result.
async function runStep(n, run, runningText, okText) {
  $("btn-" + n).disabled = true;
  $("spin-" + n).hidden = false;
  setBadge("badge-" + n, "run", runningText);
  let data;
  try {
    data = await run();
    renderOutput("out-" + n, data, typeof okText === "function" ? okText(data) : okText);
    setBadge("badge-" + n, data.ok ? "ok" : "err", data.ok ? "done" : "failed");
  } catch (e) {
    $("out-" + n).innerHTML = '<div class="error-msg">' + escapeHtml(String(e)) + '</div>';
    setBadge("badge-" + n, "err", "failed");
  } finally {
    $("btn-" + n).disabled = false;
    $("spin-" + n).hidden = true;
  }
  return data;
}

$("btn-1").addEventListener("click", () =>
  runStep(1, () => requestJson("/api/setup", { method: "POST", body: "{}" }), "setting up", "ready"));

$("btn-2").addEventListener("click", () =>
  runStep(2, () => requestJson("/api/existing-patient", { method: "POST", body: "{}" }), "posting", "created"));

$("btn-3").addEventListener("click", () =>
  runStep(3, () => requestJson("/api/new-patient", { method: "POST", body: "{}" }), "posting", "created"));

$("btn-4").addEventListener("click", async () => {
  const data = await runStep(
    4,
    () => requestJson("/api/match", { method: "POST", body: JSON.stringify({ id: NEW_PATIENT_ID }) }),
    "matching",
    (d) => (d.matchedId ? "matched " + d.matchedId : "no match"),
  );
  // Carry the matched id into Step 5 / Step 6.
  if (data && data.matchedId) {
    $("f-target").value = data.matchedId;
    $("f-result").value = data.matchedId;
  }
});

$("btn-5").addEventListener("click", async () => {
  const data = await runStep(
    5,
    () => requestJson("/api/merge", { method: "POST", body: JSON.stringify({ sourceId: $("f-source").value.trim(), targetId: $("f-target").value.trim() }) }),
    "merging",
    "merged",
  );
  if (data && data.ok && data.target) {
    $("f-result").value = String(data.target).replace(/^Patient\\//, "");
  }
});

$("btn-6").addEventListener("click", () =>
  runStep(6, () => requestJson("/api/patient?id=" + encodeURIComponent($("f-result").value.trim())), "reading", "merge result"));
`;
}
