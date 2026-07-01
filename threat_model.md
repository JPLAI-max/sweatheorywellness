# Threat Model

## Project Overview

GoonCity is a production social creator platform with a React frontend and an Express API backed by PostgreSQL. Users can register, manage profiles, post content, livestream, message each other, upload media and identity documents, tip creators, and manage subscriptions and wallet balances. Authentication is JWT-based via an `httpOnly` cookie. The application also integrates with Cloudflare R2 for uploads, Mux for video/streaming, Resend for email, Veriff for ID verification, and OpenAI for profile-bio suggestions.

## Assets

- **User accounts and sessions** — JWT session cookies, password hashes, password reset tokens, OAuth-linked identities. Compromise enables account takeover.
- **User personal data** — email addresses, social handles, profile metadata, gender, verification state, subscription status, and direct messages. This is sensitive personal information.
- **Private verification documents** — identity-document object keys and the underlying files in the private R2 bucket. Exposure has severe privacy and compliance impact.
- **Creator content and private audience settings** — posts, livestream settings, invite lists, subscriber-only access, and moderation metadata. Exposure or tampering breaks platform trust and privacy.
- **Wallet and subscription data** — balances, transfers, fees, transactions, and billing state. Manipulation can lead to fraud or financial loss.
- **Application secrets and third-party credentials** — `SESSION_SECRET`, admin secret, R2 credentials, Veriff/Resend/Mux/OpenAI secrets. Leakage could enable broad compromise.

## Trust Boundaries

- **Browser to API** — every client request crosses from an untrusted environment into the Express API. All authentication, authorization, validation, and business rules must be enforced server-side.
- **API to PostgreSQL** — the API has broad read/write access to user, wallet, message, and moderation data. Broken authorization or injection at the API layer can expose the full dataset.
- **API to Cloudflare R2** — the server mints presigned URLs for both public and private object storage. Authorization mistakes here can expose sensitive user files.
- **API to external providers** — Veriff webhooks, OAuth providers, Resend, Mux, and OpenAI all sit outside the app’s trust boundary and require signature validation, callback safety, and careful data handling.
- **Public to authenticated surface** — public profile, search, hashtag, and stream-listing endpoints coexist with authenticated profile editing, uploads, messaging, wallet, and subscription endpoints. These boundaries must be enforced consistently.
- **Authenticated user to admin/privileged surface** — admin and moderation actions, direct object access, and financial operations must not be reachable by ordinary users.
- **Production to dev-only boundary** — mock or script-only paths are out of scope unless production reachability is demonstrated. This includes standalone scripts that are not invoked by production routes.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/g/src/pages/*.tsx`.
- Highest-risk code areas: `routes/auth.ts`, `routes/users.ts`, `routes/upload.ts`, `routes/wallet.ts`, `routes/subscriptions.ts`, `routes/messages.ts`, `routes/streams.ts`, `routes/admin.ts`, `lib/r2.ts`.
- Public surfaces: health, auth entrypoints, profile/user lookups, hashtags/search, public stream/post reads.
- Authenticated surfaces: profile mutation, uploads, messages, wallet, tips, subscriptions, livestream credentials, private document access.
- Dev-only areas usually out of scope: `scripts/`, generated `dist/` artifacts, local tooling unless invoked by production code.

## Threat Categories

### Spoofing

The application relies on a signed JWT cookie for user identity and on provider callbacks for OAuth and Veriff. Protected API routes must validate the session on every request, reject banned users, and avoid trusting attacker-controlled request headers or callback inputs for identity-sensitive flows. Admin authorization must remain isolated to explicit admin checks or a strongly protected server-to-server secret.

### Tampering

Users can mutate profiles, create content, transfer wallet funds, manage subscriptions, upload files, and configure livestreams. The server must treat all client-supplied state as untrusted: ownership checks must be performed on every object reference, financial balances must be updated atomically, and subscription/access rules must be calculated server-side rather than inferred from UI state.

### Information Disclosure

This application stores especially sensitive data: private messages, creator audience settings, email addresses, account roles, wallet activity, and ID-verification artifacts. Public and semi-public endpoints must return only the minimal fields required by the client. Private object download endpoints must verify the caller’s entitlement to the requested object key before minting presigned URLs. Error handling, logs, and email flows must not leak secrets or internal-only fields.

### Denial of Service

Public authentication and content-discovery endpoints can be abused for brute force or resource exhaustion, while upload and AI-backed endpoints can be used to drive cost. The application must keep effective rate limits on login, password reset, wallet actions, and expensive creation endpoints, and it must bound request sizes and external-call impact where untrusted input is involved.

### Elevation of Privilege

The highest-risk class in this project is broken object-level or function-level authorization: cross-user access to messages, private documents, wallet effects, subscriber-only content, or moderation features. Every route that accepts a user ID, conversation ID, stream ID, subscription ID, report ID, or storage key must verify that the authenticated caller is entitled to act on that object. Privileged routes must not depend on frontend checks alone, and presigned storage access must not be equivalent to raw object access for any authenticated user.
