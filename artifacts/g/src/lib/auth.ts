// ── Auth state ─────────────────────────────────────────────────────────────
// The JWT is stored in an httpOnly cookie (not readable by JS).
// We keep only a non-sensitive authenticated flag and the current user's id
// in localStorage so the UI knows whether a session exists.

export const isLoggedIn = () =>
  typeof localStorage !== "undefined" && localStorage.getItem("g_authenticated") === "1";

export function setLoggedIn(userId: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("g_authenticated", "1");
  localStorage.setItem("g_current_user_id", String(userId));
}

export function clearAuth(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem("g_authenticated");
  localStorage.removeItem("g_current_user_id");
}

/** Call this to log out: clears the server cookie then clears local state. */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // best-effort
  }
  clearAuth();
}

export function getCurrentUserId(): number | null {
  if (typeof localStorage === "undefined") return null;
  const val = localStorage.getItem("g_current_user_id");
  return val ? Number(val) : null;
}

// ── Multi-account support ──────────────────────────────────────────────────
// Stores account metadata only — no tokens (those live in the httpOnly cookie).
// Switching accounts requires the user to log in again.

export interface SavedAccount {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export const getAccounts = (): SavedAccount[] => {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("g_accounts") ?? "[]"); }
  catch { return []; }
};

export const saveAccount = (account: SavedAccount) => {
  if (typeof localStorage === "undefined") return;
  const accounts = getAccounts();
  const idx = accounts.findIndex(a => a.id === account.id);
  if (idx >= 0) accounts[idx] = account;
  else accounts.push(account);
  localStorage.setItem("g_accounts", JSON.stringify(accounts));
};

/** Switching accounts requires a fresh login — redirect to /login. */
export const switchAccount = (_accountId?: number) => {
  window.location.href = "/login";
};

export const removeCurrentAccount = async () => {
  const currentId = getCurrentUserId();
  const remaining = getAccounts().filter(a => a.id !== currentId);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("g_accounts", JSON.stringify(remaining));
  }
  await logout();
  window.location.href = remaining.length > 0 ? "/login" : "/";
};
