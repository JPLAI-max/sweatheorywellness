import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_AVATAR = "https://sweatheory.com/og-default-avatar.png";
const SITE_NAME = "SWEATHEORY";
const BASE_URL = "https://sweatheory.com";
const VITE_PORT = 23345;

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildOgBlock(user: {
  username: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}): string {
  const name = escapeHtml(user.displayName ?? `@${user.username}`);
  const username = escapeHtml(user.username);
  const title = `${name} (@${username}) on ${SITE_NAME}`;
  const desc = escapeHtml(
    truncate(user.bio, 160) || `Creator on ${SITE_NAME}`
  );
  const avatarUrl = user.avatarUrl?.startsWith("http")
    ? user.avatarUrl
    : DEFAULT_AVATAR;
  const pageUrl = `${BASE_URL}/@${username}`;

  return `
  <title>${title}</title>
  <meta name="description" content="${desc}" />

  <!-- Open Graph -->
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:image" content="${escapeHtml(avatarUrl)}" />
  <meta property="og:image:width" content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="profile:username" content="${username}" />

  <!-- Twitter card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${escapeHtml(avatarUrl)}" />`.trim();
}

async function fetchIndexHtml(): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    // cwd is the workspace root when the api-server runs in production
    const candidates = [
      join(process.cwd(), "artifacts/g/dist/public/index.html"),
      join(process.cwd(), "../g/dist/public/index.html"),
    ];
    for (const p of candidates) {
      try {
        return readFileSync(p, "utf8");
      } catch {
        // try next
      }
    }
    logger.warn("OG: could not find built index.html — using minimal template");
    return MINIMAL_HTML_TEMPLATE;
  }
  // Dev: fetch from Vite server
  try {
    const r = await fetch(`http://localhost:${VITE_PORT}/`);
    if (r.ok) return r.text();
  } catch {
    // Vite not ready yet, fall through
  }
  return MINIMAL_HTML_TEMPLATE;
}

// Minimal fallback template that lets the SPA still load
const MINIMAL_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

function injectOgTags(html: string, ogBlock: string): string {
  // Inject right after <meta charset="UTF-8" /> so profile tags appear first
  // (scrapers use first occurrence of duplicate tags)
  const charsetTag = '<meta charset="UTF-8" />';
  if (html.includes(charsetTag)) {
    return html.replace(charsetTag, `${charsetTag}\n  ${ogBlock}`);
  }
  // Fallback: inject before </head>
  return html.replace("</head>", `  ${ogBlock}\n  </head>`);
}

export async function renderProfileOgPage(username: string): Promise<string | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      bio: usersTable.bio,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(
      or(
        eq(usersTable.username, username),
      )
    )
    .limit(1);

  if (!user) return null;

  const ogBlock = buildOgBlock(user);
  const html = await fetchIndexHtml();
  return injectOgTags(html, ogBlock);
}
