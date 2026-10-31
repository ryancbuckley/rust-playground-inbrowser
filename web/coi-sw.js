// Cross-origin isolation where the server cannot send the headers (GitHub
// Pages): this service worker adds COOP and COEP to every response, which
// SharedArrayBuffer, and so wasm threads, need. index.html registers it and
// reloads the page once it is in control. web/serve.py sends the headers
// itself, and then the page leaves it alone.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // A request only the browser's cache may answer, which fetch() would refuse.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  e.respondWith(
    fetch(request).then((response) => {
      // Opaque (cross-origin, no-cors): its headers cannot be changed.
      if (response.status === 0) return response;
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }),
  );
});
