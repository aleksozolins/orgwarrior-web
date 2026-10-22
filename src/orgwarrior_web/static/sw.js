"use strict";

// A browser offers "Install app" only with a service worker, so here is one
// that does nothing else.  No caching: the agenda has to be live, and offline
// the page couldn't act on anything anyway.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
