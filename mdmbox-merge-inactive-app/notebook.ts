/**
 * mdmbox-merge-inactive-app - a single-page example served by Bun.
 *
 * No subscriptions, no webhooks. You pick a source and a target Patient and
 * click "Run $merge". The merge plan DEACTIVATES the source instead of deleting
 * it: the source is PUT with active:false and a `replaced-by` link to the
 * surviving target, so the duplicate stays queryable for audit/history.
 *
 * Flow:
 *   browser -> Bun -> mdmbox: POST /api/$merge with a deactivating plan
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

// Patients are created and read via Aidbox; $merge runs via mdmbox. Aidbox and
// mdmbox share the same database, so resources created in one are visible to the
// other.
const AIDBOX_URL = trimSlash(process.env.AIDBOX_URL || "http://localhost:8888");
const PUBLIC_AIDBOX_URL = trimSlash(process.env.PUBLIC_AIDBOX_URL || "http://localhost:8888");
const AIDBOX_AUTH = process.env.AIDBOX_AUTH || "Basic cm9vdDpyb290"; // root:root

const MDMBOX_URL = trimSlash(process.env.MDMBOX_URL || "http://localhost:3003");
const PUBLIC_MDMBOX_URL = trimSlash(process.env.PUBLIC_MDMBOX_URL || "http://localhost:3003");
const MDMBOX_AUTH = process.env.MDMBOX_AUTH || "Basic cm9vdDpyb290"; // root:root

const DIR = import.meta.dir;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function jsonRequest(
  url: string,
  opts: { method?: string; auth?: string; body?: unknown } = {},
): Promise<JsonResponse> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth) headers.authorization = opts.auth;

  // redirect:"manual" — never follow a redirect. mdmbox returns 302 -> "/" when
  // it is not activated / needs login; following it would replay the request
  // against "/" in a loop ("redirected too many times"). Surface it instead.
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    redirect: "manual",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") || "";
    return {
      ok: false,
      status: res.status,
      url,
      body: {
        error:
          "Server redirected this API call (HTTP " +
          res.status +
          " -> " +
          (location || "/") +
          "). The service is most likely not activated or requires login. " +
          "Activate Aidbox at " +
          PUBLIC_AIDBOX_URL +
          " and mdmbox at " +
          PUBLIC_MDMBOX_URL +
          ", then retry.",
      },
      text,
    };
  }

  return { ok: res.ok, status: res.status, url, body: safeJson(text), text };
}

function mdmbox(path: string, opts: { method?: string; body?: unknown } = {}) {
  return jsonRequest(`${MDMBOX_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...opts,
    auth: MDMBOX_AUTH,
  });
}

// Patients are created and read through Aidbox's FHIR API. (mdmbox() above is
// used only for the /api/$merge call.)
function aidboxFhir(path: string, opts: { method?: string; body?: unknown } = {}) {
  return jsonRequest(`${AIDBOX_URL}/fhir/${path.replace(/^\//, "")}`, {
    ...opts,
    auth: AIDBOX_AUTH,
  });
}

// ---------------------------------------------------------------------------
// Sample patients (so the example is runnable with two clicks)
// ---------------------------------------------------------------------------
function targetPatient(): JsonRecord {
  return {
    resourceType: "Patient",
    id: "merge-target-jane",
    active: true,
    identifier: [{ system: "https://example.org/mrn", value: "MRN-1000" }],
    name: [{ use: "official", given: ["Jane"], family: "Doe" }],
    birthDate: "1985-04-12",
    gender: "female",
    telecom: [{ system: "email", value: "jane.doe@example.org", use: "home" }],
    address: [{ city: "Boston", state: "MA", country: "US" }],
  };
}

function sourcePatient(): JsonRecord {
  return {
    resourceType: "Patient",
    id: "merge-source-jane",
    active: true,
    identifier: [{ system: "https://example.org/mrn", value: "MRN-2000" }],
    name: [{ use: "official", given: ["Jane"], family: "Doe" }],
    birthDate: "1985-04-12",
    gender: "female",
    telecom: [{ system: "phone", value: "+1-555-0101", use: "mobile" }],
    address: [{ city: "Boston", state: "MA", country: "US" }],
  };
}

async function seedPatients() {
  const t = await aidboxFhir(`Patient/${targetPatient().id}`, { method: "PUT", body: targetPatient() });
  const s = await aidboxFhir(`Patient/${sourcePatient().id}`, { method: "PUT", body: sourcePatient() });
  return {
    ok: t.ok && s.ok,
    status: t.ok && s.ok ? 200 : 502,
    target: { id: targetPatient().id, status: t.status, body: t.body },
    source: { id: sourcePatient().id, status: s.status, body: s.body },
  };
}

async function readPatient(id: string) {
  return aidboxFhir(`Patient/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Merge plan: deactivate the source (active:false + replaced-by), don't delete
// ---------------------------------------------------------------------------
// Add a Patient.link (idempotent) of the given type pointing at otherId.
function withPatientLink(resource: JsonRecord, type: string, otherId: string): JsonRecord {
  const next = deepClone(resource);
  const link = { other: { reference: `Patient/${otherId}` }, type };
  const links = Array.isArray(next.link) ? next.link : [];
  const already = links.some(
    (l: JsonRecord) => l?.type === type && l?.other?.reference === `Patient/${otherId}`,
  );
  next.link = already ? links : [...links, link];
  return next;
}

function deactivateSource(source: JsonRecord, targetId: string): JsonRecord {
  // The retired source: active:false + "replaced-by" -> the surviving target.
  const next = withPatientLink(source, "replaced-by", targetId);
  next.active = false;
  return next;
}

function buildMergePlan(source: JsonRecord, target: JsonRecord) {
  const sourceId = requiredId(source, "source patient");
  const targetId = requiredId(target, "target patient");
  // Surviving target gets a "replaces" link back to the retired source — the
  // canonical reciprocal of the source's "replaced-by" link.
  const mergedTarget = withPatientLink(mergeResourcePreferTarget(source, target), "replaces", sourceId);
  const deactivatedSource = deactivateSource(source, targetId);

  const targetPut: JsonRecord = {
    resource: mergedTarget,
    request: { method: "PUT", url: `Patient/${targetId}` },
  };
  const targetEtag = etag(target);
  if (targetEtag) targetPut.request.ifMatch = targetEtag;

  // Instead of DELETE: PUT the source back with active:false + replaced-by link.
  const sourcePut: JsonRecord = {
    resource: deactivatedSource,
    request: { method: "PUT", url: `Patient/${sourceId}` },
  };
  const sourceEtag = etag(source);
  if (sourceEtag) sourcePut.request.ifMatch = sourceEtag;

  return {
    source: `Patient/${sourceId}`,
    target: `Patient/${targetId}`,
    entries: [targetPut, sourcePut],
    mergedTarget,
    deactivatedSource,
  };
}

function buildMergeParameters(opts: { source: string; target: string; entries: JsonRecord[]; preview: boolean }) {
  return {
    resourceType: "Parameters",
    parameter: [
      { name: "source", valueReference: { reference: opts.source } },
      { name: "target", valueReference: { reference: opts.target } },
      { name: "preview", valueBoolean: opts.preview },
      { name: "plan", resource: { resourceType: "Bundle", type: "transaction", entry: opts.entries } },
    ],
  };
}

// Page -> Bun -> mdmbox $merge.
async function runMerge(input: JsonRecord) {
  const sourceId = String(input.sourceId || "").trim();
  const targetId = String(input.targetId || "").trim();
  const preview = input.preview === true;
  if (!sourceId || !targetId) {
    return { ok: false, status: 400, error: "Both source and target Patient ids are required." };
  }

  const sourceRead = await readPatient(sourceId);
  if (!sourceRead.ok) return { ok: false, status: sourceRead.status, error: `Source Patient/${sourceId} not found in Aidbox`, response: sourceRead.body };
  const targetRead = await readPatient(targetId);
  if (!targetRead.ok) return { ok: false, status: targetRead.status, error: `Target Patient/${targetId} not found in Aidbox`, response: targetRead.body };

  const plan = buildMergePlan(sourceRead.body as JsonRecord, targetRead.body as JsonRecord);
  const body = buildMergeParameters({ source: plan.source, target: plan.target, entries: plan.entries, preview });

  const url = `${MDMBOX_URL}/api/$merge`;
  const started = performance.now();
  const result = await mdmbox("/api/$merge", { method: "POST", body });
  const elapsedMs = Math.round(performance.now() - started);

  // After a real (non-preview) merge, read the source back to show it is inactive.
  let sourceAfter: unknown = undefined;
  if (result.ok && !preview) {
    const after = await readPatient(sourceId);
    if (after.ok) {
      const r = after.body as JsonRecord;
      sourceAfter = { id: r.id, active: r.active, link: r.link };
    }
  }

  return {
    ok: result.ok,
    status: result.status,
    via: url,
    elapsedMs,
    plan: { deactivatedSource: plan.deactivatedSource, mergedTarget: plan.mergedTarget },
    request: body,
    response: result.body,
    sourceAfter,
  };
}

// ---------------------------------------------------------------------------
// Merge strategy (target wins scalars, arrays union, fill gaps from source)
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

function requiredId(resource: JsonRecord, label: string) {
  const id = String(resource?.id || "").trim();
  if (!id) throw new Error(`${label} must have id`);
  return id;
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
      return new Response(renderPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
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
        sampleSourceId: sourcePatient().id,
        sampleTargetId: targetPatient().id,
      });
    }

    if (pathname === "/api/seed" && req.method === "POST") {
      try {
        const result = await seedPatients();
        return Response.json(result, { status: result.ok ? 200 : 502 });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 502 });
      }
    }

    if (pathname === "/api/patient" && req.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const result = await readPatient(id);
      return Response.json(result, { status: result.ok ? 200 : result.status });
    }

    if (pathname === "/api/merge" && req.method === "POST") {
      try {
        const input = await req.json().catch(() => ({}));
        const result = await runMerge(input);
        return Response.json(result, { status: (result as any).ok ? 200 : (result as any).status || 502 });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 502 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`mdmbox merge-inactive example -> http://localhost:${server.port}`);
console.log(`Aidbox: ${AIDBOX_URL}  (seed/read patients)`);
console.log(`mdmbox: ${MDMBOX_URL}  ($merge)`);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mdmbox - merge keeps source inactive</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
  <link rel="stylesheet" href="/notebook.css" />
</head>
<body>
  <nav class="navbar">
    <a class="navbar-brand" href="/"><span class="dot"></span><span>mdmbox &times; $merge</span></a>
    <span class="navbar-meta">deactivate source on merge</span>
  </nav>

  <main class="page">
    <header class="page-header">
      <h1 class="page-title">Run <code>$merge</code> that deactivates the source</h1>
      <p class="page-subtitle">
        Create patients in Aidbox, then run mdmbox <code>$merge</code> over them
        (Aidbox and mdmbox share one database). The plan
        <strong>PUTs the source with <code>active:false</code></strong> and a
        <code>replaced-by</code> link to the target &mdash; the duplicate is retired,
        not deleted, so it stays queryable for audit/history.
      </p>
    </header>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Cell 1</span>
        <span class="cell-title">Seed two sample patients in Aidbox (optional)</span>
        <span class="cell-badge" id="badge-seed">idle</span>
      </div>
      <div class="cell-body">
        <p class="muted">
          Creates <code>${escapeHtml(targetPatient().id)}</code> (target) and
          <code>${escapeHtml(sourcePatient().id)}</code> (source) in Aidbox so you have
          something to merge. Skip this if you already have patients.
        </p>
        <div class="actions">
          <button class="btn btn-ghost" id="btn-seed">Seed sample patients</button>
          <span class="spinner" id="spin-seed" hidden>Seeding...</span>
        </div>
        <div id="out-seed"></div>
      </div>
    </section>

    <section class="cell">
      <div class="cell-header">
        <span class="cell-num">Cell 2</span>
        <span class="cell-title">Run <code>$merge</code></span>
        <span class="cell-badge" id="badge-merge">idle</span>
      </div>
      <div class="cell-body">
        <div class="field-row">
          <div class="field">
            <label for="f-source">Source Patient id (retired)</label>
            <input id="f-source" value="${escapeHtml(sourcePatient().id)}" />
          </div>
          <div class="field">
            <label for="f-target">Target Patient id (survives)</label>
            <input id="f-target" value="${escapeHtml(targetPatient().id)}" />
          </div>
          <div class="field">
            <label for="f-preview">Preview</label>
            <select id="f-preview">
              <option value="true">true (dry-run)</option>
              <option value="false">false (apply)</option>
            </select>
          </div>
        </div>
        <p class="hint">
          The plan deactivates the source instead of deleting it. Use
          <code>preview: true</code> to validate without writing.
        </p>
        <div class="actions">
          <button class="btn btn-primary" id="btn-merge">Run $merge</button>
          <button class="btn btn-ghost" id="btn-check-source">Read source after merge</button>
          <span class="spinner" id="spin-merge" hidden>Merging...</span>
        </div>
        <div id="out-source-after"></div>
        <div id="out-merge"></div>
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

$("btn-seed").addEventListener("click", async () => {
  $("btn-seed").disabled = true;
  $("spin-seed").hidden = false;
  setBadge("badge-seed", "run", "seeding");
  try {
    const data = await requestJson("/api/seed", { method: "POST", body: "{}" });
    renderOutput("out-seed", data, "seeded");
    setBadge("badge-seed", data.ok ? "ok" : "err", data.ok ? "ready" : "failed");
  } catch (e) {
    $("out-seed").innerHTML = '<div class="error-msg">' + escapeHtml(String(e)) + '</div>';
    setBadge("badge-seed", "err", "failed");
  } finally {
    $("btn-seed").disabled = false;
    $("spin-seed").hidden = true;
  }
});

$("btn-merge").addEventListener("click", async () => {
  const input = {
    sourceId: $("f-source").value.trim(),
    targetId: $("f-target").value.trim(),
    preview: $("f-preview").value === "true",
  };
  $("btn-merge").disabled = true;
  $("spin-merge").hidden = false;
  $("out-source-after").innerHTML = "";
  setBadge("badge-merge", "run", input.preview ? "previewing" : "merging");
  try {
    const data = await requestJson("/api/merge", { method: "POST", body: JSON.stringify(input) });
    renderOutput("out-merge", data, input.preview ? "preview ok" : "merged");
    if (data.sourceAfter) {
      $("out-source-after").innerHTML =
        '<div class="output"><div class="output-bar"><span class="status-ok">source after merge</span></div>' +
        '<pre class="output-body">' + escapeHtml(JSON.stringify(data.sourceAfter, null, 2)) + '</pre></div>';
    }
    setBadge("badge-merge", data.ok ? "ok" : "err", data.ok ? (input.preview ? "preview ok" : "merged") : "failed");
  } catch (e) {
    $("out-merge").innerHTML = '<div class="error-msg">' + escapeHtml(String(e)) + '</div>';
    setBadge("badge-merge", "err", "failed");
  } finally {
    $("btn-merge").disabled = false;
    $("spin-merge").hidden = true;
  }
});

$("btn-check-source").addEventListener("click", async () => {
  const id = $("f-source").value.trim();
  const data = await requestJson("/api/patient?id=" + encodeURIComponent(id));
  const r = data.body || data;
  const slim = r && r.resourceType === "Patient" ? { id: r.id, active: r.active, link: r.link } : data;
  $("out-source-after").innerHTML =
    '<div class="output"><div class="output-bar"><span class="' + (data.ok ? "status-ok" : "status-err") + '">source ' + escapeHtml(id) + '</span></div>' +
    '<pre class="output-body">' + escapeHtml(JSON.stringify(slim, null, 2)) + '</pre></div>';
});
`;
}
