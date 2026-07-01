import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion } from "framer-motion";
import { useUpdateUser, getGetMeQueryKey, getGetUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logout } from "@/lib/auth";
import {
  Settings as SettingsIcon, Save, CheckCircle,
  Shield, Zap, Crown, HardDrive, ArrowRight, TrendingUp, LogOut, Music2, X,
  Upload, ImagePlus, Star, DollarSign, Link2, Globe, Instagram, Twitter, ExternalLink, Copy, Check, Sparkles,
  Plus, Trash2, GripVertical, PenLine, ToggleLeft, ToggleRight,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { uploadToR2Media } from "@/lib/r2Upload";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import {
  type AccountTier, TIERS, TIER_STORAGE_BYTES, TIER_STORAGE_LABEL,
  TIER_FEE, TIER_STREAMING, tierColor, formatBytes,
} from "@/lib/tiers";

const AVATAR_COLORS = [
  "#7c3aed", "#a855f7", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#64748b", "#374151", "#1e293b", "#0f172a",
];

const TIER_ICONS: Record<AccountTier, React.ReactNode> = {
  free:    <Shield size={16} className="text-zinc-400" />,
  creator: <Zap    size={16} className="text-primary" />,
  pro:     <Crown  size={16} className="text-amber-400" />,
  elite:   <Star   size={16} className="text-rose-400" />,
};

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (next.length < 8) { setErr("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setErr("Passwords don't match."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json();
      if (!res.ok) { setErr(body.error ?? "Failed to change password."); return; }
      setDone(true);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => { setDone(false); setOpen(false); }, 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Password</p>
          <p className="text-xs text-muted-foreground mt-0.5">Change your login password</p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(o => !o); setErr(""); setDone(false); }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {open ? "Cancel" : "Change"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {err && <p className="text-xs text-destructive">{err}</p>}
          {done && <p className="text-xs text-green-400">Password updated!</p>}
          <input
            type="password"
            placeholder="Current password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            value={next}
            onChange={e => setNext(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={saving || !current || !next || !confirm}
            className="w-full py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update Password"}
          </button>
        </form>
      )}
    </div>
  );
}

function AccountTypeSwitcher({ currentTier }: { currentTier: AccountTier }) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function switchTo(tier: "free" | "creator") {
    if (!user || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/users/${(user as any).id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountTier: tier }),
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUserQueryKey((user as any).id) });
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const isCreator = currentTier === "creator";

  return (
    <div className="mt-3 px-5 py-4 border-t border-border/60">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Account type</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => !isCreator && switchTo("creator")}
          disabled={saving}
          className={cn(
            "flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center",
            isCreator
              ? "border-primary/50 bg-primary/10 text-primary cursor-default"
              : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          )}
        >
          <Zap size={16} className={isCreator ? "text-primary" : "text-muted-foreground"} />
          <span className="text-xs font-bold">Creator</span>
          {isCreator && <span className="text-[10px] text-primary/70">Current</span>}
        </button>

        <button
          onClick={() => isCreator && switchTo("free")}
          disabled={saving}
          className={cn(
            "flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center",
            !isCreator
              ? "border-zinc-500/50 bg-zinc-500/10 text-zinc-300 cursor-default"
              : "border-border/50 bg-muted/20 text-muted-foreground hover:border-zinc-500/40 hover:bg-zinc-500/5 hover:text-foreground"
          )}
        >
          <Shield size={16} className={!isCreator ? "text-zinc-400" : "text-muted-foreground"} />
          <span className="text-xs font-bold">Viewer</span>
          {!isCreator && <span className="text-[10px] text-zinc-500">Current</span>}
        </button>
      </div>
      {done && (
        <p className="text-xs text-green-400 mt-2 text-center">Account type updated!</p>
      )}
      <p className="text-[11px] text-muted-foreground/60 mt-2 text-center">
        Creator tier is free — just requires identity verification
      </p>
    </div>
  );
}

// ─── Custom link type ────────────────────────────────────────────────────────
interface CreatorLink {
  id: string;
  title: string;
  url: string;
  icon?: string | null;
  isActive: boolean;
  position: number;
  clickCount: number;
}

// ─── Sortable row component ───────────────────────────────────────────────────
function SortableLinkRow({
  link, onDelete, onToggle, onUpdate,
}: {
  link: CreatorLink;
  onDelete: (id: string) => void;
  onToggle: (id: string, val: boolean) => void;
  onUpdate: (id: string, field: "title" | "url", val: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(link.title);
  const [localUrl, setLocalUrl] = useState(link.url);

  function save() {
    if (localTitle.trim()) onUpdate(link.id, "title", localTitle.trim());
    if (localUrl.trim()) onUpdate(link.id, "url", localUrl.trim());
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} className={cn(
      "flex items-center gap-2 px-3 py-2.5 bg-card border border-border/60 rounded-xl",
      !link.isActive && "opacity-50",
    )}>
      <button {...attributes} {...listeners} className="touch-none text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0">
        <GripVertical size={14} />
      </button>

      {editing ? (
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <input
            value={localTitle}
            onChange={e => setLocalTitle(e.target.value)}
            placeholder="Label"
            className="w-full bg-input border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={localUrl}
            onChange={e => setLocalUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-input border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button onClick={save} className="self-end text-[11px] font-semibold text-primary hover:underline">Save</button>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{link.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{link.url}</p>
          {link.clickCount > 0 && (
            <p className="text-[10px] text-muted-foreground/50">{link.clickCount} click{link.clickCount !== 1 ? "s" : ""}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => setEditing(e => !e)} className="text-muted-foreground hover:text-foreground transition-colors">
          <PenLine size={13} />
        </button>
        <button onClick={() => onToggle(link.id, !link.isActive)} className={cn("transition-colors", link.isActive ? "text-primary" : "text-muted-foreground")}>
          {link.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
        <button onClick={() => onDelete(link.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Custom links section ─────────────────────────────────────────────────────
function CustomLinksSection() {
  const [links, setLinks] = useState<CreatorLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function loadLinks() {
    setLoading(true);
    try {
      const res = await fetch("/api/creator-links", { credentials: "include" });
      if (res.ok) setLinks(await res.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { loadLinks(); }, []);

  async function addLink() {
    setAddError("");
    if (!newTitle.trim()) { setAddError("Label is required"); return; }
    if (!newUrl.trim()) { setAddError("URL is required"); return; }
    const url = newUrl.trim().startsWith("http") ? newUrl.trim() : `https://${newUrl.trim()}`;
    setSaving(true);
    try {
      const res = await fetch("/api/creator-links", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), url }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed to add link"); return; }
      setLinks(prev => [...prev, data]);
      setNewTitle(""); setNewUrl(""); setAdding(false);
    } finally { setSaving(false); }
  }

  async function deleteLink(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id));
    await fetch(`/api/creator-links/${id}`, { method: "DELETE", credentials: "include" });
    loadLinks();
  }

  async function toggleLink(id: string, val: boolean) {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, isActive: val } : l));
    await fetch(`/api/creator-links/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: val }),
    });
  }

  async function updateLink(id: string, field: "title" | "url", val: string) {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
    await fetch(`/api/creator-links/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: val }),
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = links.findIndex(l => l.id === active.id);
    const newIndex = links.findIndex(l => l.id === over.id);
    const reordered = arrayMove(links, oldIndex, newIndex).map((l, i) => ({ ...l, position: i }));
    setLinks(reordered);
    await fetch("/api/creator-links/reorder", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map(l => l.id) }),
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Link2 size={13} />
        Custom Links
        <span className="ml-auto text-[10px] font-normal text-muted-foreground/60">{links.length}/20</span>
      </h2>

      {loading ? (
        <div className="h-10 bg-muted/30 rounded-xl animate-pulse" />
      ) : (
        <>
          {links.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={links.map(l => l.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {links.map(link => (
                    <SortableLinkRow
                      key={link.id}
                      link={link}
                      onDelete={deleteLink}
                      onToggle={toggleLink}
                      onUpdate={updateLink}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {links.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground px-1">No custom links yet — add one below.</p>
          )}

          {adding ? (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="space-y-2">
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Label (e.g. My Store)"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <input
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://yoursite.com"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  onKeyDown={e => { if (e.key === "Enter") addLink(); }}
                />
                {addError && <p className="text-xs text-red-400">{addError}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addLink}
                  disabled={saving}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {saving ? "Adding…" : "Add link"}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewTitle(""); setNewUrl(""); setAddError(""); }}
                  className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : links.length < 20 && (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border/60 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/20 transition-colors"
            >
              <Plus size={14} />
              Add a link
            </button>
          )}

          <p className="text-xs text-muted-foreground px-1">
            Drag to reorder · Toggle to show/hide · Max 20 links. These appear on your link-in-bio page.
          </p>
        </>
      )}
    </section>
  );
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const isAuthed = useRequireAuth();

  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [avatarKey, setAvatarKey] = useState("");
  const [bannerKey, setBannerKey] = useState("");

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Avatar must be under 10 MB"); return; }
    setAvatarUploading(true);
    try {
      const { publicUrl, key } = await uploadToR2Media(file, "avatars");
      setAvatarKey(key);
      setForm(f => ({ ...f, avatarUrl: publicUrl }));
    } catch (err: any) {
      if (err?.storageExceeded) { setStorageError(true); setError("Storage full — upgrade your plan to upload more"); }
      else { setStorageError(false); setError("Avatar upload failed"); }
    }
    finally { setAvatarUploading(false); }
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError("Audio file must be under 50 MB"); return; }
    setAudioUploading(true);
    try {
      const { publicUrl } = await uploadToR2Media(file, "audio");
      setForm(f => ({ ...f, profileSongUrl: publicUrl }));
    } catch (err: any) {
      if (err?.storageExceeded) { setStorageError(true); setError("Storage full — upgrade your plan to upload more"); }
      else { setStorageError(false); setError("Audio upload failed"); }
    }
    finally { setAudioUploading(false); e.target.value = ""; }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("Banner must be under 20 MB"); return; }
    setBannerUploading(true);
    try {
      const { publicUrl, key } = await uploadToR2Media(file, "banners");
      setBannerKey(key);
      setForm(f => ({ ...f, bannerUrl: publicUrl }));
    } catch (err: any) {
      if (err?.storageExceeded) { setStorageError(true); setError("Storage full — upgrade your plan to upload more"); }
      else { setStorageError(false); setError("Banner upload failed"); }
    }
    finally { setBannerUploading(false); }
  }

  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
    bannerUrl: "",
    avatarColor: "",
    profileSongUrl: "",
    profileSongTitle: "",
    profileSongArtist: "",
    websiteUrl: "",
    instagramUsername: "",
    tiktokUsername: "",
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const [bioSuggesting, setBioSuggesting] = useState(false);

  const [subPrice, setSubPrice] = useState<string>("");
  const [subPriceLoading, setSubPriceLoading] = useState(false);
  const [subPriceSaved, setSubPriceSaved] = useState(false);
  const [subPriceError, setSubPriceError] = useState("");

  useEffect(() => {
    if (user) {
      setForm({
        displayName: (user as any).displayName ?? "",
        bio: (user as any).bio ?? "",
        avatarUrl: (user as any).avatarUrl ?? "",
        bannerUrl: (user as any).bannerUrl ?? "",
        avatarColor: (user as any).avatarColor ?? "",
        profileSongUrl: (user as any).profileSongUrl ?? "",
        profileSongTitle: (user as any).profileSongTitle ?? "",
        profileSongArtist: (user as any).profileSongArtist ?? "",
        websiteUrl: (user as any).websiteUrl ?? "",
        instagramUsername: (user as any).instagramUsername ?? "",
        tiktokUsername: (user as any).tiktokUsername ?? "",
      });
      const sp = (user as any).subscriptionPrice;
      setSubPrice(sp != null ? String(sp) : "");
    }
  }, [user]);

  async function saveSubPrice() {
    if (!user) return;
    setSubPriceError("");
    setSubPriceLoading(true);
    try {
      const price = subPrice === "" ? null : parseFloat(subPrice);
      if (price !== null && (isNaN(price) || price < 2.99 || price > 99.99)) {
        setSubPriceError("Price must be between $2.99 and $99.99");
        return;
      }
      const res = await fetch(`/api/users/${(user as any).id}/subscription-price`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSubPriceError(d.error ?? "Failed to save");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setSubPriceSaved(true);
      setTimeout(() => setSubPriceSaved(false), 3000);
    } finally {
      setSubPriceLoading(false);
    }
  }

  const update = useUpdateUser({
    mutation: {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        if (user) queryClient.invalidateQueries({ queryKey: getGetUserQueryKey((user as any).id) });
      },
      onError: (e: any) => setError(e?.data?.error || "Failed to update"),
    }
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!user) return;
    const userId = (user as any).id;
    update.mutate({
      userId,
      data: {
        displayName: form.displayName || undefined,
        bio: form.bio || undefined,
        avatarUrl: avatarKey || undefined,
        bannerUrl: bannerKey || undefined,
        profileSongUrl: form.profileSongUrl || undefined,
        profileSongTitle: form.profileSongTitle || undefined,
        profileSongArtist: form.profileSongArtist || undefined,
        avatarColor: form.avatarColor || undefined,
        websiteUrl: form.websiteUrl || undefined,
        instagramUsername: form.instagramUsername || undefined,
        tiktokUsername: form.tiktokUsername || undefined,
      } as any
    });
  }

  type StringFormKey = { [K in keyof typeof form]: (typeof form)[K] extends string ? K : never }[keyof typeof form];
  function field(name: StringFormKey) {
    return {
      value: form[name] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [name]: e.target.value })),
    };
  }

  const currentTier = (user?.accountTier ?? "free") as AccountTier;
  const storageUsed = ((user as any)?.storageUsedBytes ?? 0) as number;
  const storageLimit = TIER_STORAGE_BYTES[currentTier];
  const usagePct = storageLimit > 0 ? Math.min(100, (storageUsed / storageLimit) * 100) : 0;
  const tierDef = TIERS.find(t => t.id === currentTier)!;

  if (!isAuthed) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20 md:pb-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold flex items-center gap-2 mb-8">
          <SettingsIcon size={20} className="text-primary" />
          Settings
        </h1>

        {/* Account & Storage */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4">Account</h2>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {/* Tier header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  currentTier === "pro" ? "bg-amber-500/15" : currentTier === "creator" ? "bg-primary/15" : "bg-muted"
                )}>
                  {TIER_ICONS[currentTier]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-black", tierColor(currentTier))}>
                      {tierDef.name} Plan
                    </span>
                    {currentTier === "free" && (
                      <span className="text-[10px] text-zinc-500 bg-zinc-800/60 border border-zinc-700/50 px-1.5 py-0.5 rounded font-medium">
                        Free
                      </span>
                    )}
                    {currentTier === "creator" && (
                      <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded font-bold">
                        Creator
                      </span>
                    )}
                    {currentTier === "pro" && (
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold">
                        Pro
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tierDef.streaming} streaming · {tierDef.fee} transaction fee
                  </p>
                </div>
              </div>
              {currentTier !== "pro" && (
                <Link href="/pricing">
                  <button className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-lg">
                    <TrendingUp size={12} />
                    Upgrade
                  </button>
                </Link>
              )}
            </div>

            {/* Storage usage */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HardDrive size={14} className="text-muted-foreground" />
                  Storage
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {formatBytes(storageUsed)} / {TIER_STORAGE_LABEL[currentTier]}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={cn(
                    "h-full rounded-full",
                    usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-amber-500" : "bg-primary"
                  )}
                />
              </div>
              {usagePct > 80 && (
                <div className="flex items-center justify-between mt-2">
                  <span className={cn("text-xs", usagePct > 90 ? "text-red-400" : "text-amber-400")}>
                    {usagePct > 90 ? "Almost full — upgrade soon" : "Running low on storage"}
                  </span>
                  {currentTier !== "pro" && (
                    <Link href="/pricing">
                      <button className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                        Get more <ArrowRight size={10} />
                      </button>
                    </Link>
                  )}
                </div>
              )}
              {usagePct <= 80 && (
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  {TIER_STORAGE_LABEL[currentTier]} total · {formatBytes(storageLimit - storageUsed)} available
                </p>
              )}
            </div>

            {/* Tier limits quick view */}
            <div className="px-5 pb-4 grid grid-cols-3 gap-2">
              {[
                { label: "Max upload", val: currentTier === "elite" ? "10 GB" : currentTier === "pro" ? "5 GB" : currentTier === "creator" ? "1 GB" : "250 MB" },
                { label: "Streaming", val: TIER_STREAMING[currentTier] },
                { label: "Fee", val: TIER_FEE[currentTier] },
              ].map(item => (
                <div key={item.label} className="bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 text-center">
                  <div className="text-xs font-bold">{item.val}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Account type switcher — free ↔ creator */}
          {(currentTier === "free" || currentTier === "creator") && (
            <AccountTypeSwitcher currentTier={currentTier} />
          )}

          {/* Change password */}
          <ChangePassword />

        </section>

        {/* Profile form */}
        <form onSubmit={submit} className="space-y-6" data-testid="settings-form">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">
              {error}
              {storageError && (
                <a href="/pricing" className="ml-2 underline font-semibold hover:opacity-80 transition-opacity">View plans →</a>
              )}
            </div>
          )}

          {saved && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-lg flex items-center gap-2"
            >
              <CheckCircle size={14} />
              Profile updated successfully!
            </motion.div>
          )}

          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Profile</h2>

            <div>
              <label className="block text-sm font-medium mb-1.5">Display name</label>
              <input
                type="text"
                data-testid="settings-displayname"
                placeholder="Your name"
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                {...field("displayName")}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium">Bio</label>
                <button
                  type="button"
                  disabled={bioSuggesting}
                  onClick={async () => {
                    setBioSuggesting(true);
                    try {
                      const res = await fetch("/api/users/suggest-bio", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ interests: (user as any)?.interests ?? [] }),
                      });
                      if (res.ok) {
                        const { bio } = await res.json() as { bio: string };
                        setForm(f => ({ ...f, bio }));
                      }
                    } finally {
                      setBioSuggesting(false);
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {bioSuggesting ? (
                    <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {bioSuggesting ? "Generating…" : "Suggest bio"}
                </button>
              </div>
              <textarea
                rows={3}
                data-testid="settings-bio"
                placeholder="Tell the world about yourself..."
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                {...field("bio")}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Media</h2>

            {/* Avatar upload */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Profile Photo</label>
              <input id="settings-avatar-input" ref={avatarInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarUpload} data-testid="settings-avatar" />
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center flex-shrink-0">
                  {form.avatarUrl
                    ? <img src={form.avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    : <ImagePlus size={20} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 space-y-2">
                  <label
                    htmlFor="settings-avatar-input"
                    className={`inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg text-sm font-medium transition-colors cursor-pointer ${avatarUploading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <Upload size={14} />
                    {avatarUploading ? "Uploading…" : "Upload photo"}
                  </label>
                  <p className="text-xs text-muted-foreground">JPG, PNG, WebP — max 10 MB</p>
                </div>
              </div>
            </div>

            {/* Avatar background color */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Avatar Background Color
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(shown when no photo is set)</span>
              </label>
              <div className="flex items-start gap-4">
                {/* Live preview */}
                <div className="flex-shrink-0">
                  <Avatar
                    user={{
                      displayName: (user as any)?.displayName,
                      username: (user as any)?.username,
                      avatarUrl: undefined,
                      avatarColor: form.avatarColor || null,
                    }}
                    size="lg"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  {/* Preset swatches */}
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        onClick={() => setForm(f => ({ ...f, avatarColor: color }))}
                        className={cn(
                          "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/50",
                          form.avatarColor === color ? "border-white scale-110" : "border-transparent"
                        )}
                        style={{ background: color }}
                      />
                    ))}
                    {/* Custom color input */}
                    <label
                      title="Custom color"
                      className="w-7 h-7 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden"
                      style={form.avatarColor && !AVATAR_COLORS.includes(form.avatarColor) ? { background: form.avatarColor, borderStyle: "solid", borderColor: "white" } : {}}
                    >
                      <input
                        type="color"
                        className="sr-only"
                        value={form.avatarColor && form.avatarColor.startsWith("#") ? form.avatarColor : "#7c3aed"}
                        onChange={e => setForm(f => ({ ...f, avatarColor: e.target.value }))}
                      />
                      {(!form.avatarColor || AVATAR_COLORS.includes(form.avatarColor)) && (
                        <span className="text-[10px] text-muted-foreground leading-none select-none">+</span>
                      )}
                    </label>
                  </div>
                  {/* Reset to auto */}
                  {form.avatarColor && (
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, avatarColor: "" }))}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <X size={10} />
                      Reset to auto color
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Banner upload */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Cover Banner</label>
              <input id="settings-banner-input" ref={bannerInputRef} type="file" accept="image/*" className="sr-only" onChange={handleBannerUpload} data-testid="settings-banner" />
              <div className="space-y-2">
                <div className="w-full h-24 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center relative">
                  {form.bannerUrl
                    ? <img src={form.bannerUrl} alt="Banner" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    : <ImagePlus size={24} className="text-muted-foreground" />}
                </div>
                <label
                  htmlFor="settings-banner-input"
                  className={`inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg text-sm font-medium transition-colors cursor-pointer ${bannerUploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Upload size={14} />
                  {bannerUploading ? "Uploading…" : "Upload banner"}
                </label>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP — max 20 MB · Recommended 1500×500</p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Music2 size={13} />
              Profile Song
            </h2>
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
              <div className="px-5 py-4 space-y-4">
                {/* Hidden audio file input */}
                <input
                  id="settings-audio-input"
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*,.mp3,.ogg,.wav,.flac,.aac,.m4a"
                  className="sr-only"
                  onChange={handleAudioUpload}
                />

                <div>
                  <label className="block text-sm font-medium mb-1.5">Profile Song</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="url"
                        placeholder="https://example.com/my-song.mp3"
                        className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 pr-10"
                        value={form.profileSongUrl}
                        onChange={e => setForm(f => ({ ...f, profileSongUrl: e.target.value }))}
                      />
                      {form.profileSongUrl && (
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, profileSongUrl: "", profileSongTitle: "", profileSongArtist: "" }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Clear song"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <label
                      htmlFor="settings-audio-input"
                      className={`inline-flex items-center gap-1.5 px-3 py-2.5 bg-muted hover:bg-muted/80 border border-border rounded-lg text-sm font-medium transition-colors cursor-pointer flex-shrink-0 ${audioUploading ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <Upload size={14} />
                      {audioUploading ? "Uploading…" : "Upload"}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">Upload an MP3/WAV from your device, or paste a direct URL — max 50 MB</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Song title</label>
                    <input
                      type="text"
                      placeholder="e.g. Bad Guy"
                      className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={form.profileSongTitle}
                      onChange={e => setForm(f => ({ ...f, profileSongTitle: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Artist</label>
                    <input
                      type="text"
                      placeholder="e.g. Billie Eilish"
                      className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={form.profileSongArtist}
                      onChange={e => setForm(f => ({ ...f, profileSongArtist: e.target.value }))}
                    />
                  </div>
                </div>

                {form.profileSongUrl && (
                  <div className="flex items-center gap-2 text-xs text-primary bg-primary/8 border border-primary/20 rounded-lg px-3 py-2">
                    <Music2 size={12} />
                    Song set — visitors will hear this when they open your profile.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── LINK-IN-BIO ───────────────────────────────────────────── */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Link2 size={13} />
              Link-in-Bio & Social Links
            </h2>

            {/* Your page URL */}
            {user && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">Your shareable page</p>
                  <p className="text-sm font-mono font-bold text-primary truncate">
                    sweatheory.com/@{(user as any).username}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/@${(user as any).username}`);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold text-primary hover:bg-primary/20 transition-colors flex-shrink-0"
                >
                  {linkCopied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {linkCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}

            {/* X — auto-filled from connected account */}
            {(user as any)?.xUsername && (
              <div className="flex items-center gap-3 bg-sky-500/5 border border-sky-500/20 rounded-2xl px-4 py-3">
                <Twitter size={15} className="text-sky-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">X / Twitter</p>
                  <p className="text-sm font-mono text-sky-400 truncate">@{(user as any).xUsername}</p>
                </div>
                <span className="text-[10px] font-bold bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-full flex-shrink-0">Connected</span>
              </div>
            )}

            {/* Reddit — auto-filled from connected account */}
            {(user as any)?.redditUsername && (
              <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/20 rounded-2xl px-4 py-3">
                <ExternalLink size={15} className="text-orange-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">Reddit</p>
                  <p className="text-sm font-mono text-orange-400 truncate">u/{(user as any).redditUsername}</p>
                </div>
                <span className="text-[10px] font-bold bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full flex-shrink-0">Connected</span>
              </div>
            )}

            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60">

              {/* Website */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Globe size={14} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <label htmlFor="social-website" className="block text-xs font-semibold text-muted-foreground mb-1">Website URL</label>
                  <input
                    id="social-website"
                    type="text"
                    value={form.websiteUrl}
                    onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
                    placeholder="https://yoursite.com"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Instagram — smart URL→handle parsing */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Instagram size={14} className="text-pink-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <label htmlFor="social-instagram" className="block text-xs font-semibold text-muted-foreground mb-1">Instagram</label>
                  <input
                    id="social-instagram"
                    type="text"
                    value={form.instagramUsername}
                    placeholder="username or instagram.com/you"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    onChange={e => {
                      const raw = e.target.value;
                      const match = raw.match(/(?:instagram\.com\/|^@?)([A-Za-z0-9_.]+)/);
                      setForm(f => ({ ...f, instagramUsername: match ? match[1] : raw }));
                    }}
                  />
                  {form.instagramUsername && (
                    <p className="text-[11px] text-pink-400/70 mt-0.5">→ instagram.com/{form.instagramUsername}</p>
                  )}
                </div>
              </div>

              {/* TikTok — smart URL→handle parsing */}
              <div className="flex items-center gap-3 px-4 py-3">
                <ExternalLink size={14} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <label htmlFor="social-tiktok" className="block text-xs font-semibold text-muted-foreground mb-1">TikTok</label>
                  <input
                    id="social-tiktok"
                    type="text"
                    value={form.tiktokUsername}
                    placeholder="username or tiktok.com/@you"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    onChange={e => {
                      const raw = e.target.value;
                      const match = raw.match(/(?:tiktok\.com\/@?|^@?)([A-Za-z0-9_.]+)/);
                      setForm(f => ({ ...f, tiktokUsername: match ? match[1] : raw }));
                    }}
                  />
                  {form.tiktokUsername && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">→ tiktok.com/@{form.tiktokUsername}</p>
                  )}
                </div>
              </div>

            </div>
            <p className="text-xs text-muted-foreground px-1">
              Paste a full URL or just your username — links auto-format. These show on your link-in-bio at <span className="text-primary font-mono">/@{(user as any)?.username}</span>
            </p>
          </section>

          {/* ── CUSTOM LINKS ─────────────────────────────────────────────── */}
          <CustomLinksSection />

          {/* Subscription pricing */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Star size={13} />
              Subscriptions
            </h2>
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Set a monthly subscription price for your profile. Fans pay this from their wallet — you keep 80% after the 20% platform fee. Leave blank to disable subscriptions.
                </p>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="number"
                      min="2.99"
                      max="99.99"
                      step="0.01"
                      placeholder="e.g. 9.99"
                      value={subPrice}
                      onChange={e => setSubPrice(e.target.value)}
                      className="w-full bg-input border border-border rounded-lg pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground flex-shrink-0">/ month</span>
                  <button
                    type="button"
                    onClick={saveSubPrice}
                    disabled={subPriceLoading}
                    className="flex-shrink-0 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {subPriceLoading ? "Saving…" : subPriceSaved ? "✓ Saved" : "Save"}
                  </button>
                </div>
                {subPriceError && (
                  <p className="text-xs text-destructive">{subPriceError}</p>
                )}
                {subPrice && !subPriceError && (() => {
                  const tier = (user as any)?.accountTier ?? "free";
                  const feeRate = tier === "pro" ? 0.05 : tier === "creator" ? 0.10 : 0.15;
                  const pct = Math.round(feeRate * 100);
                  const earn = (parseFloat(subPrice) * (1 - feeRate)).toFixed(2);
                  return (
                    <p className="text-xs text-muted-foreground">
                      You earn <span className="text-emerald-400 font-semibold">${earn}/mo</span> per subscriber after {pct}% platform fee.{" "}
                      {tier !== "pro" && <a href="/pricing" className="text-primary hover:underline">Upgrade to reduce fees.</a>}
                    </p>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* ── ADD SWEATHEORY TO YOUR LINK-IN-BIO ─────────────────────────── */}
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Link2 size={13} />
              Add SWEATHEORY to your link-in-bio
            </h2>
            <p className="text-xs text-muted-foreground px-1">
              Already on Linktree, Beacons, or another platform? Add your SWEATHEORY page to your existing link list in minutes.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: "Linktree", path: "/help/linktree", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20 hover:bg-green-500/20" },
                { name: "Beacons", path: "/help/beacons", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20" },
                { name: "AllMyLinks", path: "/help/allmylinks", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20" },
                { name: "Stan.store", path: "/help/stan", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20" },
              ].map(p => (
                <Link key={p.path} href={p.path}>
                  <a className={cn(
                    "flex items-center justify-center gap-2 py-3 border rounded-xl text-sm font-semibold transition-colors",
                    p.bg, p.color,
                  )}>
                    {p.name}
                    <ArrowRight size={12} />
                  </a>
                </Link>
              ))}
            </div>
          </section>

          <button
            type="submit"
            disabled={update.isPending || !user}
            data-testid="settings-save"
            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {update.isPending ? "Saving..." : "Save changes"}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-border/60">
          <button
            onClick={async () => { await logout(); setLocation("/login"); }}
            data-testid="sign-out-button"
            className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-border/60 hover:border-red-500/30 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </motion.div>
    </div>
  );
}
