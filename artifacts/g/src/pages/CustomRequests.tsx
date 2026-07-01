import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, PenLine, Send, CheckCircle, XCircle, RefreshCw,
  DollarSign, Calendar, MessageSquare, Package, ChevronDown, ChevronUp, X,
  Plus,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Avatar } from "@/components/Avatar";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type RequestTab = "received" | "sent";

interface CustomRequest {
  id: number;
  title: string;
  description: string;
  contentType: string;
  budget: number;
  deadline?: string;
  status: string;
  referenceUrl?: string;
  counterofferPrice?: number;
  creatorNote?: string;
  deliveryUrl?: string;
  deliveryNote?: string;
  isPrivate: boolean;
  platformFee: number;
  createdAt: string;
  updatedAt: string;
  requester?: { id: number; username: string; displayName: string; avatarUrl?: string };
  creator?: { id: number; username: string; displayName: string; avatarUrl?: string };
  messages?: Array<{ id: number; message: string; fileUrl?: string; createdAt: string; sender: { username: string; displayName: string; avatarUrl?: string } }>;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:        { label: "Pending",      cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  accepted:       { label: "Accepted",     cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  rejected:       { label: "Rejected",     cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  counteroffered: { label: "Counteroffer", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  in_progress:    { label: "In Progress",  cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  delivered:      { label: "Delivered",    cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  completed:      { label: "Completed",    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled:      { label: "Cancelled",    cls: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" },
};

const CONTENT_TYPES = ["video", "photo", "message", "shoutout", "music", "art", "other"] as const;

// ─── New Request Modal ────────────────────────────────────────────────────────

function NewRequestModal({
  creatorId,
  creatorName,
  onClose,
  onCreated,
}: {
  creatorId: number;
  creatorName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState<typeof CONTENT_TYPES[number]>("video");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const budgetNum = parseFloat(budget);
    if (!title.trim() || !description.trim() || isNaN(budgetNum) || budgetNum <= 0) return;

    setSubmitting(true);
    try {
      const r = await fetch("/api/custom-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          creatorId,
          title: title.trim(),
          description: description.trim(),
          contentType,
          budget: budgetNum,
          ...(deadline ? { deadline } : {}),
          ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
          isPrivate,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        toast({ title: "Request sent!" });
        onCreated();
        onClose();
      } else {
        toast({ title: data.error ?? "Failed to send request", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 sticky top-0 bg-card z-10">
          <div>
            <h2 className="text-base font-bold">Request Custom Content</h2>
            <p className="text-xs text-muted-foreground">From <span className="text-foreground font-medium">{creatorName}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Title <span className="text-destructive">*</span></label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              required
              placeholder="e.g. Custom birthday shoutout video"
              className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Content type */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Content Type <span className="text-destructive">*</span></label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContentType(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize",
                    contentType === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Description <span className="text-destructive">*</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={2000}
              required
              rows={4}
              placeholder="Describe what you want in detail..."
              className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 text-right">{description.length}/2000</p>
          </div>

          {/* Budget + Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Budget (USD) <span className="text-destructive">*</span></label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="0.01"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  required
                  placeholder="50.00"
                  className="w-full bg-input border border-border rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Deadline (optional)</label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Reference URL */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reference URL (optional)</label>
            <input
              type="url"
              value={referenceUrl}
              onChange={e => setReferenceUrl(e.target.value)}
              placeholder="https://example.com/inspiration"
              className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Privacy toggle */}
          <button
            type="button"
            onClick={() => setIsPrivate(p => !p)}
            className={cn(
              "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-colors",
              isPrivate
                ? "bg-muted/40 border-border/60 text-muted-foreground"
                : "bg-primary/10 border-primary/30 text-primary"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
              !isPrivate ? "bg-primary border-primary" : "border-muted-foreground/40"
            )}>
              {!isPrivate && <CheckCircle size={10} className="text-primary-foreground" />}
            </div>
            Make request visible on my public profile
          </button>

          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim() || !budget}
              className="w-full py-3 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <><RefreshCw size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send Request</>}
            </button>
            <p className="text-[11px] text-center text-muted-foreground/60 mt-2">
              Platform fee applies on completion · Funds held until delivery confirmed
            </p>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  role,
  onUpdate,
}: {
  req: CustomRequest;
  role: RequestTab;
  onUpdate: () => void;
}) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const isCreator = role === "received";
  const [expanded, setExpanded] = useState(false);
  const [replyMsg, setReplyMsg] = useState("");
  const [counterPrice, setCounterPrice] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const [detail, setDetail] = useState<CustomRequest | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function loadDetail() {
    if (detail || loadingDetail) return;
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/custom-requests/${req.id}`, { credentials: "include" });
      if (r.ok) setDetail(await r.json());
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleAction(status: string, extra: Record<string, unknown> = {}) {
    setUpdating(true);
    try {
      const r = await fetch(`/api/custom-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, ...extra }),
      });
      if (r.ok) {
        toast({ title: `Request ${status}` });
        onUpdate();
      } else {
        const err = await r.json();
        toast({ title: err.error ?? "Failed", variant: "destructive" });
      }
    } finally {
      setUpdating(false);
    }
  }

  async function handleReply() {
    if (!replyMsg.trim()) return;
    setUpdating(true);
    try {
      const r = await fetch(`/api/custom-requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: replyMsg }),
      });
      if (r.ok) {
        setReplyMsg("");
        setDetail(null);
        loadDetail();
        toast({ title: "Message sent" });
      }
    } finally {
      setUpdating(false);
    }
  }

  const meta = STATUS_META[req.status] ?? STATUS_META.pending;
  const other = isCreator ? req.requester : req.creator;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-card-border rounded-2xl overflow-hidden"
    >
      {/* Summary row */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {other && (
                <Link href={`/profile/${other.username}`}>
                  <Avatar user={other} size="xs" />
                </Link>
              )}
              <span className="text-sm font-semibold truncate">{req.title}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {other && (
                <Link href={`/profile/${other.username}`}>
                  <span className="hover:text-foreground cursor-pointer">@{other.username}</span>
                </Link>
              )}
              <span>·</span>
              <span className="capitalize">{req.contentType}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", meta.cls)}>{meta.label}</span>
            <button
              onClick={() => { setExpanded(e => !e); if (!expanded) loadDetail(); }}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <DollarSign size={10} />${req.budget.toFixed(2)}
          </span>
          {req.counterofferPrice && (
            <span className="text-amber-400 font-semibold">Counteroffer: ${req.counterofferPrice.toFixed(2)}</span>
          )}
          {req.deadline && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Calendar size={10} />Due {req.deadline}
            </span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border/40"
          >
            <div className="p-4 space-y-4">
              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Request</p>
                <p className="text-sm text-foreground">{req.description}</p>
              </div>

              {req.creatorNote && (
                <div className="p-3 bg-muted/40 rounded-xl">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Creator Note</p>
                  <p className="text-sm">{req.creatorNote}</p>
                </div>
              )}

              {/* Delivery */}
              {req.status === "delivered" && req.deliveryUrl && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-400 mb-1">Content Delivered</p>
                  {req.deliveryNote && <p className="text-sm text-muted-foreground mb-2">{req.deliveryNote}</p>}
                  <a href={req.deliveryUrl} target="_blank" rel="noreferrer"
                    className="text-xs text-primary hover:text-primary/80 font-semibold">
                    Access content →
                  </a>
                </div>
              )}

              {/* Messages */}
              {loadingDetail ? (
                <div className="h-12 bg-muted/40 rounded-xl animate-pulse" />
              ) : detail?.messages && detail.messages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Messages</p>
                  {detail.messages.map(msg => (
                    <div key={msg.id} className="flex gap-2.5">
                      <Avatar user={msg.sender} size="xs" />
                      <div className="flex-1 bg-muted/40 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold">{msg.sender.displayName}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                        </div>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-3">
                {isCreator && req.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction("accepted")}
                      disabled={updating}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold rounded-xl border border-green-500/30 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={14} /> Accept
                    </button>
                    <button
                      onClick={() => handleAction("rejected")}
                      disabled={updating}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold rounded-xl border border-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                )}

                {isCreator && req.status === "pending" && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={counterPrice}
                      onChange={e => setCounterPrice(e.target.value)}
                      placeholder="Counter price ($)"
                      className="flex-1 bg-input border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={() => counterPrice ? handleAction("counteroffered", { counterofferPrice: parseFloat(counterPrice) }) : null}
                      disabled={updating || !counterPrice}
                      className="px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-sm font-semibold rounded-xl border border-amber-500/30 transition-colors disabled:opacity-50"
                    >
                      Counteroffer
                    </button>
                  </div>
                )}

                {isCreator && req.status === "accepted" && (
                  <button
                    onClick={() => handleAction("in_progress")}
                    disabled={updating}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 text-sm font-semibold rounded-xl border border-cyan-500/30 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={14} /> Mark as In Progress
                  </button>
                )}

                {isCreator && (req.status === "in_progress" || req.status === "accepted") && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={deliveryUrl}
                      onChange={e => setDeliveryUrl(e.target.value)}
                      placeholder="Delivery URL (link to content)"
                      className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <input
                      type="text"
                      value={deliveryNote}
                      onChange={e => setDeliveryNote(e.target.value)}
                      placeholder="Note to buyer (optional)"
                      className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={() => deliveryUrl ? handleAction("delivered", { deliveryUrl, deliveryNote }) : null}
                      disabled={updating || !deliveryUrl}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold rounded-xl border border-green-500/30 transition-colors disabled:opacity-50"
                    >
                      <Package size={14} /> Mark as Delivered
                    </button>
                  </div>
                )}

                {!isCreator && req.status === "delivered" && (
                  <button
                    onClick={() => handleAction("completed")}
                    disabled={updating}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-sm font-semibold rounded-xl border border-emerald-500/30 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={14} /> Mark Complete
                  </button>
                )}

                {(req.status === "pending" || req.status === "accepted" || req.status === "in_progress") && !isCreator && (
                  <button
                    onClick={() => handleAction("cancelled")}
                    disabled={updating}
                    className="w-full flex items-center justify-center gap-2 py-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 text-sm font-semibold rounded-xl border border-border/40 transition-colors disabled:opacity-50"
                  >
                    <X size={14} /> Cancel Request
                  </button>
                )}

                {/* Reply box */}
                {req.status !== "cancelled" && req.status !== "completed" && req.status !== "rejected" && (
                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    <input
                      value={replyMsg}
                      onChange={e => setReplyMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                      placeholder="Send a message..."
                      className="flex-1 bg-input border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={handleReply}
                      disabled={updating || !replyMsg.trim()}
                      className="p-2.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomRequests() {
  const isAuthed = useRequireAuth();

  const search = useSearch();
  const params = new URLSearchParams(search);
  const prefilledCreatorId = params.get("creatorId") ? parseInt(params.get("creatorId")!) : null;
  const prefilledCreatorName = params.get("creatorName") ? decodeURIComponent(params.get("creatorName")!) : "";

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [tab, setTab] = useState<RequestTab>("received");
  const [requests, setRequests] = useState<CustomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newModalCreatorId, setNewModalCreatorId] = useState<number | null>(prefilledCreatorId);
  const [newModalCreatorName, setNewModalCreatorName] = useState(prefilledCreatorName);

  // If arriving from a profile with creatorId, switch to sent tab + open form
  useEffect(() => {
    if (prefilledCreatorId) {
      setTab("sent");
      setShowNewModal(true);
    }
  }, []);

  useEffect(() => {
    fetchRequests(tab);
  }, [tab]);

  async function fetchRequests(role: RequestTab) {
    setLoading(true);
    try {
      const r = await fetch(`/api/custom-requests?role=${role}&limit=50`, { credentials: "include" });
      if (r.ok) setRequests(await r.json());
    } finally {
      setLoading(false);
    }
  }

  function openNewRequest() {
    setNewModalCreatorId(null);
    setNewModalCreatorName("");
    setShowNewModal(true);
  }

  if (!isAuthed) return null;
  return (
    <>
      <AnimatePresence>
        {showNewModal && newModalCreatorId && (
          <NewRequestModal
            creatorId={newModalCreatorId}
            creatorName={newModalCreatorName || "Creator"}
            onClose={() => { setShowNewModal(false); setNewModalCreatorId(null); }}
            onCreated={() => fetchRequests("sent")}
          />
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => history.back()} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                <PenLine size={18} className="text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">Custom Requests</h1>
                <p className="text-xs text-muted-foreground">Manage your custom content requests</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl mb-6">
          {(["received", "sent"] as RequestTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "received" ? "Received" : "Sent"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-24 bg-card border border-card-border rounded-2xl animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card border border-card-border rounded-2xl">
            <MessageSquare size={36} className="text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold mb-1">
              {tab === "received" ? "No requests received yet" : "No requests sent yet"}
            </p>
            <p className="text-sm text-muted-foreground mb-5">
              {tab === "received"
                ? "When fans request custom content, it'll appear here."
                : "Visit a creator's profile to request custom content."}
            </p>
            {tab === "sent" && (
              <Link href="/explore">
                <button className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
                  Find creators
                </button>
              </Link>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                role={tab}
                onUpdate={() => fetchRequests(tab)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
