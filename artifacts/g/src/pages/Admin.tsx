import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { uploadToR2Media } from "@/lib/r2Upload";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Users, Flag, FileText, Radio, CreditCard,
  Menu, X, Shield, LogOut, Search, Ban, BadgeCheck, Trash2,
  ChevronDown, RefreshCw, ExternalLink, ShieldOff, Star,
  TrendingUp, Eye, AlertTriangle, CheckCircle2, XCircle,
  Clock, DollarSign, Activity, UserCheck, Tag, Plus, ShoppingBag, Globe, Shirt,
  ShieldAlert, ExternalLink as ViewIcon, Video, Download, Pencil, Pin, PinOff, MessageSquare,
  Upload, Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isLoggedIn, logout } from "@/lib/auth";
import { invalidateCategoriesCache, useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";

// ── API helper ─────────────────────────────────────────────────────────────────

async function adminFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stats {
  totalUsers: number; totalCreators: number; totalPosts: number;
  activeStreams: number; totalTransactions: number; platformRevenue: string;
  pendingReports: number; flaggedContent: number;
}

interface AdminUser {
  id: number; username: string; displayName: string; email: string;
  accountTier: string; isVerified: boolean; isNsfwCreator: boolean;
  isBanned: boolean; isAdmin: boolean; idVerificationStatus: string;
  isAgeVerified: boolean; verificationMethod: string | null;
  isSuspended: boolean; suspendedUntil: string | null; isFeatured: boolean;
  createdAt: string;
}

interface AuditLogEntry {
  id: number; adminId: number; adminUsername: string | null; adminDisplayName: string | null;
  action: string; targetType: string; targetId: number | null;
  reason: string | null; metadata: any; createdAt: string;
}

interface AdminReport {
  id: number;
  contentType: string;
  contentId: string;
  reporterId: number;
  reason: string;
  note: string | null;
  status: string;
  resolution: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
  reporterUsername: string | null;
}

interface AdminPost {
  id: number; authorId: number; authorUsername: string | null;
  type: string; caption: string; mediaUrl: string | null;
  contentRating: string; visibility: string;
  likesCount: number; viewsCount: number; createdAt: string;
  isPinned: boolean; isFeatured: boolean;
}

interface AdminStream {
  id: number; hostId: number; title: string; status: string;
  audienceType: string; viewerCount: number;
  createdAt: string; endedAt: string | null;
  host: { id: number; username: string; displayName: string } | null;
}

interface AdminTransaction {
  id: number; userId: number; username: string | null;
  type: string; amount: number; fee: number; status: string;
  description: string | null; relatedUserId: number | null;
  relatedUsername: string | null; createdAt: string;
}

interface MuxCleanupEntry {
  id: number; uploadId: string; muxAssetId: string | null;
  userId: number | null; reason: string; durationSeconds: number | null;
  deletedAt: string;
  user: { id: number; username: string; displayName: string | null } | null;
}

interface MuxCleanupStats {
  total: number; orphanedUploads: number; orphanedAssets: number; erroredTotal: number;
  byCause: Record<string, number>;
  topUsers: { userId: number | null; total: number; user: { id: number; username: string; displayName: string | null } | null }[];
}

// ── Tab config ─────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "users" | "reports" | "takedown" | "content" | "streams" | "transactions" | "categories" | "merch" | "shop" | "mux_cleanup" | "audit_log" | "security";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard",    label: "Dashboard",    icon: <LayoutDashboard size={16} /> },
  { id: "users",        label: "Users",        icon: <Users size={16} /> },
  { id: "reports",      label: "Reports",      icon: <Flag size={16} /> },
  { id: "takedown",     label: "Takedowns",    icon: <ShieldAlert size={16} /> },
  { id: "content",      label: "Content",      icon: <FileText size={16} /> },
  { id: "streams",      label: "Streams",      icon: <Radio size={16} /> },
  { id: "transactions", label: "Transactions", icon: <CreditCard size={16} /> },
  { id: "categories",   label: "Categories",   icon: <Tag size={16} /> },
  { id: "merch",        label: "Merch",        icon: <Shirt size={16} /> },
  { id: "shop",         label: "Shop",         icon: <Star size={16} /> },
  { id: "mux_cleanup",  label: "Mux Cleanup",  icon: <Video size={16} /> },
  { id: "audit_log",    label: "Audit Log",    icon: <Activity size={16} /> },
  { id: "security",     label: "Security",     icon: <Shield size={16} /> },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function ago(dt: string) {
  try { return formatDistanceToNow(new Date(dt), { addSuffix: true }); } catch { return dt; }
}

function RatingBadge({ rating }: { rating: string }) {
  const map: Record<string, string> = {
    safe:       "border-green-500/30 text-green-400 bg-green-500/10",
    suggestive: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    mature:     "border-orange-500/30 text-orange-400 bg-orange-500/10",
    nsfw:       "border-red-500/30 text-red-400 bg-red-500/10",
    explicit:   "border-rose-600/30 text-rose-400 bg-rose-600/10",
  };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", map[rating] ?? "border-border text-muted-foreground")}>
      {rating.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:    "border-amber-500/30 text-amber-400 bg-amber-500/10",
    reviewed:   "border-blue-500/30 text-blue-400 bg-blue-500/10",
    actioned:   "border-green-500/30 text-green-400 bg-green-500/10",
    dismissed:  "border-zinc-600/40 text-zinc-400 bg-zinc-800/40",
    completed:  "border-green-500/30 text-green-400 bg-green-500/10",
    failed:     "border-red-500/30 text-red-400 bg-red-500/10",
    live:       "border-green-500/30 text-green-400 bg-green-500/10",
    ended:      "border-zinc-600/40 text-zinc-400 bg-zinc-800/40",
  };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", map[status] ?? "border-border text-muted-foreground")}>
      {status}
    </span>
  );
}

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ActionBtn({ children, variant = "default", onClick, disabled }: {
  children: React.ReactNode; variant?: "default" | "destructive" | "ghost";
  onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40",
        variant === "destructive" && "bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20",
        variant === "ghost" && "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground border border-border/50",
        variant === "default" && "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20",
      )}
    >
      {children}
    </button>
  );
}

// ── Security Tab ───────────────────────────────────────────────────────────────

function SecurityTab() {
  const { user } = useCurrentUser();
  const [step, setStep] = useState<"idle" | "setup" | "confirm">("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const enabled = !!(user as any)?.totpEnabled;

  async function startSetup() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setSecret(data.secret);
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(data.otpauth, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
      setQrDataUrl(dataUrl);
      setStep("setup");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  async function confirmCode() {
    if (code.length !== 6) { setError("Enter the 6-digit code"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/2fa/confirm", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code"); return; }
      setSuccess(true);
      setStep("idle");
      setCode("");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage two-factor authentication for your admin account.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden max-w-lg">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
          <Shield size={15} className="text-amber-400" />
          <span className="text-sm font-semibold">Two-Factor Authentication</span>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Admin only</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          {enabled || success ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-400">2FA is enabled</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your admin account is protected with TOTP authentication.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Shield size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Enable Two-Factor Authentication</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Add an extra layer of security to your admin account using an authenticator app (Google Authenticator, Authy, etc.)</p>
                </div>
              </div>
              {step === "idle" && (
                <button
                  type="button"
                  onClick={startSetup}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 border border-amber-500/25 text-amber-400 text-sm font-semibold rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                >
                  <Shield size={14} />
                  {loading ? "Setting up…" : "Set up 2FA"}
                </button>
              )}
              {step === "setup" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
                  {qrDataUrl && (
                    <div className="flex justify-center">
                      <div className="bg-white p-3 rounded-xl inline-block">
                        <img src={qrDataUrl} alt="QR code" className="w-44 h-44" />
                      </div>
                    </div>
                  )}
                  <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground break-all">{secret}</div>
                  <button type="button" onClick={() => setStep("confirm")} className="w-full py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors">
                    I've scanned it — enter code →
                  </button>
                </div>
              )}
              {step === "confirm" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app to complete setup.</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-center tracking-[0.5em] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setStep("setup")} className="flex-1 py-2 border border-border text-sm rounded-lg hover:bg-muted/40 transition-colors text-muted-foreground">Back</button>
                    <button type="button" onClick={confirmCode} disabled={loading || code.length !== 6} className="flex-1 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {loading ? "Verifying…" : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/stats")
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground p-8"><RefreshCw size={16} className="animate-spin" /> Loading stats…</div>;
  if (error) return <div className="text-destructive p-8">{error}</div>;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Platform Overview</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Users"       value={stats.totalUsers.toLocaleString()}        icon={<Users size={16} />} />
        <StatCard label="Creators"          value={stats.totalCreators.toLocaleString()}      icon={<Star size={16} />} />
        <StatCard label="Total Posts"       value={stats.totalPosts.toLocaleString()}         icon={<FileText size={16} />} />
        <StatCard label="Active Streams"    value={stats.activeStreams.toLocaleString()}      icon={<Activity size={16} />} />
        <StatCard label="Transactions"      value={stats.totalTransactions.toLocaleString()}  icon={<CreditCard size={16} />} />
        <StatCard label="Platform Revenue"  value={`$${Number(stats.platformRevenue).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} icon={<DollarSign size={16} />} sub="from fees" />
        <StatCard label="Pending Reports"   value={stats.pendingReports.toLocaleString()}     icon={<Flag size={16} />} />
        <StatCard label="Flagged Content"   value={stats.flaggedContent.toLocaleString()}     icon={<AlertTriangle size={16} />} sub="NSFW/Explicit" />
      </div>
    </div>
  );
}

// ── Users Tab ──────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  free:    "text-zinc-400",
  creator: "text-blue-400",
  pro:     "text-violet-400",
  elite:   "text-rose-400",
};

interface GrantSubModal {
  subscriberId: number;
  subscriberUsername: string;
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [grantModal, setGrantModal] = useState<GrantSubModal | null>(null);
  const [grantCreator, setGrantCreator] = useState("");
  const [grantDays, setGrantDays] = useState("30");
  const [grantError, setGrantError] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const LIMIT = 50;

  const load = useCallback((search = q, off = offset) => {
    setLoading(true);
    adminFetch(`/admin/users?q=${encodeURIComponent(search)}&limit=${LIMIT}&offset=${off}`)
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, offset]);

  useEffect(() => { load("", 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [suspendModal, setSuspendModal] = useState<AdminUser | null>(null);
  const [suspendDays, setSuspendDays] = useState("3");
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [editProfileModal, setEditProfileModal] = useState<AdminUser | null>(null);
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editProfileLoading, setEditProfileLoading] = useState(false);

  async function banUser(id: number, ban: boolean) {
    await adminFetch(`/admin/users/${id}/${ban ? "ban" : "unban"}`, { method: "POST" });
    setUsers(u => u.map(x => x.id === id ? { ...x, isBanned: ban } : x));
  }

  async function verifyUser(id: number) {
    await adminFetch(`/admin/users/${id}/verify`, { method: "POST" });
    setUsers(u => u.map(x => x.id === id ? { ...x, isVerified: true } : x));
  }

  async function deleteUser(id: number, username: string) {
    if (!window.confirm(`Permanently delete @${username} and ALL their data? This cannot be undone.`)) return;
    await adminFetch(`/admin/users/${id}`, { method: "DELETE" });
    setUsers(u => u.filter(x => x.id !== id));
  }

  async function makeAdmin(id: number, grant: boolean) {
    if (!window.confirm(grant ? "Grant admin to this user?" : "Revoke admin from this user?")) return;
    await adminFetch(`/admin/users/${id}/make-admin`, { method: "PATCH", body: JSON.stringify({ grant }) });
    setUsers(u => u.map(x => x.id === id ? { ...x, isAdmin: grant } : x));
  }

  async function setTier(id: number, tier: string) {
    await adminFetch(`/admin/users/${id}/tier`, { method: "PATCH", body: JSON.stringify({ tier }) });
    setUsers(u => u.map(x => x.id === id ? { ...x, accountTier: tier } : x));
  }

  async function toggleFeature(id: number, feat: boolean) {
    await adminFetch(`/admin/users/${id}/${feat ? "feature" : "unfeature"}`, { method: "POST" });
    setUsers(u => u.map(x => x.id === id ? { ...x, isFeatured: feat } : x));
  }

  async function unsuspend(id: number) {
    await adminFetch(`/admin/users/${id}/unsuspend`, { method: "POST" });
    setUsers(u => u.map(x => x.id === id ? { ...x, isSuspended: false, suspendedUntil: null } : x));
  }

  async function submitSuspend() {
    if (!suspendModal) return;
    setSuspendLoading(true);
    try {
      const data = await adminFetch(`/admin/users/${suspendModal.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ durationDays: parseInt(suspendDays), reason: suspendReason }),
      });
      setUsers(u => u.map(x => x.id === suspendModal.id ? { ...x, isSuspended: true, suspendedUntil: data.suspendedUntil } : x));
      setSuspendModal(null);
      setSuspendReason("");
    } finally {
      setSuspendLoading(false);
    }
  }

  async function submitEditProfile() {
    if (!editProfileModal) return;
    setEditProfileLoading(true);
    try {
      await adminFetch(`/admin/users/${editProfileModal.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ bio: editBio, avatarUrl: editAvatarUrl }),
      });
      setUsers(u => u.map(x => x.id === editProfileModal.id ? { ...x, bio: editBio } : x));
      setEditProfileModal(null);
    } finally {
      setEditProfileLoading(false);
    }
  }

  async function purgeAll() {
    const answer = window.prompt(
      `This will permanently delete EVERY non-admin user and all their posts, follows, messages, and wallet data.\n\nType PURGE to confirm:`,
    );
    if (answer !== "PURGE") return;
    await adminFetch("/admin/users/purge", { method: "POST" });
    load("", 0);
  }

  async function submitGrantSub() {
    if (!grantModal) return;
    const creatorInput = grantCreator.trim().replace(/^@/, "");
    if (!creatorInput) { setGrantError("Enter a creator username or ID"); return; }
    setGrantError("");
    setGrantLoading(true);
    try {
      // Resolve creator ID — try numeric first, then look up by username
      const creatorId = /^\d+$/.test(creatorInput)
        ? parseInt(creatorInput)
        : await adminFetch(`/admin/users?q=${encodeURIComponent(creatorInput)}&limit=1`)
            .then((res: AdminUser[]) => {
              const match = res.find(u => u.username.toLowerCase() === creatorInput.toLowerCase());
              if (!match) throw new Error(`User @${creatorInput} not found`);
              return match.id;
            });
      await adminFetch("/admin/grant-subscription", {
        method: "POST",
        body: JSON.stringify({ subscriberId: grantModal.subscriberId, creatorId, days: parseInt(grantDays) }),
      });
      setGrantModal(null);
      setGrantCreator("");
      setGrantDays("30");
    } catch (e: any) {
      setGrantError(e.message ?? "Failed to grant subscription");
    } finally {
      setGrantLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-bold">User Management</h2>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search username, email…"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setOffset(0); load(q, 0); } }}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => { setOffset(0); load(q, 0); }} className="h-8">Search</Button>
          <Button
            size="sm" variant="destructive" className="h-8 gap-1.5"
            onClick={purgeAll}
          >
            <Trash2 size={13} /> Purge All
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Email</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Joined</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Tier</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && users.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
            )}
            {users.map(user => (
              <TableRow key={user.id} className="border-border/40">
                <TableCell>
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      {user.username}
                      {user.isVerified && <BadgeCheck size={13} className="text-primary flex-shrink-0" />}
                      {user.isAdmin && <Shield size={13} className="text-amber-400 flex-shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{user.displayName}</div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{user.email}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{ago(user.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.isBanned && <StatusBadge status="banned" />}
                    {user.isNsfwCreator && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/30 text-rose-400 bg-rose-500/10">NSFW</span>}
                    {user.isAgeVerified && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-500/30 text-green-400 bg-green-500/10">AGE✓</span>}
                    {!user.isBanned && !user.isNsfwCreator && !user.isAgeVerified && <span className="text-[10px] text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Select value={user.accountTier} onValueChange={tier => setTier(user.id, tier)}>
                    <SelectTrigger className="h-7 text-xs w-24 border-border/50 bg-transparent">
                      <SelectValue>
                        <span className={cn("capitalize font-medium", TIER_COLORS[user.accountTier])}>{user.accountTier}</span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {["free", "creator", "pro", "elite"].map(t => (
                        <SelectItem key={t} value={t}>
                          <span className={cn("capitalize font-medium", TIER_COLORS[t])}>{t}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <Link href={`/profile/${user.username}`}>
                      <ActionBtn variant="ghost"><ExternalLink size={11} /> View</ActionBtn>
                    </Link>
                    {!user.isVerified && (
                      <ActionBtn onClick={() => verifyUser(user.id)}><BadgeCheck size={11} /> Verify</ActionBtn>
                    )}
                    <ActionBtn
                      onClick={() => { setGrantModal({ subscriberId: user.id, subscriberUsername: user.username }); setGrantError(""); setGrantCreator(""); setGrantDays("30"); }}
                    >
                      <UserCheck size={11} /> Grant Sub
                    </ActionBtn>
                    <ActionBtn onClick={() => { setEditProfileModal(user); setEditBio(""); setEditAvatarUrl(""); }}>
                      <Pencil size={11} /> Edit
                    </ActionBtn>
                    {user.isSuspended ? (
                      <ActionBtn onClick={() => unsuspend(user.id)}><ShieldOff size={11} /> Unsuspend</ActionBtn>
                    ) : (
                      <ActionBtn variant="destructive" onClick={() => { setSuspendModal(user); setSuspendDays("3"); setSuspendReason(""); }}>
                        <Clock size={11} /> Suspend
                      </ActionBtn>
                    )}
                    {user.isBanned ? (
                      <ActionBtn onClick={() => banUser(user.id, false)}><ShieldOff size={11} /> Unban</ActionBtn>
                    ) : (
                      <ActionBtn variant="destructive" onClick={() => banUser(user.id, true)}><Ban size={11} /> Ban</ActionBtn>
                    )}
                    <ActionBtn variant="ghost" onClick={() => toggleFeature(user.id, !user.isFeatured)}>
                      {user.isFeatured ? <><Star size={11} className="text-amber-400 fill-amber-400" /> Unfeature</> : <><Star size={11} /> Feature</>}
                    </ActionBtn>
                    {user.isAdmin ? (
                      <ActionBtn variant="destructive" onClick={() => makeAdmin(user.id, false)}>
                        <Shield size={11} /> Revoke Admin
                      </ActionBtn>
                    ) : (
                      <ActionBtn onClick={() => makeAdmin(user.id, true)}>
                        <Shield size={11} /> Make Admin
                      </ActionBtn>
                    )}
                    {!user.isAdmin && (
                      <ActionBtn variant="destructive" onClick={() => deleteUser(user.id, user.username)}>
                        <Trash2 size={11} /> Delete
                      </ActionBtn>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {users.length} results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(q, o); }}>Previous</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={users.length < LIMIT} onClick={() => { const o = offset + LIMIT; setOffset(o); load(q, o); }}>Next</Button>
        </div>
      </div>

      {/* ── Suspend Modal ── */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSuspendModal(null)}>
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm flex items-center gap-2"><Clock size={14} className="text-amber-400" /> Suspend @{suspendModal.username}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Duration</label>
                <select value={suspendDays} onChange={e => setSuspendDays(e.target.value)} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm">
                  {[["1", "1 day"], ["3", "3 days"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["90", "90 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Reason (optional)</label>
                <textarea
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  rows={2}
                  placeholder="Reason for suspension…"
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setSuspendModal(null)}>Cancel</Button>
              <Button size="sm" variant="destructive" className="flex-1" disabled={suspendLoading} onClick={submitSuspend}>
                {suspendLoading ? <RefreshCw size={13} className="animate-spin mr-1" /> : <Clock size={13} className="mr-1" />} Suspend
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Profile Modal ── */}
      {editProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setEditProfileModal(null)}>
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm">Edit Profile — @{editProfileModal.username}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Bio</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  rows={3}
                  placeholder="New bio…"
                  maxLength={500}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Avatar URL (optional)</label>
                <input
                  type="url"
                  value={editAvatarUrl}
                  onChange={e => setEditAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditProfileModal(null)}>Cancel</Button>
              <Button size="sm" className="flex-1" disabled={editProfileLoading} onClick={submitEditProfile}>
                {editProfileLoading ? <RefreshCw size={13} className="animate-spin mr-1" /> : <Pencil size={13} className="mr-1" />} Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grant Subscription Modal ── */}
      <AnimatePresence>
        {grantModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) setGrantModal(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base">Grant Free Subscription</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">For <span className="text-foreground font-medium">@{grantModal.subscriberUsername}</span> — no charge</p>
                </div>
                <button onClick={() => setGrantModal(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Creator username or ID</label>
                  <Input
                    placeholder="@username or user ID"
                    value={grantCreator}
                    onChange={e => setGrantCreator(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") submitGrantSub(); }}
                    className="h-9 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Duration</label>
                  <Select value={grantDays} onValueChange={setGrantDays}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">6 months</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                      <SelectItem value="3650">Indefinite (10 years)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {grantError && <p className="text-xs text-destructive">{grantError}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setGrantModal(null)}>Cancel</Button>
                <Button size="sm" className="flex-1" disabled={grantLoading} onClick={submitGrantSub}>
                  {grantLoading ? <RefreshCw size={13} className="animate-spin mr-1.5" /> : <UserCheck size={13} className="mr-1.5" />}
                  Grant Access
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Reports Tab ────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  underage_csam: "Underage / CSAM",
  non_consensual: "Non-Consensual",
  violence: "Violence",
  harassment: "Harassment",
  spam: "Spam",
  other: "Other",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  live_stream: "Live Stream",
  post: "Post",
  user: "User",
  dm: "Direct Message",
};

function ReasonBadge({ reason }: { reason: string }) {
  const isHigh = reason === "underage_csam";
  const isMed = reason === "non_consensual" || reason === "violence";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
        isHigh ? "bg-red-500/20 text-red-400 border border-red-500/30" :
        isMed  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                 "bg-zinc-700/60 text-zinc-400 border border-zinc-600/40"
      }`}
    >
      {isHigh && <AlertTriangle size={9} />}
      {REASON_LABELS[reason] ?? reason.replace(/_/g, " ")}
    </span>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("open");
  const [offset, setOffset] = useState(0);
  const [actioning, setActioning] = useState<number | null>(null);
  const LIMIT = 50;

  const load = useCallback((s = status, off = offset) => {
    setLoading(true);
    adminFetch(`/admin/reports?status=${s}&limit=${LIMIT}&offset=${off}`)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, offset]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function dismissReport(id: number) {
    setActioning(id);
    try {
      await adminFetch(`/admin/reports/${id}/dismiss`, { method: "POST" });
      setReports(r => r.filter(x => x.id !== id));
    } catch (e: any) {
      alert(e.message ?? "Failed to dismiss report");
    } finally { setActioning(null); }
  }

  async function actionReport(id: number) {
    if (!confirm("This will take down the reported content and flag it for NCMEC review if applicable. Continue?")) return;
    setActioning(id);
    try {
      await adminFetch(`/admin/reports/${id}/action`, { method: "POST" });
      setReports(r => r.filter(x => x.id !== id));
    } catch (e: any) {
      alert(e.message ?? "Takedown action failed");
    } finally { setActioning(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-bold">Content Reports</h2>
        <div className="flex gap-2">
          <Select value={status} onValueChange={v => { setStatus(v); setOffset(0); load(v, 0); }}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => load()} className="h-8"><RefreshCw size={13} /></Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs w-6"></TableHead>
              <TableHead className="text-xs">Content</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Reporter</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Date</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && reports.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No {status} reports</TableCell></TableRow>
            )}
            {reports.map(r => (
              <TableRow key={r.id} className="border-border/40">
                {/* severity indicator column */}
                <TableCell className="pr-0">
                  {r.reason === "underage_csam" && (
                    <div className="w-1 h-full min-h-[2rem] rounded-full bg-red-500 mx-auto" title="High severity" />
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">
                      {CONTENT_TYPE_LABELS[r.contentType] ?? r.contentType}
                    </span>
                    <p className="text-xs font-mono text-foreground/80">#{r.contentId}</p>
                    {r.note && (
                      <p className="text-[11px] text-muted-foreground italic line-clamp-2 max-w-[200px]">&ldquo;{r.note}&rdquo;</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <ReasonBadge reason={r.reason} />
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  @{r.reporterUsername ?? "unknown"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{ago(r.createdAt)}</TableCell>
                <TableCell>
                  {status === "open" ? (
                    <div className="flex items-center justify-end gap-1">
                      <ActionBtn
                        variant="ghost"
                        onClick={() => dismissReport(r.id)}
                        disabled={actioning === r.id}
                      >
                        <XCircle size={11} /> Dismiss
                      </ActionBtn>
                      <ActionBtn
                        variant="destructive"
                        onClick={() => actionReport(r.id)}
                        disabled={actioning === r.id}
                      >
                        <ShieldAlert size={11} /> Take Down
                      </ActionBtn>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{reports.length} results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(status, o); }}>Previous</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reports.length < LIMIT} onClick={() => { const o = offset + LIMIT; setOffset(o); load(status, o); }}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ── Takedown Tab ───────────────────────────────────────────────────────────────

interface TakedownRequest {
  id: number;
  requesterName: string;
  requesterEmail: string;
  signature: string;
  relationship: string;
  contentUrl: string;
  postId: number | null;
  statement: string;
  status: string;
  rejectionReason: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

function TakedownTab() {
  const [requests, setRequests] = useState<TakedownRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("pending");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const LIMIT = 50;

  const load = useCallback((s = status) => {
    setLoading(true);
    adminFetch(`/admin/takedown-requests?status=${s}&limit=${LIMIT}`)
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function action(id: number, newStatus: "removed" | "rejected", reason?: string) {
    await adminFetch(`/admin/takedown-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus, ...(reason ? { rejectionReason: reason } : {}) }),
    });
    setRequests(r => r.filter(x => x.id !== id));
    setRejectId(null);
    setRejectReason("");
  }

  function hoursAgo(dateStr: string) {
    const hours = (Date.now() - new Date(dateStr).getTime()) / 3_600_000;
    return hours;
  }

  function AgeIndicator({ createdAt }: { createdAt: string }) {
    const h = hoursAgo(createdAt);
    const cls = h >= 36 ? "text-red-400 font-bold" : h >= 24 ? "text-amber-400 font-semibold" : "text-muted-foreground";
    return (
      <span className={cls}>
        {h < 1 ? "<1h ago" : `${Math.floor(h)}h ago`}
        {h >= 36 && " ⚠️"}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert size={18} className="text-red-400" />
            TAKE IT DOWN Act — Removal Queue
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Federal law requires valid requests to be actioned within 48 hours of receipt.</p>
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={v => { setStatus(v); load(v); }}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => load()} className="h-8"><RefreshCw size={13} /></Button>
        </div>
      </div>

      {status === "pending" && requests.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span><strong>{requests.length}</strong> pending request{requests.length !== 1 ? "s" : ""}. All must be resolved within 48 hours of submission.</span>
        </div>
      )}

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs">Requestor</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Content</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Statement</TableHead>
              <TableHead className="text-xs">Age</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && requests.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                {status === "pending" ? "No pending takedown requests ✓" : `No ${status} requests`}
              </TableCell></TableRow>
            )}
            {requests.map(r => (
              <TableRow key={r.id} className="border-border/40 align-top">
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold">{r.requesterName}</p>
                    <a href={`mailto:${r.requesterEmail}`} className="text-[11px] text-primary hover:underline">{r.requesterEmail}</a>
                    <p className="text-[11px] text-muted-foreground capitalize">{r.relationship === "authorized_rep" ? "Authorized rep" : "Self"}</p>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="space-y-0.5 max-w-[200px]">
                    <a href={r.contentUrl} target="_blank" rel="noreferrer"
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 truncate">
                      <ViewIcon size={10} className="flex-shrink-0" />
                      <span className="truncate">{r.contentUrl}</span>
                    </a>
                    {r.postId && <p className="text-[11px] text-muted-foreground">Post #{r.postId}</p>}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <p className="text-xs text-muted-foreground max-w-[220px] line-clamp-3">{r.statement}</p>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  <AgeIndicator createdAt={r.createdAt} />
                </TableCell>
                <TableCell>
                  {r.status === "pending" ? (
                    <div className="flex flex-col items-end gap-1">
                      <ActionBtn variant="destructive" onClick={() => action(r.id, "removed")}>
                        <Trash2 size={11} /> Remove Content
                      </ActionBtn>
                      <ActionBtn variant="ghost" onClick={() => { setRejectId(r.id); setRejectReason(""); }}>
                        <XCircle size={11} /> Reject
                      </ActionBtn>
                      {r.contentUrl && (
                        <a href={r.contentUrl} target="_blank" rel="noreferrer">
                          <ActionBtn variant="ghost"><Eye size={11} /> View</ActionBtn>
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      r.status === "removed"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                    }`}>{r.status}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Reject reason modal */}
      {rejectId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setRejectId(null)}>
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sm">Reject takedown request #{rejectId}</h3>
            <p className="text-xs text-muted-foreground">Provide a reason (optional but recommended).</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection…"
              className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={() => action(rejectId, "rejected", rejectReason)}>
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Content Tab ────────────────────────────────────────────────────────────────

const RATINGS = ["all", "safe", "suggestive", "mature", "nsfw", "explicit"];

interface AdminComment {
  id: number; postId: number; authorId: number;
  content: string; createdAt: string;
  author: { username: string; displayName: string; avatarUrl: string | null } | null;
}

function ContentTab() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState("all");
  const [offset, setOffset] = useState(0);
  const [expandedPostId, setExpandedPostId] = useState<number | null>(null);
  const [postComments, setPostComments] = useState<Record<number, AdminComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const LIMIT = 50;

  const load = useCallback((r = rating, off = offset) => {
    setLoading(true);
    adminFetch(`/admin/posts?contentRating=${r}&limit=${LIMIT}&offset=${off}`)
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rating, offset]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function deletePost(id: number) {
    await adminFetch(`/admin/posts/${id}`, { method: "DELETE" });
    setPosts(p => p.filter(x => x.id !== id));
  }

  async function changeRating(id: number, newRating: string) {
    await adminFetch(`/admin/posts/${id}`, { method: "PATCH", body: JSON.stringify({ contentRating: newRating }) });
    setPosts(p => p.map(x => x.id === id ? { ...x, contentRating: newRating } : x));
  }

  async function pinPost(id: number, pin: boolean) {
    await adminFetch(`/admin/posts/${id}/${pin ? "pin" : "unpin"}`, { method: "POST" });
    setPosts(p => p.map(x => x.id === id ? { ...x, isPinned: pin } : x));
  }

  async function toggleComments(postId: number) {
    if (expandedPostId === postId) { setExpandedPostId(null); return; }
    setExpandedPostId(postId);
    if (postComments[postId]) return;
    setCommentsLoading(true);
    try {
      const data = await fetch(`/api/posts/${postId}/comments?limit=50`, { credentials: "include" }).then(r => r.json());
      setPostComments(prev => ({ ...prev, [postId]: data.comments ?? [] }));
    } catch { /* ignore */ }
    finally { setCommentsLoading(false); }
  }

  async function deleteComment(commentId: number, postId: number) {
    if (!confirm("Delete this comment?")) return;
    await adminFetch(`/admin/comments/${commentId}`, { method: "DELETE" });
    setPostComments(prev => ({ ...prev, [postId]: (prev[postId] ?? []).filter(c => c.id !== commentId) }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-bold">Content Moderation</h2>
        <div className="flex gap-2">
          <Select value={rating} onValueChange={v => { setRating(v); setOffset(0); load(v, 0); }}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATINGS.map(r => <SelectItem key={r} value={r} className="capitalize">{r === "all" ? "All Ratings" : r.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => load()} className="h-8"><RefreshCw size={13} /></Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs">Author</TableHead>
              <TableHead className="text-xs">Content</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Rating</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Stats</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Date</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && posts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No posts found</TableCell></TableRow>
            )}
            {posts.map(p => (
              <Fragment key={p.id}><TableRow className="border-border/40">
                <TableCell className="text-xs text-muted-foreground">@{p.authorUsername ?? p.authorId}</TableCell>
                <TableCell>
                  <p className="text-xs line-clamp-2 max-w-[180px]">{p.caption || <span className="italic text-muted-foreground">[{p.type}]</span>}</p>
                </TableCell>
                <TableCell className="hidden sm:table-cell"><RatingBadge rating={p.contentRating} /></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                  ❤ {p.likesCount} · <Eye size={10} className="inline" /> {p.viewsCount}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{ago(p.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <select
                      value={p.contentRating}
                      onChange={e => changeRating(p.id, e.target.value)}
                      className="text-[10px] bg-muted/40 border border-border/50 rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {RATINGS.filter(r => r !== "all").map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <ActionBtn variant="ghost" onClick={() => pinPost(p.id, !p.isPinned)}>
                      {p.isPinned ? <PinOff size={11} className="text-amber-400" /> : <Pin size={11} />}
                    </ActionBtn>
                    <ActionBtn variant="ghost" onClick={() => toggleComments(p.id)}>
                      <MessageSquare size={11} />
                    </ActionBtn>
                    <ActionBtn variant="destructive" onClick={() => deletePost(p.id)}>
                      <Trash2 size={11} /> Delete
                    </ActionBtn>
                  </div>
                </TableCell>
              </TableRow>
              {expandedPostId === p.id && (
                <TableRow key={`comments-${p.id}`} className="bg-muted/20 border-border/30">
                  <TableCell colSpan={6} className="py-3 px-4">
                    {commentsLoading && !postComments[p.id] ? (
                      <p className="text-xs text-muted-foreground">Loading comments…</p>
                    ) : (postComments[p.id] ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No comments</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {(postComments[p.id] ?? []).map(c => (
                          <div key={c.id} className="flex items-start gap-2 group">
                            <span className="text-[11px] text-muted-foreground shrink-0">@{c.author?.username ?? c.authorId}</span>
                            <p className="text-[11px] flex-1 line-clamp-2">{c.content}</p>
                            <button
                              onClick={() => deleteComment(c.id, p.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-destructive hover:bg-destructive/10 shrink-0"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{posts.length} results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(rating, o); }}>Previous</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={posts.length < LIMIT} onClick={() => { const o = offset + LIMIT; setOffset(o); load(rating, o); }}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ── Streams Tab ────────────────────────────────────────────────────────────────

function StreamsTab() {
  const [streams, setStreams] = useState<AdminStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("live");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const load = useCallback((s = status, off = offset) => {
    setLoading(true);
    adminFetch(`/admin/streams?status=${s}&limit=${LIMIT}&offset=${off}`)
      .then(setStreams)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, offset]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function endStream(id: number) {
    await adminFetch(`/admin/streams/${id}/end`, { method: "PATCH" });
    setStreams(s => s.map(x => x.id === id ? { ...x, status: "ended" } : x));
  }

  async function banHost(hostId: number) {
    await adminFetch(`/admin/users/${hostId}/ban`, { method: "POST" });
  }

  function duration(createdAt: string, endedAt: string | null) {
    const start = new Date(createdAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const mins = Math.floor((end - start) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-bold">Streams</h2>
        <div className="flex gap-2">
          <Select value={status} onValueChange={v => { setStatus(v); setOffset(0); load(v, 0); }}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => load()} className="h-8"><RefreshCw size={13} /></Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs">Host</TableHead>
              <TableHead className="text-xs">Title</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Viewers</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Duration</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && streams.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No {status} streams</TableCell></TableRow>
            )}
            {streams.map(s => (
              <TableRow key={s.id} className="border-border/40">
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">@{s.host?.username ?? s.hostId}</p>
                    <p className="text-xs text-muted-foreground">{s.host?.displayName}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-xs line-clamp-1 max-w-[140px]">{s.title}</p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-1 text-xs">
                    <Eye size={11} className={s.status === "live" ? "text-green-400" : "text-muted-foreground"} />
                    {s.viewerCount}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-xs text-muted-foreground capitalize">{s.audienceType.replace("_", " ")}</span>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                  {duration(s.createdAt, s.endedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {s.status === "live" && (
                      <ActionBtn variant="destructive" onClick={() => endStream(s.id)}>
                        <XCircle size={11} /> End
                      </ActionBtn>
                    )}
                    <ActionBtn variant="destructive" onClick={() => banHost(s.hostId)}>
                      <Ban size={11} /> Ban Host
                    </ActionBtn>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{streams.length} results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(status, o); }}>Previous</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={streams.length < LIMIT} onClick={() => { const o = offset + LIMIT; setOffset(o); load(status, o); }}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ── Transactions Tab ───────────────────────────────────────────────────────────

const TX_TYPES = ["all", "tip", "deposit", "withdrawal", "purchase", "fee", "auction_purchase", "auction_sale"];
const TX_STATUSES = ["all", "completed", "pending", "failed"];

function TransactionsTab() {
  const [txns, setTxns] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [txType, setTxType] = useState("all");
  const [txStatus, setTxStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const load = useCallback((t = txType, s = txStatus, off = offset) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
    if (t !== "all") params.set("type", t);
    if (s !== "all") params.set("status", s);
    adminFetch(`/admin/transactions?${params}`)
      .then(setTxns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [txType, txStatus, offset]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const TYPE_COLOR: Record<string, string> = {
    tip: "text-pink-400", deposit: "text-green-400", withdrawal: "text-amber-400",
    purchase: "text-blue-400", fee: "text-zinc-400", auction_purchase: "text-purple-400", auction_sale: "text-emerald-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-bold">Transactions</h2>
        <div className="flex gap-2 flex-wrap">
          <Select value={txType} onValueChange={v => { setTxType(v); setOffset(0); load(v, txStatus, 0); }}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TX_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t === "all" ? "All Types" : t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={txStatus} onValueChange={v => { setTxStatus(v); setOffset(0); load(txType, v, 0); }}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {TX_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => load()} className="h-8"><RefreshCw size={13} /></Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Amount</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Fee</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Status</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Description</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && txns.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No transactions found</TableCell></TableRow>
            )}
            {txns.map(t => (
              <TableRow key={t.id} className="border-border/40">
                <TableCell className="text-xs">
                  <div>
                    <p className="font-medium">@{t.username ?? t.userId}</p>
                    {t.relatedUsername && <p className="text-muted-foreground">→ @{t.relatedUsername}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn("text-xs font-semibold capitalize", TYPE_COLOR[t.type] ?? "text-muted-foreground")}>
                    {t.type}
                  </span>
                </TableCell>
                <TableCell className="text-sm font-mono font-semibold">${t.amount.toFixed(2)}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground font-mono">${t.fee.toFixed(2)}</TableCell>
                <TableCell className="hidden md:table-cell"><StatusBadge status={t.status} /></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[150px] truncate">{t.description ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{ago(t.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{txns.length} results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(txType, txStatus, o); }}>Previous</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={txns.length < LIMIT} onClick={() => { const o = offset + LIMIT; setOffset(o); load(txType, txStatus, o); }}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ── Categories Tab ─────────────────────────────────────────────────────────────

interface AdminCategory { id: number; name: string; sortOrder: number; createdAt: string; }

function CategoriesTab() {
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/categories")
      .then(setCats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true); setAddError("");
    try {
      await adminFetch("/admin/categories", { method: "POST", body: JSON.stringify({ name: newName.trim(), sortOrder: cats.length }) });
      setNewName("");
      invalidateCategoriesCache();
      load();
    } catch (e: any) { setAddError(e.message); }
    finally { setAdding(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this category?")) return;
    try {
      await adminFetch(`/admin/categories/${id}`, { method: "DELETE" });
      invalidateCategoriesCache();
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Categories</h2>
        <Button size="sm" variant="outline" onClick={load} className="h-8"><RefreshCw size={13} /></Button>
      </div>

      {/* Add new category */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm font-semibold mb-3">Add Category</p>
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Category name…"
            className="h-8 text-sm"
            maxLength={80}
          />
          <Button type="submit" size="sm" disabled={adding || !newName.trim()} className="h-8 gap-1.5">
            <Plus size={13} /> Add
          </Button>
        </form>
        {addError && <p className="text-xs text-destructive mt-2">{addError}</p>}
      </div>

      {/* Category list */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Sort Order</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Added</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && cats.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No categories yet</TableCell></TableRow>
            )}
            {cats.map(c => (
              <TableRow key={c.id} className="border-border/40">
                <TableCell className="font-medium text-sm">{c.name}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{c.sortOrder}</TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{ago(c.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <ActionBtn variant="destructive" onClick={() => handleDelete(c.id)}>
                    <Trash2 size={11} /> Delete
                  </ActionBtn>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Merch Tab ──────────────────────────────────────────────────────────────────

const MERCH_PRODUCT_TYPES = [
  { value: "shirt",       label: "Shirt",        emoji: "👕" },
  { value: "hoodie",      label: "Hoodie",       emoji: "🧥" },
  { value: "hat",         label: "Hat",          emoji: "🧢" },
  { value: "poster",      label: "Poster",       emoji: "🖼️" },
  { value: "sticker",     label: "Sticker",      emoji: "🏷️" },
  { value: "mug",         label: "Mug",          emoji: "☕" },
  { value: "tote_bag",    label: "Tote Bag",     emoji: "👜" },
  { value: "phone_case",  label: "Phone Case",   emoji: "📱" },
  { value: "vinyl_cover", label: "Vinyl",        emoji: "💿" },
  { value: "sweatpants",  label: "Sweats",       emoji: "👖" },
];

const MERCH_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "one-size"];

interface MerchProductRow {
  id: number; creatorId: number; title: string; description: string | null;
  productType: string; designUrl: string | null; previewImageUrl: string | null;
  colors: string[]; sizes: string[]; basePrice: number; creatorProfit: number;
  tags: string[]; status: string; salesCount: number; isFeatured: boolean;
  isLimitedDrop: boolean; stockLimit: number | null; createdAt: string;
  creator: { id: number; username: string; displayName: string | null; avatarUrl: string | null } | null;
}

const DEFAULT_MERCH_FORM = {
  title: "",
  description: "",
  productType: "shirt",
  previewImageUrl: "",
  designUrl: "",
  basePrice: "25",
  creatorProfit: "5",
  colorsRaw: "",
  sizes: [] as string[],
  isFeatured: false,
  isLimitedDrop: false,
  stockLimit: "",
  tagsRaw: "",
};

function MerchTab() {
  const [products, setProducts] = useState<MerchProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_MERCH_FORM);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/merch/products", { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      setProducts(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleSize(s: string) {
    setForm(f => ({
      ...f,
      sizes: f.sizes.includes(s) ? f.sizes.filter(x => x !== s) : [...f.sizes, s],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    const basePrice = parseFloat(form.basePrice);
    const creatorProfit = parseFloat(form.creatorProfit);
    if (isNaN(basePrice) || basePrice < 0.01) { setCreateError("Enter a valid base price."); return; }
    if (isNaN(creatorProfit) || creatorProfit < 0) { setCreateError("Enter a valid creator profit."); return; }
    setCreating(true);
    try {
      const r = await fetch("/api/admin/merch/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          productType: form.productType,
          previewImageUrl: form.previewImageUrl || undefined,
          designUrl: form.designUrl || undefined,
          basePrice,
          creatorProfit,
          colors: form.colorsRaw ? form.colorsRaw.split(",").map(s => s.trim()).filter(Boolean) : [],
          sizes: form.sizes,
          isFeatured: form.isFeatured,
          isLimitedDrop: form.isLimitedDrop,
          stockLimit: form.isLimitedDrop && form.stockLimit ? parseInt(form.stockLimit) : undefined,
          tags: form.tagsRaw ? form.tagsRaw.split(",").map(s => s.trim()).filter(Boolean) : [],
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || "Failed"); }
      setForm(DEFAULT_MERCH_FORM);
      setShowForm(false);
      load();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleFeatured(p: MerchProductRow) {
    setSavingId(p.id);
    try {
      const r = await fetch(`/api/admin/merch/products/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: !p.isFeatured }),
      });
      if (!r.ok) throw new Error("Failed");
      setProducts(ps => ps.map(x => x.id === p.id ? { ...x, isFeatured: !p.isFeatured } : x));
    } finally {
      setSavingId(null);
    }
  }

  async function cycleStatus(p: MerchProductRow) {
    const next = p.status === "active" ? "draft" : p.status === "draft" ? "archived" : "active";
    setSavingId(p.id);
    try {
      const r = await fetch(`/api/admin/merch/products/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error("Failed");
      setProducts(ps => ps.map(x => x.id === p.id ? { ...x, status: next } : x));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this merch product? This cannot be undone.")) return;
    setSavingId(id);
    try {
      const r = await fetch(`/api/admin/merch/products/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      setProducts(ps => ps.filter(p => p.id !== id));
    } finally {
      setSavingId(null);
    }
  }

  const statusColor: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    draft: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    archived: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Merch Products</h2>
          <p className="text-sm text-muted-foreground">{products.length} product{products.length !== 1 ? "s" : ""} in the platform store</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          New Product
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-2xl p-5"
          >
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Shirt size={16} className="text-primary" /> Create Merch Product</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Product Type */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Product Type *</label>
                  <select
                    value={form.productType}
                    onChange={e => setForm(f => ({ ...f, productType: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    {MERCH_PRODUCT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                    ))}
                  </select>
                </div>
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Sweatheory Classic Tee"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    required minLength={3} maxLength={100}
                  />
                </div>
                {/* Base Price */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Base Price ($) *</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={form.basePrice}
                    onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                {/* Creator Profit */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Creator Profit ($)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.creatorProfit}
                    onChange={e => setForm(f => ({ ...f, creatorProfit: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {/* Preview Image URL */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Preview Image URL</label>
                  <input
                    type="url" value={form.previewImageUrl}
                    onChange={e => setForm(f => ({ ...f, previewImageUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {/* Design URL */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Design File URL</label>
                  <input
                    type="url" value={form.designUrl}
                    onChange={e => setForm(f => ({ ...f, designUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {/* Colors */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Colors <span className="text-muted-foreground/60">(comma-separated)</span></label>
                  <input
                    value={form.colorsRaw}
                    onChange={e => setForm(f => ({ ...f, colorsRaw: e.target.value }))}
                    placeholder="Black, White, Navy"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tags <span className="text-muted-foreground/60">(comma-separated)</span></label>
                  <input
                    value={form.tagsRaw}
                    onChange={e => setForm(f => ({ ...f, tagsRaw: e.target.value }))}
                    placeholder="official, limited"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Product description…"
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none"
                  maxLength={1000}
                />
              </div>

              {/* Sizes */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Available Sizes</label>
                <div className="flex flex-wrap gap-2">
                  {MERCH_SIZES.map(s => (
                    <button
                      key={s} type="button"
                      onClick={() => toggleSize(s)}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                        form.sizes.includes(s)
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-muted/40 text-muted-foreground border-border hover:border-primary/30"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles row */}
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={form.isFeatured}
                    onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-sm">Featured product</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={form.isLimitedDrop}
                    onChange={e => setForm(f => ({ ...f, isLimitedDrop: e.target.checked }))}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-sm">Limited drop</span>
                </label>
                {form.isLimitedDrop && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Stock limit:</label>
                    <input
                      type="number" min="1" value={form.stockLimit}
                      onChange={e => setForm(f => ({ ...f, stockLimit: e.target.value }))}
                      placeholder="e.g. 100"
                      className="w-24 bg-background border border-border rounded-lg px-2 py-1 text-sm"
                    />
                  </div>
                )}
              </div>

              {createError && <p className="text-sm text-destructive">{createError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit" disabled={creating}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  {creating ? "Creating…" : "Create Product"}
                </button>
                <button
                  type="button" onClick={() => { setShowForm(false); setCreateError(""); }}
                  className="px-5 py-2 rounded-xl text-sm font-medium bg-muted/60 hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Loading products…</span>
        </div>
      ) : error ? (
        <div className="text-destructive text-sm py-4">{error}</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shirt size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No merch products yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map(p => {
            const typeInfo = MERCH_PRODUCT_TYPES.find(t => t.value === p.productType);
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                {/* Preview image or emoji */}
                <div className="w-12 h-12 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {p.previewImageUrl
                    ? <img src={p.previewImageUrl} alt={p.title} className="w-full h-full object-cover rounded-lg" />
                    : <span className="text-xl">{typeInfo?.emoji ?? "🛍️"}</span>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{p.title}</span>
                    {p.isFeatured && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                        <Star size={9} fill="currentColor" /> Featured
                      </span>
                    )}
                    {p.isLimitedDrop && (
                      <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/20 font-medium">
                        Limited
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    <span>{typeInfo?.emoji} {typeInfo?.label ?? p.productType}</span>
                    <span>${p.basePrice.toFixed(2)}</span>
                    {p.creator && <span>@{p.creator.username}</span>}
                    <span>{p.salesCount} sold</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Status cycle */}
                  <button
                    onClick={() => cycleStatus(p)}
                    disabled={savingId === p.id}
                    title="Click to cycle status"
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-lg border font-medium transition-colors",
                      statusColor[p.status] ?? statusColor.archived
                    )}
                  >
                    {p.status}
                  </button>

                  {/* Feature toggle */}
                  <button
                    onClick={() => toggleFeatured(p)}
                    disabled={savingId === p.id}
                    title={p.isFeatured ? "Unfeature" : "Feature"}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      p.isFeatured
                        ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                        : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
                    )}
                  >
                    <Star size={14} fill={p.isFeatured ? "currentColor" : "none"} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={savingId === p.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shop Tab ───────────────────────────────────────────────────────────────────

interface ShopItemRow {
  id: number; type: string; title: string; subtitle: string | null;
  imageUrl: string | null; affiliateUrl: string | null;
  category: string | null; badge: string | null; commission: string | null;
  isActive: boolean; position: number; createdAt: string;
}

function ShopTab() {
  const [items, setItems] = useState<ShopItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    type: "brand",
    title: "",
    subtitle: "",
    imageUrl: "",
    affiliateUrl: "",
    category: "",
    badge: "",
    commission: "",
    position: "0",
  });

  const { categories: shopCategories } = useCategories();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    subtitle: "",
    imageUrl: "",
    affiliateUrl: "",
    category: "",
    badge: "",
    commission: "",
    position: "0",
  });
  const [editImageUploading, setEditImageUploading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const editFileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(file: File) {
    setImageUploading(true);
    try {
      const result = await uploadToR2Media(file, "media");
      setField("imageUrl", result.key);
    } catch (e: any) {
      setAddError(`Image upload failed: ${e.message}`);
    } finally {
      setImageUploading(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/shop-items");
      setItems(data);
      setError("");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setAdding(true); setAddError("");
    try {
      await adminFetch("/admin/shop-items", {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          affiliateUrl: form.affiliateUrl.trim() || undefined,
          category: form.category.trim() || undefined,
          badge: form.badge.trim() || undefined,
          commission: form.commission.trim() || undefined,
          position: parseInt(form.position) || 0,
        }),
      });
      setForm({ type: "brand", title: "", subtitle: "", imageUrl: "", affiliateUrl: "", category: "", badge: "", commission: "", position: "0" });
      load();
    } catch (e: any) { setAddError(e.message); }
    finally { setAdding(false); }
  }

  async function handleToggle(item: ShopItemRow) {
    try {
      await adminFetch(`/admin/shop-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this shop item?")) return;
    try {
      await adminFetch(`/admin/shop-items/${id}`, { method: "DELETE" });
      if (editingId === id) setEditingId(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  function startEdit(item: ShopItemRow) {
    setEditingId(item.id);
    setEditError("");
    setEditForm({
      title: item.title,
      subtitle: item.subtitle ?? "",
      imageUrl: item.imageUrl ?? "",
      affiliateUrl: item.affiliateUrl ?? "",
      category: item.category ?? "",
      badge: item.badge ?? "",
      commission: item.commission ?? "",
      position: String(item.position),
    });
  }

  function setEditField(k: string, v: string) {
    setEditForm(f => ({ ...f, [k]: v }));
  }

  async function handleEditImageUpload(file: File) {
    setEditImageUploading(true);
    try {
      const result = await uploadToR2Media(file, "media");
      setEditField("imageUrl", result.key);
    } catch (e: any) {
      setEditError(`Image upload failed: ${e.message}`);
    } finally {
      setEditImageUploading(false);
    }
  }

  async function handleUpdate(id: number) {
    if (!editForm.title.trim()) { setEditError("Title is required"); return; }
    setEditSaving(true); setEditError("");
    try {
      await adminFetch(`/admin/shop-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editForm.title.trim(),
          subtitle: editForm.subtitle.trim() || undefined,
          imageUrl: editForm.imageUrl.trim() || undefined,
          affiliateUrl: editForm.affiliateUrl.trim() || undefined,
          category: editForm.category.trim() || undefined,
          badge: editForm.badge.trim() || undefined,
          commission: editForm.commission.trim() || undefined,
          position: parseInt(editForm.position) || 0,
        }),
      });
      setEditingId(null);
      load();
    } catch (e: any) { setEditError(e.message); }
    finally { setEditSaving(false); }
  }

  const brands = items.filter(i => i.type === "brand");
  const picks = items.filter(i => i.type === "creator_pick");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><ShoppingBag size={18} /> Shop Management</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage featured brands and creator picks shown in the Shop tab</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="h-8"><RefreshCw size={13} /></Button>
      </div>

      {/* Add new item */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold">Add Shop Item</p>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select value={form.type} onValueChange={v => setField("type", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brand">Featured Brand</SelectItem>
                  <SelectItem value="creator_pick">Creator Pick</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
              <Input value={form.title} onChange={e => setField("title", e.target.value)} placeholder="Brand or product name…" className="h-8 text-sm" maxLength={120} required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tagline / Subtitle</label>
              <Input value={form.subtitle} onChange={e => setField("subtitle", e.target.value)} placeholder="Short description…" className="h-8 text-sm" maxLength={200} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={form.category} onValueChange={v => setField("category", v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select category…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {shopCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Image</label>
              <div className="flex items-center gap-2">
                {form.imageUrl && (
                  <img
                    src={form.imageUrl.startsWith("http") ? form.imageUrl : `/api/upload/private-url?key=${encodeURIComponent(form.imageUrl)}`}
                    alt="preview"
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-border"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs flex-shrink-0"
                  disabled={imageUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imageUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {imageUploading ? "Uploading…" : "Upload"}
                </Button>
                <Input
                  value={form.imageUrl}
                  onChange={e => setField("imageUrl", e.target.value)}
                  placeholder="or paste URL"
                  className="h-8 text-sm min-w-0"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Affiliate URL</label>
              <Input value={form.affiliateUrl} onChange={e => setField("affiliateUrl", e.target.value)} placeholder="https://…" className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Badge</label>
              <Input value={form.badge} onChange={e => setField("badge", e.target.value)} placeholder="e.g. NEW, HOT" className="h-8 text-sm" maxLength={40} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Commission</label>
              <Input value={form.commission} onChange={e => setField("commission", e.target.value)} placeholder="e.g. 15%" className="h-8 text-sm" maxLength={20} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Position</label>
              <Input type="number" value={form.position} onChange={e => setField("position", e.target.value)} className="h-8 text-sm" min={0} />
            </div>
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <Button type="submit" size="sm" disabled={adding || !form.title.trim()} className="gap-1.5">
            <Plus size={13} /> Add Item
          </Button>
        </form>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Brands */}
      <div>
        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Star size={13} className="text-primary" /> Featured Brands ({brands.length})</p>
        <div className="border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-xs">Brand</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Category</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Commission</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
                </TableCell></TableRow>
              )}
              {!loading && brands.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-xs">No featured brands yet</TableCell></TableRow>
              )}
              {brands.map(item => (
                <Fragment key={item.id}>
                  <TableRow className="border-border/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.imageUrl && <img src={item.imageUrl.startsWith("http") ? item.imageUrl : `/api/upload/private-url?key=${encodeURIComponent(item.imageUrl)}`} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />}
                        <div>
                          <p className="text-sm font-medium leading-tight">{item.title}</p>
                          {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{item.category ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{item.commission ?? "—"}</TableCell>
                    <TableCell>
                      <button onClick={() => handleToggle(item)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${item.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20" : "bg-muted/40 text-muted-foreground border-border hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20"}`}>
                        {item.isActive ? "Active" : "Hidden"}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.affiliateUrl && (
                          <a href={item.affiliateUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                            <Globe size={12} />
                          </a>
                        )}
                        <button onClick={() => editingId === item.id ? setEditingId(null) : startEdit(item)} className={`p-1.5 rounded transition-colors ${editingId === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"}`}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === item.id && (
                    <TableRow className="border-border/40 bg-muted/10">
                      <TableCell colSpan={5} className="py-3 px-3">
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Title *</label>
                              <Input value={editForm.title} onChange={e => setEditField("title", e.target.value)} className="h-7 text-xs" maxLength={120} />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Tagline</label>
                              <Input value={editForm.subtitle} onChange={e => setEditField("subtitle", e.target.value)} className="h-7 text-xs" maxLength={200} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Affiliate URL</label>
                              <Input value={editForm.affiliateUrl} onChange={e => setEditField("affiliateUrl", e.target.value)} placeholder="https://…" className="h-7 text-xs" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Category</label>
                              <Select value={editForm.category || "__none__"} onValueChange={v => setEditField("category", v === "__none__" ? "" : v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— None —</SelectItem>
                                  {shopCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Image</label>
                            <div className="flex items-center gap-2">
                              {editForm.imageUrl && (
                                <img
                                  src={editForm.imageUrl.startsWith("http") ? editForm.imageUrl : `/api/upload/private-url?key=${encodeURIComponent(editForm.imageUrl)}`}
                                  alt="preview"
                                  className="w-7 h-7 rounded-lg object-cover flex-shrink-0 border border-border"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              )}
                              <input ref={editFileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleEditImageUpload(f); e.target.value = ""; }} />
                              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11px] flex-shrink-0" disabled={editImageUploading} onClick={() => editFileInputRef.current?.click()}>
                                {editImageUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                {editImageUploading ? "Uploading…" : "Upload"}
                              </Button>
                              <Input value={editForm.imageUrl} onChange={e => setEditField("imageUrl", e.target.value)} placeholder="or paste URL" className="h-7 text-xs min-w-0" />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Badge</label>
                              <Input value={editForm.badge} onChange={e => setEditField("badge", e.target.value)} placeholder="e.g. NEW" className="h-7 text-xs" maxLength={40} />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Commission</label>
                              <Input value={editForm.commission} onChange={e => setEditField("commission", e.target.value)} placeholder="e.g. 15%" className="h-7 text-xs" maxLength={20} />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Position</label>
                              <Input type="number" value={editForm.position} onChange={e => setEditField("position", e.target.value)} className="h-7 text-xs" min={0} />
                            </div>
                          </div>
                          {editError && <p className="text-xs text-destructive">{editError}</p>}
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" disabled={editSaving || !editForm.title.trim()} onClick={() => handleUpdate(item.id)} className="h-7 text-xs gap-1">
                              {editSaving ? <Loader2 size={11} className="animate-spin" /> : null}
                              {editSaving ? "Saving…" : "Save changes"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-7 text-xs">Cancel</Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Creator Picks */}
      <div>
        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Star size={13} className="text-purple-400" /> Creator Picks ({picks.length})</p>
        <div className="border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Category</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
                </TableCell></TableRow>
              )}
              {!loading && picks.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">No creator picks yet</TableCell></TableRow>
              )}
              {picks.map(item => (
                <Fragment key={item.id}>
                  <TableRow className="border-border/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.imageUrl && <img src={item.imageUrl.startsWith("http") ? item.imageUrl : `/api/upload/private-url?key=${encodeURIComponent(item.imageUrl)}`} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />}
                        <div>
                          <p className="text-sm font-medium leading-tight">{item.title}</p>
                          {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{item.category ?? "—"}</TableCell>
                    <TableCell>
                      <button onClick={() => handleToggle(item)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${item.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20" : "bg-muted/40 text-muted-foreground border-border hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20"}`}>
                        {item.isActive ? "Active" : "Hidden"}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.affiliateUrl && (
                          <a href={item.affiliateUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                            <Globe size={12} />
                          </a>
                        )}
                        <button onClick={() => editingId === item.id ? setEditingId(null) : startEdit(item)} className={`p-1.5 rounded transition-colors ${editingId === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"}`}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === item.id && (
                    <TableRow className="border-border/40 bg-muted/10">
                      <TableCell colSpan={4} className="py-3 px-3">
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Title *</label>
                              <Input value={editForm.title} onChange={e => setEditField("title", e.target.value)} className="h-7 text-xs" maxLength={120} />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Tagline</label>
                              <Input value={editForm.subtitle} onChange={e => setEditField("subtitle", e.target.value)} className="h-7 text-xs" maxLength={200} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Affiliate URL</label>
                              <Input value={editForm.affiliateUrl} onChange={e => setEditField("affiliateUrl", e.target.value)} placeholder="https://…" className="h-7 text-xs" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Category</label>
                              <Select value={editForm.category || "__none__"} onValueChange={v => setEditField("category", v === "__none__" ? "" : v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— None —</SelectItem>
                                  {shopCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground mb-1 block">Image</label>
                            <div className="flex items-center gap-2">
                              {editForm.imageUrl && (
                                <img
                                  src={editForm.imageUrl.startsWith("http") ? editForm.imageUrl : `/api/upload/private-url?key=${encodeURIComponent(editForm.imageUrl)}`}
                                  alt="preview"
                                  className="w-7 h-7 rounded-lg object-cover flex-shrink-0 border border-border"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              )}
                              <input ref={editFileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleEditImageUpload(f); e.target.value = ""; }} />
                              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11px] flex-shrink-0" disabled={editImageUploading} onClick={() => editFileInputRef.current?.click()}>
                                {editImageUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                {editImageUploading ? "Uploading…" : "Upload"}
                              </Button>
                              <Input value={editForm.imageUrl} onChange={e => setEditField("imageUrl", e.target.value)} placeholder="or paste URL" className="h-7 text-xs min-w-0" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Badge</label>
                              <Input value={editForm.badge} onChange={e => setEditField("badge", e.target.value)} placeholder="e.g. NEW" className="h-7 text-xs" maxLength={40} />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Position</label>
                              <Input type="number" value={editForm.position} onChange={e => setEditField("position", e.target.value)} className="h-7 text-xs" min={0} />
                            </div>
                          </div>
                          {editError && <p className="text-xs text-destructive">{editError}</p>}
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" disabled={editSaving || !editForm.title.trim()} onClick={() => handleUpdate(item.id)} className="h-7 text-xs gap-1">
                              {editSaving ? <Loader2 size={11} className="animate-spin" /> : null}
                              {editSaving ? "Saving…" : "Save changes"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-7 text-xs">Cancel</Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ── Mux Cleanup Tab ────────────────────────────────────────────────────────────

function MuxCleanupTab() {
  const [stats, setStats] = useState<MuxCleanupStats | null>(null);
  const [entries, setEntries] = useState<MuxCleanupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const loadStats = useCallback(() => {
    return adminFetch("/admin/mux-cleanup-log/stats");
  }, []);

  const loadEntries = useCallback((reason: string, off: number) => {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
    if (reason !== "all") params.set("reason", reason);
    return adminFetch(`/admin/mux-cleanup-log?${params}`);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([loadStats(), loadEntries(reasonFilter, offset)])
      .then(([s, e]) => { setStats(s); setEntries(e); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadStats, loadEntries, reasonFilter, offset]);

  useEffect(() => { load(); }, [load]);

  function formatDuration(secs: number | null): string {
    if (secs == null) return "—";
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Mux Cleanup Log</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Orphaned and errored uploads/assets removed by the cleanup job</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (reasonFilter !== "all") params.set("reason", reasonFilter);
              const url = `/api/admin/mux-cleanup-log/export${params.toString() ? `?${params}` : ""}`;
              const a = document.createElement("a");
              a.href = url;
              a.download = reasonFilter !== "all" ? `mux-cleanup-${reasonFilter}.csv` : "mux-cleanup-log.csv";
              a.click();
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="text-destructive text-sm p-3 bg-destructive/10 rounded-lg border border-destructive/20">{error}</div>}

      {/* Stats cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Cleaned Up" value={stats.total.toLocaleString()} icon={<Video size={16} />} sub="all time" />
            <StatCard label="Orphaned Uploads" value={stats.orphanedUploads.toLocaleString()} icon={<AlertTriangle size={16} />} sub="never completed" />
            <StatCard label="Orphaned Assets" value={stats.orphanedAssets.toLocaleString()} icon={<Trash2 size={16} />} sub="no post claimed" />
            <StatCard label="Errored" value={stats.erroredTotal.toLocaleString()} icon={<AlertTriangle size={16} />} sub="Mux encoding failures" />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-2.5">
            <span className="font-medium text-foreground">Breakdown:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              Orphaned: <span className="font-semibold text-foreground">{(stats.orphanedUploads + stats.orphanedAssets).toLocaleString()}</span>
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              Errored: <span className="font-semibold text-foreground">{stats.erroredTotal.toLocaleString()}</span>
            </span>
          </div>

          {/* Per-reason breakdown */}
          {Object.keys(stats.byCause).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-primary" /> Per-Reason Count
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {Object.entries(stats.byCause)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, total]) => {
                    const isError = reason.startsWith("errored_");
                    return (
                      <div key={reason} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isError ? "bg-red-400" : "bg-amber-400"}`} />
                          <code className="font-mono">{reason}</code>
                        </span>
                        <span className={`font-semibold tabular-nums ${isError ? "text-red-400" : "text-amber-400"}`}>
                          {total.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Top users */}
      {stats && stats.topUsers.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" /> Top Users by Abandoned Uploads
          </h3>
          <div className="space-y-2">
            {stats.topUsers.map((row, i) => (
              <div key={row.userId ?? i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                  {row.user ? (
                    <span className="font-medium">@{row.user.username}</span>
                  ) : (
                    <span className="text-muted-foreground italic">deleted user ({row.userId})</span>
                  )}
                </div>
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {row.total} event{row.total !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <h3 className="text-sm font-semibold">Deletion History</h3>
          <Select value={reasonFilter} onValueChange={v => { setReasonFilter(v); setOffset(0); }}>
            <SelectTrigger className="h-7 text-xs w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              <SelectItem value="orphaned_upload">Orphaned upload</SelectItem>
              <SelectItem value="orphaned_asset">Orphaned asset</SelectItem>
              <SelectItem value="orphaned_asset_webhook">Orphaned asset (webhook)</SelectItem>
              <SelectItem value="errored_asset_webhook">Errored asset (webhook)</SelectItem>
              <SelectItem value="errored_upload_webhook">Errored upload (webhook)</SelectItem>
              <SelectItem value="errored_asset_daily_sweep">Errored asset (daily sweep)</SelectItem>
              <SelectItem value="errored_upload_daily_sweep">Errored upload (daily sweep)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-8 text-sm">
            <RefreshCw size={14} className="animate-spin" /> Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No cleanup events recorded yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">Mux Asset ID</TableHead>
                <TableHead className="text-xs">Upload ID</TableHead>
                <TableHead className="text-xs">Duration</TableHead>
                <TableHead className="text-xs">Deleted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">
                    {entry.user ? (
                      <Link href={`/u/${entry.user.username}`}>
                        <span className="text-primary hover:underline cursor-pointer">@{entry.user.username}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground italic">
                        {entry.userId != null ? `deleted (${entry.userId})` : "unknown"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const REASON_LABELS: Record<string, { label: string; cls: string }> = {
                        orphaned_upload:          { label: "Orphaned Upload",         cls: "border-amber-500/30 text-amber-400 bg-amber-500/10" },
                        orphaned_asset:           { label: "Orphaned Asset",          cls: "border-orange-500/30 text-orange-400 bg-orange-500/10" },
                        orphaned_asset_webhook:   { label: "Orphaned Asset (Webhook)", cls: "border-orange-500/30 text-orange-400 bg-orange-500/10" },
                        errored_asset_webhook:    { label: "Errored Asset (Webhook)", cls: "border-red-500/30 text-red-400 bg-red-500/10" },
                        errored_upload_webhook:   { label: "Errored Upload (Webhook)", cls: "border-red-500/30 text-red-400 bg-red-500/10" },
                        errored_asset_daily_sweep:  { label: "Errored Asset (Sweep)",  cls: "border-rose-500/30 text-rose-400 bg-rose-500/10" },
                        errored_upload_daily_sweep: { label: "Errored Upload (Sweep)", cls: "border-rose-500/30 text-rose-400 bg-rose-500/10" },
                      };
                      const meta = REASON_LABELS[entry.reason];
                      return (
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", meta?.cls ?? "border-border text-muted-foreground bg-muted/30")}>
                          {meta?.label ?? entry.reason}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                    {entry.muxAssetId ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                    {entry.uploadId}
                  </TableCell>
                  <TableCell className="text-xs">{formatDuration(entry.durationSeconds)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {ago(entry.deletedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {entries.length === LIMIT && (
          <div className="flex justify-end px-4 py-3 border-t border-border/60">
            <button
              onClick={() => setOffset(o => o + LIMIT)}
              className="text-xs text-primary hover:underline"
            >
              Load more →
            </button>
          </div>
        )}
        {offset > 0 && (
          <div className="flex justify-start px-4 py-3 border-t border-border/60">
            <button
              onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              ← Previous
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────────

// ── Audit Log Tab ──────────────────────────────────────────────────────────────

function AuditLogTab() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const LIMIT = 50;
  const ACTIONS = [
    "all", "ban", "unban", "suspend", "unsuspend", "verify",
    "delete_post", "delete_comment", "edit_profile",
    "pin_post", "unpin_post", "feature_creator", "unfeature_creator",
  ];

  const load = useCallback((p = page, action = actionFilter) => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (action !== "all") q.set("action", action);
    adminFetch(`/admin/audit-log?${q}`)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, actionFilter]);

  useEffect(() => { load(1, "all"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function actionLabel(action: string) {
    return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  const ACTION_COLORS: Record<string, string> = {
    ban:               "text-red-400 bg-red-500/10 border-red-500/25",
    unban:             "text-green-400 bg-green-500/10 border-green-500/25",
    suspend:           "text-amber-400 bg-amber-500/10 border-amber-500/25",
    unsuspend:         "text-blue-400 bg-blue-500/10 border-blue-500/25",
    verify:            "text-primary bg-primary/10 border-primary/25",
    delete_post:       "text-red-400 bg-red-500/10 border-red-500/25",
    delete_comment:    "text-red-400 bg-red-500/10 border-red-500/25",
    edit_profile:      "text-sky-400 bg-sky-500/10 border-sky-500/25",
    pin_post:          "text-amber-400 bg-amber-500/10 border-amber-500/25",
    unpin_post:        "text-muted-foreground bg-muted/20 border-border/40",
    feature_creator:   "text-amber-400 bg-amber-500/10 border-amber-500/25",
    unfeature_creator: "text-muted-foreground bg-muted/20 border-border/40",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity size={18} className="text-primary" />
          Admin Audit Log
        </h2>
        <div className="flex gap-2">
          <select
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); load(1, e.target.value); }}
            className="text-xs bg-input border border-border rounded-lg px-3 py-1.5 text-foreground"
          >
            {ACTIONS.map(a => <option key={a} value={a}>{a === "all" ? "All actions" : actionLabel(a)}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => load(page, actionFilter)} className="h-8"><RefreshCw size={13} /></Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-xs">Admin</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="text-xs">Target</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Reason</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                <RefreshCw size={14} className="animate-spin inline mr-2" />Loading…
              </TableCell></TableRow>
            )}
            {!loading && entries.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No audit log entries</TableCell></TableRow>
            )}
            {entries.map(e => (
              <TableRow key={e.id} className="border-border/40">
                <TableCell className="text-xs text-muted-foreground">@{e.adminUsername ?? `#${e.adminId}`}</TableCell>
                <TableCell>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ACTION_COLORS[e.action] ?? "border-border text-muted-foreground"}`}>
                    {actionLabel(e.action)}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">
                  {e.targetType} {e.targetId ? `#${e.targetId}` : ""}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                  {e.reason || <span className="italic opacity-50">—</span>}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{ago(e.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{entries.length} results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 1} onClick={() => { const p = page - 1; setPage(p); load(p, actionFilter); }}>Previous</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={entries.length < LIMIT} onClick={() => { const p = page + 1; setPage(p); load(p, actionFilter); }}>Next</Button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useCurrentUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initialTab = (): Tab => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && TABS.some(tab => tab.id === t)) return t as Tab;
    } catch { /* noop */ }
    return "dashboard";
  };

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Auth gate — redirect if not logged in or not admin (including API error cases)
  useEffect(() => {
    if (!isLoading) {
      if (!isLoggedIn()) { setLocation("/login"); return; }
      if (!user || !(user as any).isAdmin) { setLocation("/feed"); return; }
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user || !(user as any).isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Verifying access…</span>
        </div>
      </div>
    );
  }

  const TAB_CONTENT: Record<Tab, React.ReactNode> = {
    dashboard:    <DashboardTab />,
    users:        <UsersTab />,
    reports:      <ReportsTab />,
    takedown:     <TakedownTab />,
    content:      <ContentTab />,
    streams:      <StreamsTab />,
    transactions: <TransactionsTab />,
    categories:   <CategoriesTab />,
    merch:        <MerchTab />,
    shop:         <ShopTab />,
    mux_cleanup:  <MuxCleanupTab />,
    audit_log:    <AuditLogTab />,
    security:     <SecurityTab />,
  };

  function SidebarNav({ onSelect }: { onSelect?: () => void }) {
    return (
      <nav className="flex flex-col gap-1 px-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); onSelect?.(); }}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
              activeTab === tab.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border/60 px-4 h-14 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="md:hidden p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/gooncity-g.png" alt="G" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
            <img src="/gooncity-wordmark-tight.png" alt="Sweatheory" className="h-3.5 w-auto max-w-[104px] object-contain flex-shrink-0" />
          </Link>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15">
            <Shield size={11} className="text-primary" />
            <span className="text-[10px] font-bold text-primary tracking-wide uppercase">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <UserCheck size={13} className="text-primary" />
            @{(user as any).username}
          </div>
          <Link href="/">
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted/60">
              <ExternalLink size={13} /> Site
            </button>
          </Link>
          <button
            onClick={async () => { await logout(); setLocation("/"); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-2.5 py-1.5 rounded-lg hover:bg-destructive/10"
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-52 border-r border-border/60 bg-background flex-shrink-0 pt-4 pb-6">
          <SidebarNav />
        </aside>

        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-30 bg-black/60 md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: -240 }}
                animate={{ x: 0 }}
                exit={{ x: -240 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed left-0 top-14 bottom-0 z-40 w-56 bg-background border-r border-border/60 pt-4 pb-6 md:hidden"
              >
                <SidebarNav onSelect={() => setSidebarOpen(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-6xl mx-auto">
            {TAB_CONTENT[activeTab]}
          </div>
        </main>
      </div>
    </div>
  );
}
