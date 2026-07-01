---
name: Mux playback policy
description: Why Mux direct uploads must use public playback policy, and what broke with signed.
---

Direct uploads (`createMuxDirectUpload`) must use `playback_policy: ["public"]`.

**Why:** The original code used `["signed"]` intending to gate playback until CSAM scan_status='clean'. But `mintMuxJwt` was never called client-side — PostCard passes `playbackId` to MuxPlayer with no `tokens` prop, so every video showed "Video unavailable". With the approve-then-remove CSAM model (posts visible immediately, removed only if scanner flags `blocked`), signed policy provides no benefit and only breaks playback.

**How to apply:** Never change this back to `signed` without also wiring up server-side JWT minting in the post response and passing `tokens.playback` to every MuxPlayer instance. The CSAM scanner creates a second temp public playback ID for frame extraction and deletes it by specific ID — this continues to work correctly regardless of the asset's default policy.

**Live streams** (`createMuxLiveStream`) still use `playback_policy: ["signed"]` for the live stream itself because StreamPage mints a JWT via `mintMuxJwt` for live viewing. The `new_asset_settings` (recording VOD) also remains signed — if recording VOD playback is ever surfaced, it will need the same public policy fix.

**Hive API key:** `HIVE_CSAM_API_KEY` was returning HTTP 403 ("Invalid Auth Token") as of Jun 2026. Every scan fails immediately and retries indefinitely. Posts stay `pending` but remain publicly visible under approve-then-remove. The secret needs to be updated with a valid key from the Hive dashboard.
