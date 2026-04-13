import path from "path";

const PORT = parseInt(process.env.PORT || "3000");
const MDMBOX_URL = process.env.MDMBOX_URL || "http://localhost:3003";
const AIDBOX_URL = process.env.AIDBOX_URL || "http://localhost:8888";
const AIDBOX_AUTH = process.env.AIDBOX_AUTH || "Basic YmFzaWM6c2VjcmV0";
const DIST_DIR = path.resolve(import.meta.dir, "../dist");

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    // Proxy MDMbox requests (/mdm-api/*)
    if (url.pathname.startsWith("/mdm-api")) {
      const apiPath = url.pathname.replace(/^\/mdm-api/, "");
      const target = `${MDMBOX_URL}${apiPath}${url.search}`;

      const headers = new Headers(req.headers);
      headers.delete("host");

      const res = await fetch(target, {
        method: req.method,
        headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      });

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }

    // Proxy Aidbox requests (/fhir/*, /$query/*)
    if (url.pathname.startsWith("/fhir") || url.pathname.startsWith("/$query")) {
      const target = `${AIDBOX_URL}${url.pathname}${url.search}`;

      const headers = new Headers(req.headers);
      headers.delete("host");
      headers.set("Authorization", AIDBOX_AUTH);

      const res = await fetch(target, {
        method: req.method,
        headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      });

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }

    // Serve static files from dist/
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(path.join(DIST_DIR, filePath));

    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback
    return new Response(Bun.file(path.join(DIST_DIR, "index.html")));
  },
});

console.log(`Server running at http://localhost:${server.port}`);
