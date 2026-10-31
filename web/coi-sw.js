// The playground's service worker, for hosts that cannot send headers, such
// as GitHub Pages. Two jobs:
//
// - Cross-origin isolation: it adds COOP and COEP to every response, which
//   SharedArrayBuffer, and so wasm threads, need. index.html registers it and
//   reloads the page once it is in control. web/serve.py sends the headers
//   itself, and then the page leaves it alone.
// - Offline, for the app added to a phone's Home Screen: the page and the
//   toolchain are kept in a cache and served from it first, so the app opens
//   at once and works without a connection. Not the crates: crates.js keeps
//   the ones programs use in a cache of its own ("crates").
//
// scripts/build-pages.sh stamps the two constants below: CACHE with a hash of
// the site's files, so that a deploy changes this file and the browser
// installs the new worker; SHELL with the files to keep. As committed ("dev")
// nothing is cached, so a local build is never stale.
//
// GitHub Pages serves every file, this one too, with max-age=600 and no way
// to change it: the page registers it with updateViaCache "none", so that
// the browser checks for a new worker past its HTTP cache. A worker served
// stale pins the app to the build that installed it.
const CACHE = "dev";
const SHELL = [];

const caching = CACHE !== "dev";

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    if (!self.registration.active) {
      // The first install: the page is waiting for this worker to reload
      // isolated, and is fetching the same files itself, which fill the cache
      // as they pass; it asks for the rest once its toolchain has loaded
      // ("precache"). So: take over at once, with nothing to fetch first.
      await self.skipWaiting();
      return;
    }
    // A new build, beside one in control: fill its cache, all or nothing
    // (addAll fails on any error, and the old worker stays), and then wait.
    // Taking over a running tab would put the new build under a page of the
    // old one; the page offers a reload instead and sends SKIP_WAITING.
    if (caching) await (await caches.open(CACHE)).addAll(SHELL);
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Files from another build are dead weight. "crates" is crates.js's.
    for (const name of await caches.keys()) {
      if (name.startsWith("playground-") && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
  else if (e.data?.type === "precache") e.waitUntil(precache());
});

/** Fetch whatever of SHELL the first visit did not. */
async function precache() {
  if (!caching) return;
  const cache = await caches.open(CACHE);
  for (const url of SHELL) {
    if (!(await cache.match(url, { ignoreVary: true }))) await cache.add(url).catch(() => {});
  }
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // A request only the browser's cache may answer, which fetch() would refuse.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  e.respondWith(respond(request, (p) => e.waitUntil(p)).then(isolated));
});

/** Cache first, for the page and the toolchain; the network for the rest. */
async function respond(request, waitUntil) {
  const url = new URL(request.url);
  if (!caching || request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/dist/crates/")) {
    return fetch(request);
  }
  // The page, under one key whatever its query: a share link's ?code= is
  // read by the page, and would otherwise be a copy of it per link.
  const scope = new URL(self.registration.scope);
  const page = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`;
  const key = page ? scope.href : request;
  const cache = await caches.open(CACHE);
  // ignoreVary is load-bearing: GitHub Pages compresses, so responses carry
  // Vary: Accept-Encoding, and cache.match otherwise compares it against the
  // stored request's. A page's request and the worker's own fetch need not
  // agree, and the miss would fall through to a network that is not there:
  // offline only, which is where it is hardest to notice.
  const hit = await cache.match(key, { ignoreVary: true });
  if (hit) return hit;
  // Not cached yet (the first visit, or a file the first visit did not use):
  // fetched, and kept. The page, the toolchain and the hashed interface files
  // in this cache are all of one build, named by CACHE, so a hit is never a
  // mix of two.
  try {
    const response = await fetch(request);
    // Not errors (a cached 404 would outlive the mistake), and not opaque
    // ones. Stored alongside, not before answering: the page reads the
    // toolchain as it streams in.
    if (response.ok && response.type === "basic") waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    // A 503 keeps this a failed request the page can handle; a rejected
    // respondWith surfaces as an unhandled service worker error instead.
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

function isolated(response) {
  // Opaque (cross-origin, no-cors): its headers cannot be changed.
  if (response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
