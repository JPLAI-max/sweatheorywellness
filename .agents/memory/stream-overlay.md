---
name: StreamPage chat overlay pattern
description: Why the StreamPage chat must use transparent wrapper + inset-0 video to match GoLive
---

The watch-live page (StreamPage) chat panel must match GoLive exactly:
- Video div: `absolute inset-0` (edge-to-edge). Using `inset-2 rounded-2xl` creates an 8px card gap that visually breaks the overlay into two side-by-side panels.
- Chat wrapper: `absolute right-0 top-0 bottom-0 w-80 pointer-events-none` with NO background/border/backdrop. Messages float over the video with `textShadow` for readability. Only the input `<div>` has `pointer-events-auto`.
- GoLive uses the same pattern. Any deviation (solid background on the chat wrapper) makes the layout look "side-by-side" even though both children are absolutely positioned.

**Why:** A nearly-opaque chat panel obscures the video behind it, making the video appear to stop at the chat's left edge. Transparent wrapper = messages float over the full-width video = true overlay feel.

**How to apply:** Whenever the watch-live chat panel is modified, keep the outer wrapper backgroundless and the video div using inset-0.
