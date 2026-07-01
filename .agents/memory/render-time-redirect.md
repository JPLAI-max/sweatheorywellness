---
name: Render-time redirect crash
description: Why 12 pages caused a login loop — setLocation during render crashes React, fixed with useRequireAuth hook
---

## Rule
Never call `setLocation()` or any state-updater during the React render function. Put redirects inside `useEffect`.

**Why:** In React 18+ concurrent mode, calling setLocation (which updates navigation state) during render triggers "Cannot update X while rendering Y". React recovers via a synchronous re-render that resets all state — including auth state — causing the login loop.

**How to apply:** Use the `useRequireAuth` hook (`hooks/useRequireAuth.ts`). Call it as the first hook in the component, then add `if (!isAuthed) return null;` before the JSX `return`. The hook calls `isLoggedIn()` and schedules a `setLocation("/login")` inside a `useEffect`.

Pages already fixed: Feed, Wallet, Notifications, Bookmarks, Analytics, Library, MerchOrders, CustomRequests, GoLive, Messages, Settings, CreateMerch.
