const CACHE = "coach-v2";
const APP = ["./", "index.html", "chat.html", "style.css", "script.js", "coach.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("coach-") && k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const host = new URL(req.url).hostname;
  // Файлы модели кэширует сама библиотека, сюда их не берём
  if (/huggingface\.co|hf\.co|raw\.githubusercontent\.com/.test(host)) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          hit ||
          (req.mode === "navigate" ? caches.match("index.html") : Response.error())
        );
      return hit || net;
    })
  );
});