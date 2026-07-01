import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  Home, Compass, Radio, MessageSquare, Wallet, Bell, Settings,
  Bookmark, BarChart2, User, ChevronLeft, ChevronRight,
  Video, Tv, Calendar, ShoppingBag, Search, PlusSquare,
  Zap, Crown, Shield, Star, HardDrive, LogOut,
  Plus, Camera, Image, Music, ShoppingCart, Gavel, X, Menu,
  BookOpen, ScrollText,
} from "lucide-react";
import { AnimatePresence, motion as m } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logout } from "@/lib/auth";
import { useGetUnreadNotificationCount, useGetUnreadMessageCount } from "@workspace/api-client-react";
import { Avatar } from "./Avatar";
import { RightSidebar } from "./RightSidebar";
import { motion } from "framer-motion";
import {
  type AccountTier, TIER_STORAGE_BYTES, TIER_STORAGE_LABEL,
  tierColor, formatBytes,
} from "@/lib/tiers";
import { BugReportModal } from "./BugReportModal";

const NAV_PRIMARY = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/feed", icon: Radio, label: "Social Sweat", auth: true },
  { href: "/messages", icon: MessageSquare, label: "Messages", auth: true, badge: true },
  { href: "/requests", icon: ScrollText, label: "Requests", auth: true },
  { href: "/go-live", icon: Video, label: "Go Live", auth: true, live: true },
  { href: "/watch", icon: Tv, label: "Sweat Live" },
  { href: "/meetups", icon: Calendar, label: "Meetups" },
  { href: "/marketplace", icon: ShoppingBag, label: "Marketplace" },
  { href: "/wallet", icon: Wallet, label: "Wallet", auth: true },
  { href: "/notifications", icon: Bell, label: "Notifications", auth: true, badge: true },
];

const NAV_MORE = [
  { href: "/bookmarks", icon: Bookmark, label: "Saved", auth: true },
  { href: "/library", icon: BookOpen, label: "Library", auth: true },
  { href: "/requests", icon: ScrollText, label: "Requests", auth: true },
  { href: "/analytics", icon: BarChart2, label: "Analytics", auth: true },
  { href: "/pricing", icon: Zap, label: "Pricing" },
  { href: "/settings", icon: Settings, label: "Settings", auth: true },
];

const RIGHT_SIDEBAR_ROUTES = ["/", "/feed", "/explore"];

const TIER_ICONS_SMALL: Record<AccountTier, React.ReactNode> = {
  free:    <Shield size={13} className="text-zinc-400" />,
  creator: <Zap    size={13} className="text-cyan-400" />,
  pro:     <Crown  size={13} className="text-amber-400" />,
  elite:   <Star   size={13} className="text-rose-400" />,
};

const TIER_LABELS: Record<AccountTier, string> = {
  free:    "Free Viewer",
  creator: "Free Creator",
  pro:     "Pro Creator",
  elite:   "Elite Creator",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, isLoggedIn } = useCurrentUser();
  const [leftOpen, setLeftOpen] = useState(() => {
    try { return localStorage.getItem("sidebar_left") !== "collapsed"; } catch { return true; }
  });
  const [rightOpen, setRightOpen] = useState(() => {
    try { return localStorage.getItem("sidebar_right") !== "collapsed"; } catch { return true; }
  });
  const [searchFocused, setSearchFocused] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const { data: unreadData } = useGetUnreadNotificationCount({
    query: { enabled: isLoggedIn, staleTime: 30000, queryKey: ["notifications", "unread-count"] }
  });
  const unreadCount = (unreadData as any)?.count ?? 0;

  const { data: unreadMsgData } = useGetUnreadMessageCount({
    query: { enabled: isLoggedIn, refetchInterval: 15000, queryKey: ["messages", "unread-count"] }
  });
  const unreadMsgCount = (unreadMsgData as any)?.count ?? 0;

  const showRightSidebar = RIGHT_SIDEBAR_ROUTES.some(r => location === r || (r !== "/" && location.startsWith(r)));

  useEffect(() => {
    try { localStorage.setItem("sidebar_left", leftOpen ? "open" : "collapsed"); } catch {}
  }, [leftOpen]);

  useEffect(() => {
    try { localStorage.setItem("sidebar_right", rightOpen ? "open" : "collapsed"); } catch {}
  }, [rightOpen]);

  async function handleLogout() {
    await logout();
    setLocation("/login");
  }

  function isActive(href: string) {
    if (href.startsWith("#")) return false;
    if (href === "/") return location === "/";
    if (href === "/watch" && location.startsWith("/stream/")) return true;
    return location === href || location.startsWith(href + "/");
  }

  const currentTier = (user?.accountTier ?? "free") as AccountTier;
  const storageUsed = ((user as any)?.storageUsedBytes ?? 0) as number;
  const storageLimit = TIER_STORAGE_BYTES[currentTier];
  const usagePct = storageLimit > 0 ? Math.min(100, (storageUsed / storageLimit) * 100) : 0;

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">

      {/* ── FIXED TOP HEADER ──────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-sidebar border-b border-border/60 flex items-center px-4 gap-3">

        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer flex-shrink-0">
            <span className="font-serif text-base font-semibold tracking-[0.1em] text-foreground select-none">SWEATHEORY WELLNESS</span>
          </div>
        </Link>

        {/* Search — full bar on sm+, icon-only on mobile */}
        <div className="hidden sm:flex flex-1 max-w-lg mx-auto">
          <Link href="/explore" className="w-full">
            <div className={cn(
              "flex items-center gap-2.5 bg-muted/60 border rounded-xl px-4 py-2 text-sm text-muted-foreground cursor-pointer transition-all",
              searchFocused ? "border-primary/40 bg-muted/80" : "border-border/40 hover:border-border hover:bg-muted/80"
            )}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            >
              <Search size={14} className="flex-shrink-0" />
              <span className="truncate">Search people, hashtags, categories...</span>
            </div>
          </Link>
        </div>
        {/* Action buttons (search + profile/sign-in) */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          {/* Search icon — mobile only */}
          <Link href="/explore" className="sm:hidden">
            <button className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
              <Search size={18} />
            </button>
          </Link>
          {isLoggedIn && user ? (
            <Link href={`/profile/${(user as any)?.username ?? ""}`}>
              <button className="w-9 h-9 rounded-xl hover:ring-2 hover:ring-primary/40 transition-all overflow-hidden flex-shrink-0" title="Profile">
                <Avatar user={user as any} size="sm" />
              </button>
            </Link>
          ) : !isLoggedIn ? (
            <Link href="/login">
              <button className="px-4 py-1.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
                Sign in
              </button>
            </Link>
          ) : null}
        </div>
      </header>

      {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
      {/* Collapse toggle — visible at md+ */}
      <button
        onClick={() => setLeftOpen(o => !o)}
        className="hidden md:flex fixed top-20 z-50 w-6 h-6 bg-sidebar border border-border rounded-full items-center justify-center hover:border-primary/40 hover:text-primary text-muted-foreground shadow-sm"
        style={{
          left: leftOpen ? "164px" : "52px",
          transition: "left 200ms cubic-bezier(0.4,0,0.2,1)",
        }}
        title={leftOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        <ChevronLeft
          size={12}
          style={{ transition: "transform 200ms cubic-bezier(0.4,0,0.2,1)", transform: leftOpen ? "rotate(0deg)" : "rotate(180deg)" }}
        />
      </button>

      <aside
        className={cn(
          "flex flex-col fixed left-0 top-14 bottom-0 z-40 bg-sidebar border-r border-border/60 overflow-hidden",
          "[transition:width_200ms_cubic-bezier(0.4,0,0.2,1)]",
          leftOpen ? "w-0 md:w-44" : "w-0 md:w-16"
        )}
      >

        {/* Logo — top of sidebar */}
        <Link href="/">
          <div className={cn(
            "flex items-center gap-2.5 px-4 py-3 border-b border-border/40 cursor-pointer hover:bg-muted/40 transition-colors flex-shrink-0",
            !leftOpen && "justify-center px-0"
          )}>
            <img src="/sweatheory-logo.png" alt="Sweatheory" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
            {leftOpen && (
              <span className="font-serif text-sm font-semibold tracking-[0.08em] text-foreground select-none truncate">SWEATHEORY WELLNESS</span>
            )}
          </div>
        </Link>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden space-y-0.5 scrollbar-none">
          {NAV_PRIMARY.map(({ href, icon: Icon, label, auth, badge, live }) => {
            if (auth && !isLoggedIn) return null;
            const active = isActive(href);
            const showBadge = badge && (
              (label === "Notifications" && unreadCount > 0) ||
              (label === "Messages" && unreadMsgCount > 0)
            );
            const badgeCount = label === "Messages" ? unreadMsgCount : unreadCount;
            return (
              <Link key={label} href={href}>
                <div
                  data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 group",
                    active
                      ? "bg-primary/15 text-primary font-semibold"
                      : live
                        ? "text-muted-foreground hover:text-red-400 hover:bg-red-600/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    !leftOpen && "justify-center px-0"
                  )}
                  title={!leftOpen ? label : undefined}
                >
                  <div className="relative flex-shrink-0">
                    <Icon size={18} className={cn("transition-colors", active ? "text-primary" : live ? "group-hover:text-red-400" : "")} />
                    {live && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  </div>
                  {leftOpen && (
                    <>
                      <span className="text-sm flex-1 truncate">{label}</span>
                      {showBadge && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {badgeCount > 9 ? "9+" : badgeCount}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </Link>
            );
          })}

          {/* Profile link */}
          {isLoggedIn && (
            <Link href={`/profile/${(user as any)?.username ?? ""}`}>
              <div
                data-testid="nav-profile"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150",
                  isActive(`/profile/${(user as any)?.username}`)
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  !leftOpen && "justify-center px-0"
                )}
                title={!leftOpen ? "Profile" : undefined}
              >
                <User size={18} className="flex-shrink-0" />
                {leftOpen && <span className="text-sm flex-1 truncate">Profile</span>}
              </div>
            </Link>
          )}

          {/* More items */}
          {NAV_MORE.map(({ href, icon: Icon, label, auth }) => {
            if (auth && !isLoggedIn) return null;
            const active = isActive(href);
            const isPricingForFree = href === "/pricing" && isLoggedIn && currentTier === "free";
            return (
              <Link key={href} href={href}>
                <div
                  data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150",
                    active
                      ? "bg-primary/15 text-primary font-semibold"
                      : isPricingForFree
                        ? "text-primary hover:bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    !leftOpen && "justify-center px-0"
                  )}
                  title={!leftOpen ? label : undefined}
                >
                  <Icon size={18} className={cn("flex-shrink-0", isPricingForFree && !active && "text-primary")} />
                  {leftOpen && <span className="text-sm flex-1 truncate">{label}</span>}
                  {leftOpen && isPricingForFree && (
                    <span className="text-[9px] font-black bg-primary/15 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">
                      FREE
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          {/* Admin link — inline with Settings */}
          {isLoggedIn && (user as any)?.isAdmin && (
            <Link href="/admin">
              <div
                data-testid="nav-admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150",
                  isActive("/admin")
                    ? "bg-amber-500/15 text-amber-400 font-semibold"
                    : "text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10",
                  !leftOpen && "justify-center px-0"
                )}
                title={!leftOpen ? "Admin" : undefined}
              >
                <Shield size={18} className="flex-shrink-0" />
                {leftOpen && <span className="text-sm flex-1 truncate">Admin</span>}
              </div>
            </Link>
          )}
        </nav>

        {/* Bottom: tier widget + New Post */}
        <div className="px-2 pb-3 border-t border-border/60 pt-2 space-y-2">

          {/* Tier / upgrade widget — shown for non-free logged-in users */}
          {isLoggedIn && user && currentTier !== "free" && leftOpen && (
            <Link href="/pricing">
              <motion.div
                whileHover={{ scale: 1.01 }}
                className={cn(
                  "rounded-xl border px-3 py-2.5 cursor-pointer transition-colors",
                  currentTier === "elite"
                    ? "border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10"
                    : currentTier === "pro"
                      ? "border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10"
                      : "border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className={cn(
                    "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0",
                    currentTier === "elite" ? "bg-rose-500/20" : currentTier === "pro" ? "bg-amber-500/20" : "bg-cyan-500/20"
                  )}>
                    {TIER_ICONS_SMALL[currentTier]}
                  </div>
                  <span className={cn("text-xs font-bold", tierColor(currentTier))}>
                    {TIER_LABELS[currentTier]}
                  </span>
                  {currentTier !== "elite" && (
                    <span className="ml-auto text-[9px] font-bold text-muted-foreground">Upgrade</span>
                  )}
                </div>
                {/* Storage bar */}
                <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-amber-500" : "bg-cyan-500/60"
                    )}
                    style={{ width: `${Math.max(usagePct, 2)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                  {formatBytes(storageUsed)} of {TIER_STORAGE_LABEL[currentTier]}
                </p>
              </motion.div>
            </Link>
          )}
          {/* Collapsed: just the tier icon (non-free) */}
          {isLoggedIn && user && currentTier !== "free" && !leftOpen && (
            <Link href="/pricing">
              <div
                className={cn(
                  "flex items-center justify-center py-2 rounded-xl border transition-colors",
                  currentTier === "elite"
                    ? "border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/15"
                    : currentTier === "pro"
                      ? "border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/15"
                      : "border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10"
                )}
                title={`${TIER_LABELS[currentTier]} — Click to manage`}
              >
                {TIER_ICONS_SMALL[currentTier]}
              </div>
            </Link>
          )}

          {/* New Post / sign in */}
          {isLoggedIn ? (
            leftOpen ? (
              <>
                <Link href="/feed">
                  <button
                    data-testid="new-post-button"
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-xl transition-colors shadow-sm"
                  >
                    <PlusSquare size={15} />
                    New Post
                  </button>
                </Link>
                <button
                  onClick={handleLogout}
                  data-testid="sign-out-button"
                  className="w-full flex items-center justify-center gap-2 py-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 text-sm rounded-xl transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
                <button
                  onClick={() => setShowBugReport(true)}
                  className="w-full text-center text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
                >
                  Contact & Report
                </button>
              </>
            ) : (
              <>
                <Link href="/feed">
                  <button className="w-full flex items-center justify-center py-2.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl transition-colors" title="New Post">
                    <PlusSquare size={18} />
                  </button>
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center py-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </>
            )
          ) : leftOpen ? (
            <div className="space-y-1.5 px-1">
              <Link href="/login">
                <button className="w-full py-2 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">
                  Sign in
                </button>
              </Link>
              <Link href="/register">
                <button className="w-full py-2 px-4 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  Create account
                </button>
              </Link>
            </div>
          ) : null}
        </div>
      </aside>

      {/* ── RIGHT SIDEBAR (desktop) ────────────────────────────────────────── */}
      {showRightSidebar && (
        <>
          <button
            onClick={() => setRightOpen(o => !o)}
            className="hidden md:flex fixed top-20 z-50 w-6 h-6 bg-sidebar border border-border rounded-full items-center justify-center hover:border-primary/40 hover:text-primary text-muted-foreground shadow-sm"
            style={{
              right: rightOpen ? "308px" : "4px",
              transition: "right 200ms cubic-bezier(0.4,0,0.2,1)",
            }}
            title={rightOpen ? "Collapse panel" : "Expand panel"}
          >
            <ChevronRight
              size={12}
              style={{
                transition: "transform 200ms cubic-bezier(0.4,0,0.2,1)",
                transform: rightOpen ? "rotate(0deg)" : "rotate(180deg)",
              }}
            />
          </button>
          <aside
            className={cn(
              "flex flex-col fixed right-0 top-14 bottom-0 z-40 bg-sidebar overflow-hidden",
              "[transition:width_200ms_cubic-bezier(0.4,0,0.2,1),border-left-width_200ms_cubic-bezier(0.4,0,0.2,1)]",
              rightOpen
                ? "w-0 md:w-80 border-l-0 md:border-l md:border-border"
                : "w-0 border-l-0"
            )}
          >
            <RightSidebar />
          </aside>
        </>
      )}

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <main
        className={cn(
          "pt-14 h-screen overflow-y-auto",
          "pb-28 md:pb-0",
          "[transition:margin-left_200ms_cubic-bezier(0.4,0,0.2,1),margin-right_200ms_cubic-bezier(0.4,0,0.2,1)]",
          leftOpen ? "md:ml-44" : "md:ml-16",
          (showRightSidebar && rightOpen) ? "md:mr-80" : ""
        )}
      >
        {children}
        {/* ── PERSISTENT LEGAL FOOTER ───────────────────────────────────────── */}
        <footer className="mt-8 mb-4 px-4 flex flex-col items-center gap-2 text-xs text-muted-foreground/40">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/terms"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Terms</span></Link>
            <span>·</span>
            <Link href="/privacy"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Privacy</span></Link>
            <span>·</span>
            <Link href="/cookies"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Cookie Policy</span></Link>
            <span>·</span>
            <Link href="/dmca"><span className="hover:text-muted-foreground transition-colors cursor-pointer">DMCA</span></Link>
            <span>·</span>
            <Link href="/guidelines"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Community Guidelines</span></Link>
            <span>·</span>
            <Link href="/contact"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Contact</span></Link>
          </div>
          <p className="text-center">© {new Date().getFullYear()} J.I.M. Investments LLC. All rights reserved. SWEATHEORY is a service of J.I.M. Investments LLC.</p>
        </footer>
      </main>

      {/* ── BOTTOM NAV — shown below md where sidebars are hidden ─────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar/95 backdrop-blur border-t border-border/60 z-50 flex items-center justify-around px-1 py-1" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* Home */}
        <Link href="/">
          <div className={cn("relative flex flex-col items-center p-2.5 rounded-xl transition-colors", isActive("/") ? "text-primary" : "text-muted-foreground")}>
            <Home size={22} />
          </div>
        </Link>
        {/* Explore */}
        <Link href="/explore">
          <div className={cn("relative flex flex-col items-center p-2.5 rounded-xl transition-colors", isActive("/explore") ? "text-primary" : "text-muted-foreground")}>
            <Compass size={22} />
          </div>
        </Link>
        {/* Create */}
        <button onClick={() => setCreateOpen(true)} className="relative flex flex-col items-center p-1">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40 ring-2 ring-primary/30">
            <Plus size={22} className="text-primary-foreground" strokeWidth={2.5} />
          </div>
        </button>
        {/* Notifications (logged in only) */}
        {isLoggedIn && (
          <Link href="/notifications">
            <div className={cn("relative flex flex-col items-center p-2.5 rounded-xl transition-colors", isActive("/notifications") ? "text-primary" : "text-muted-foreground")}>
              <Bell size={22} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
          </Link>
        )}
        {/* More / menu */}
        <button
          onClick={() => setMenuOpen(true)}
          className={cn("relative flex flex-col items-center p-2.5 rounded-xl transition-colors", menuOpen ? "text-primary" : "text-muted-foreground")}
        >
          <Menu size={22} />
          {isLoggedIn && unreadMsgCount > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {unreadMsgCount > 9 ? "9+" : unreadMsgCount}
            </span>
          )}
        </button>
      </nav>

      {/* ── FLOATING CREATE MENU ──────────────────────────────────────────── */}
      <AnimatePresence>
        {createOpen && (
          <>
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              onClick={() => setCreateOpen(false)}
            />
            <m.div
              key="menu"
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-[61] bg-popover border-t border-border rounded-t-3xl px-4 pt-4 pb-8"
              style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {/* Handle */}
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 text-center">Create</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Post",        icon: Radio,        href: "/feed",             color: "text-primary",    bg: "bg-primary/10 border-primary/20" },
                  { label: "Photo",       icon: Image,        href: "/feed?mode=photo",  color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
                  { label: "Video",       icon: Camera,       href: "/feed?mode=video",  color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
                  { label: "Go Live",     icon: Video,        href: "/go-live",          color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
                  { label: "Sell Merch",  icon: ShoppingCart, href: "/merch/create",     color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
                  { label: "Auction",     icon: Gavel,        href: "/create-auction",   color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
                ].map(({ label, icon: Ic, href, color, bg }) => (
                  <button
                    key={label}
                    onClick={() => { setCreateOpen(false); setLocation(href); }}
                    className={cn(
                      "w-full flex flex-col items-center gap-2 py-4 rounded-2xl border transition-colors",
                      bg
                    )}
                  >
                    <Ic size={22} className={color} />
                    <span className="text-xs font-semibold text-foreground">{label}</span>
                  </button>
                ))}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MOBILE HAMBURGER MENU ─────────────────────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <m.div
              key="menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />
            <m.div
              key="menu-drawer"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-[61] bg-popover border-t border-border rounded-t-3xl overflow-y-auto"
              style={{ maxHeight: "85dvh", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {/* Handle */}
              <div className="sticky top-0 bg-popover pt-3 pb-2 flex flex-col items-center gap-1 z-10">
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
              </div>

              {/* Profile card */}
              {isLoggedIn && user ? (
                <div className="px-4 pb-3 border-b border-border/50">
                  <button
                    onClick={() => { setMenuOpen(false); setLocation(`/profile/${(user as any)?.username ?? ""}`); }}
                    className="w-full flex items-center gap-3 py-2 rounded-xl hover:bg-muted/50 transition-colors text-left"
                  >
                    <Avatar user={user as any} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{(user as any)?.displayName ?? (user as any)?.username}</p>
                      <p className="text-xs text-muted-foreground truncate">@{(user as any)?.username}</p>
                    </div>
                    <User size={16} className="text-muted-foreground flex-shrink-0" />
                  </button>
                </div>
              ) : (
                <div className="px-4 pb-3 border-b border-border/50 flex gap-2">
                  <Link href="/login" className="flex-1">
                    <button onClick={() => setMenuOpen(false)} className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
                      Sign in
                    </button>
                  </Link>
                  <Link href="/register" className="flex-1">
                    <button onClick={() => setMenuOpen(false)} className="w-full py-2.5 border border-border text-sm text-muted-foreground rounded-xl hover:bg-muted/50 transition-colors">
                      Create account
                    </button>
                  </Link>
                </div>
              )}

              {/* Nav links */}
              <div className="px-3 py-2 space-y-0.5">
                {[
                  { href: "/feed",          icon: Radio,        label: "Feed",          auth: true  },
                  { href: "/watch",         icon: Tv,           label: "Watch Live",    auth: false },
                  { href: "/messages",      icon: MessageSquare,label: "Messages",      auth: true, badge: true },
                  { href: "/marketplace",   icon: ShoppingBag,  label: "Marketplace",   auth: false },
                  { href: "/meetups",       icon: Calendar,     label: "Meetups",       auth: false },
                  { href: "/wallet",        icon: Wallet,       label: "Wallet",        auth: true  },
                  { href: "/bookmarks",     icon: Bookmark,     label: "Saved",         auth: true  },
                  { href: "/library",       icon: BookOpen,     label: "Library",       auth: true  },
                  { href: "/requests",      icon: ScrollText,   label: "Requests",      auth: true  },
                  { href: "/analytics",     icon: BarChart2,    label: "Analytics",     auth: true  },
                  { href: "/notifications", icon: Bell,         label: "Notifications", auth: true, badge: true },
                  { href: "/pricing",       icon: Zap,          label: "Pricing",       auth: false },
                  { href: "/settings",      icon: Settings,     label: "Settings",      auth: true  },
                ].map(({ href, icon: Icon, label, auth, badge }) => {
                  if (auth && !isLoggedIn) return null;
                  const active = isActive(href);
                  const showBadge = badge && (
                    (label === "Notifications" && unreadCount > 0) ||
                    (label === "Messages" && unreadMsgCount > 0)
                  );
                  const badgeVal = label === "Messages" ? unreadMsgCount : unreadCount;
                  return (
                    <Link key={href} href={href}>
                      <div
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer",
                          active ? "bg-primary/15 text-primary font-semibold" : "text-foreground hover:bg-muted/50"
                        )}
                      >
                        <Icon size={18} className={cn("flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                        <span className="text-sm flex-1">{label}</span>
                        {showBadge && (
                          <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {badgeVal > 9 ? "9+" : badgeVal}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Sign out */}
              {isLoggedIn && (
                <div className="px-3 pt-1 border-t border-border/40 mt-1">
                  <button
                    onClick={() => { setMenuOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={18} className="flex-shrink-0" />
                    Sign out
                  </button>
                </div>
              )}
            </m.div>
          </>
        )}
      </AnimatePresence>

      <BugReportModal open={showBugReport} onClose={() => setShowBugReport(false)} />
    </div>
  );
}
