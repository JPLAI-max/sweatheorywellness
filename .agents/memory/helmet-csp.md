---
name: Helmet CSP configuration
description: Exact CSP directives needed for this app; why wildcards/specific choices were made.
---

# Helmet CSP for GoonCity

Always replace bare `helmet()` with `helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), ... } } })`.

## Directives added (beyond helmet defaults)

| Directive | Values added | Why |
|-----------|-------------|-----|
| img-src | `https://*.r2.cloudflarestorage.com` | R2 presigned URLs use `{accountId}.r2.cloudflarestorage.com` path-style; account ID is secret so wildcard subdomain is needed |
| img-src | `https://images.printify.com`, `https://images-cdn.printify.com` | Printify catalog product images |
| img-src | `https://image.mux.com` | Mux video thumbnails |
| img-src | `R2_MEDIA_PUBLIC_URL` origin (dynamic) | Custom CDN domain if set |
| media-src | `blob:`, `https://stream.mux.com` | hls.js MSE blob: URLs + Mux HLS stream segments |
| connect-src | `https://stream.mux.com` | hls.js fetches HLS manifests/segments via XHR |
| worker-src | `blob:` | hls.js spins up a blob: web worker for segment demuxing |
| frame-src | `https://www.youtube.com`, `https://player.vimeo.com` | Watch Party iframe embeds |

**Why:** helmet v8 default `img-src` is only `'self' data:` — blocks R2 presigned URLs, Printify CDN, and Mux thumbnails. Mux player (v3 / mux-player-react) uses hls.js which needs blob: worker and XHR fetches.

**How to apply:** Keep in `app.ts` before the cors() middleware. The R2_MEDIA_PUBLIC_URL dynamic origin resolves at startup — no restart needed if env changes (server restart is required anyway).
