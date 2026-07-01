export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "system", "support", "help", "contact",
  "legal", "privacy", "terms", "dmca", "2257", "cookies", "guidelines",
  "brand", "trademarks", "advertiser-agreement", "law-enforcement",
  "report-trafficking", "verified", "settings", "profile", "feed",
  "explore", "post", "stream", "messages", "wallet", "notifications",
  "bookmarks", "hashtag", "analytics", "watch", "meetups", "marketplace",
  "affiliate", "pricing", "auction", "create-auction", "merch",
  "subscriptions", "requests", "api", "auth", "login", "signup", "register",
  "forgot-password", "reset-password", "oauth", "callback", "gooncity",
  "jim", "jiminvestments",
]);

export const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{2,29}$/;

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_REGEX.test(username);
}
