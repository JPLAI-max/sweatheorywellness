import { useState } from "react";
import { Calendar, MapPin, Video, Users, Plus, Clock, X, Loader2, Globe, CheckCircle2, XCircle, Heart, MessageCircle, Trash2, ChevronDown, Pencil, Ban } from "lucide-react";
import { useListMeetups, useCreateMeetup, useRsvpMeetup, useCancelRsvp } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { format, isPast } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isLoggedIn } from "@/lib/auth";
import { Link } from "wouter";
import { useCategories } from "@/lib/categories";
const TYPES = [
  { label: "All", value: "" },
  { label: "In-Person", value: "in-person" },
  { label: "Virtual", value: "virtual" },
];

function MeetupCard({ meetup, onRsvpChange, onEdit }: { meetup: any; onRsvpChange: () => void; onEdit: (m: any) => void }) {
  const { user } = useCurrentUser();
  const rsvp = useRsvpMeetup();
  const cancelRsvp = useCancelRsvp();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const hasRsvped = optimistic !== null ? optimistic : meetup.hasRsvped;
  const isPastEvent = isPast(new Date(meetup.date));
  const isCancelled = meetup.status === "cancelled";
  const isFull = meetup.maxAttendees && meetup.rsvpCount >= meetup.maxAttendees && !hasRsvped;

  const handleRsvp = async () => {
    if (!user) return;
    const next = !hasRsvped;
    setOptimistic(next);
    try {
      if (next) {
        await rsvp.mutateAsync({ meetupId: meetup.id });
      } else {
        await cancelRsvp.mutateAsync({ meetupId: meetup.id });
      }
      onRsvpChange();
    } catch {
      setOptimistic(!next);
    }
  };

  const dateObj = new Date(meetup.date);
  const dayStr = format(dateObj, "EEE");
  const dayNum = format(dateObj, "d");
  const monthStr = format(dateObj, "MMM");
  const timeStr = format(dateObj, "h:mm a");

  return (
    <div className={cn(
      "bg-card border rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-primary/5 transition-all group",
      isCancelled ? "border-red-500/20 opacity-70" : "border-border/60 hover:border-border"
    )}>
      {/* Cover */}
      <div className="relative h-40 bg-gradient-to-br from-orange-900/30 via-zinc-900 to-violet-900/20 overflow-hidden">
        {meetup.coverImageUrl ? (
          <img src={meetup.coverImageUrl} alt={meetup.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-80 transition-opacity" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Calendar size={40} className="text-orange-400/20" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          {meetup.isVirtual ? (
            <span className="flex items-center gap-1 bg-blue-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
              <Video size={9} /> Virtual
            </span>
          ) : (
            <span className="flex items-center gap-1 bg-orange-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
              <MapPin size={9} /> In-Person
            </span>
          )}
          {isCancelled && (
            <span className="bg-red-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">Cancelled</span>
          )}
        </div>
        {meetup.category && (
          <div className="absolute top-3 right-3 bg-black/50 text-zinc-300 text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
            {meetup.category}
          </div>
        )}
      </div>

      <div className="p-4 flex gap-3">
        {/* Date block */}
        <div className="flex-shrink-0 w-12 text-center bg-muted/40 border border-border/60 rounded-xl py-1.5">
          <p className="text-[10px] font-bold text-orange-400 uppercase">{monthStr}</p>
          <p className="text-xl font-black text-foreground leading-none">{dayNum}</p>
          <p className="text-[9px] text-muted-foreground uppercase">{dayStr}</p>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground text-sm leading-snug mb-1 truncate">{meetup.title}</h3>

          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Clock size={10} />
            <span>{timeStr}</span>
            {meetup.location && !meetup.isVirtual && (
              <>
                <span className="mx-1">·</span>
                <MapPin size={10} />
                <span className="truncate">{meetup.location}</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {meetup.host?.avatarUrl ? (
                <img src={meetup.host.avatarUrl} alt={meetup.host.displayName} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[9px] font-bold">
                  {meetup.host?.displayName?.[0] ?? "?"}
                </div>
              )}
              <span className="text-xs text-muted-foreground truncate max-w-[90px]">{meetup.host?.displayName}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users size={9} />
                {meetup.rsvpCount}
                {meetup.maxAttendees ? `/${meetup.maxAttendees}` : ""}
              </span>
            </div>

            {user && !isPastEvent && !isCancelled && meetup.hostId !== user.id && (
              <button
                onClick={handleRsvp}
                disabled={rsvp.isPending || cancelRsvp.isPending || (isFull && !hasRsvped)}
                className={cn(
                  "text-xs font-bold px-3 py-1 rounded-lg transition-all disabled:opacity-40",
                  hasRsvped
                    ? "bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30"
                    : isFull
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-orange-600 hover:bg-orange-500 text-white"
                )}
              >
                {rsvp.isPending || cancelRsvp.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : hasRsvped ? "Going ✓" : isFull ? "Full" : "RSVP"}
              </button>
            )}
            {meetup.hostId === user?.id && (
              <div className="flex items-center gap-1">
                {!isCancelled && (
                  <>
                    <button
                      onClick={() => onEdit(meetup)}
                      className="flex items-center gap-1 text-[10px] font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-2 py-1 rounded-lg transition-colors"
                    >
                      <Pencil size={10} /> Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Cancel this meetup? Attendees will see it as cancelled.")) return;
                        setCancelling(true);
                        try {
                          await apiFetch(`/api/meetups/${meetup.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
                          onRsvpChange();
                        } finally { setCancelling(false); }
                      }}
                      disabled={cancelling}
                      className="flex items-center gap-1 text-[10px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {cancelling ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />} Cancel
                    </button>
                  </>
                )}
                {isCancelled && (
                  <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">Your event</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateMeetupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const create = useCreateMeetup();
  const { categories: CATEGORIES } = useCategories();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "18:00",
    meetupType: "in-person" as "in-person" | "virtual" | "both",
    location: "",
    virtualUrl: "",
    category: "",
    maxAttendees: "",
    coverImageUrl: "",
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim()) { setErr("Title is required."); return; }
    if (!form.date) { setErr("Date is required."); return; }
    try {
      const dateTime = new Date(`${form.date}T${form.time}`).toISOString();
      const isVirtual = form.meetupType !== "in-person";
      await create.mutateAsync({
        data: {
          title: form.title.trim(),
          description: form.description || undefined,
          date: dateTime,
          isVirtual,
          location: form.meetupType !== "virtual" ? (form.location || undefined) : undefined,
          virtualUrl: form.meetupType !== "in-person" ? (form.virtualUrl || undefined) : undefined,
          category: form.category || undefined,
          maxAttendees: form.maxAttendees ? Number(form.maxAttendees) : undefined,
          coverImageUrl: form.coverImageUrl || undefined,
        },
      });
      setDone(true);
      onCreated();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} className="w-full max-w-lg bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-orange-400" />
            <h2 className="text-base font-bold text-foreground">Create Meetup</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {err && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{err}</p>}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="What's your meetup about?" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Date *</label>
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Time</label>
              <input type="time" value={form.time} onChange={e => set("time", e.target.value)} className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          </div>

          <div className="flex gap-2">
            {([
              { value: "in-person", label: "In-Person", icon: <MapPin size={13} />, cls: "bg-orange-600/15 border-orange-500/40 text-orange-400" },
              { value: "virtual",   label: "Virtual",   icon: <Video size={13} />, cls: "bg-blue-600/15 border-blue-500/40 text-blue-400" },
              { value: "both",      label: "Both",      icon: <Globe size={13} />, cls: "bg-violet-600/15 border-violet-500/40 text-violet-400" },
            ] as const).map(opt => (
              <button key={opt.value} type="button" onClick={() => set("meetupType", opt.value)}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all",
                  form.meetupType === opt.value ? opt.cls : "bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground")}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {form.meetupType !== "virtual" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Location</label>
              <input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Venue, address, or city" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          )}

          {form.meetupType !== "in-person" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Meeting Link {form.meetupType === "both" && <span className="text-muted-foreground normal-case font-normal">(for virtual attendees)</span>}</label>
              <input value={form.virtualUrl} onChange={e => set("virtualUrl", e.target.value)} placeholder="https://meet.google.com/ or https://zoom.us/..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
              <p className="text-xs text-muted-foreground mt-1">Paste a Zoom, Google Meet, or any video call link.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors">
                <option value="">No category</option>
                {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Max Attendees</label>
              <input type="number" value={form.maxAttendees} onChange={e => set("maxAttendees", e.target.value)} placeholder="Unlimited" min="1" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="Tell people what to expect..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Cover Image URL</label>
            <input value={form.coverImageUrl} onChange={e => set("coverImageUrl", e.target.value)} placeholder="https://..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/60">
          {done ? (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
              <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-400">Meetup created!</p>
                <p className="text-xs text-muted-foreground">Your event is now live and visible to others.</p>
              </div>
              <button type="button" onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">Close</button>
            </div>
          ) : (
            <button type="submit" disabled={create.isPending} className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
              Create Meetup
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function EditMeetupModal({ meetup, onClose, onSaved }: { meetup: any; onClose: () => void; onSaved: () => void }) {
  const { categories: CATEGORIES } = useCategories();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const dateObj = new Date(meetup.date);
  const [form, setForm] = useState({
    title: meetup.title ?? "",
    description: meetup.description ?? "",
    date: format(dateObj, "yyyy-MM-dd"),
    time: format(dateObj, "HH:mm"),
    meetupType: meetup.isVirtual && meetup.location ? "both" : meetup.isVirtual ? "virtual" : "in-person" as "in-person" | "virtual" | "both",
    location: meetup.location ?? "",
    virtualUrl: meetup.virtualUrl ?? "",
    category: meetup.category ?? "",
    maxAttendees: meetup.maxAttendees ? String(meetup.maxAttendees) : "",
    coverImageUrl: meetup.coverImageUrl ?? "",
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim()) { setErr("Title is required."); return; }
    if (!form.date) { setErr("Date is required."); return; }
    setSaving(true);
    try {
      const dateTime = new Date(`${form.date}T${form.time}`).toISOString();
      const isVirtual = form.meetupType !== "in-person";
      await apiFetch(`/api/meetups/${meetup.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description || undefined,
          date: dateTime,
          isVirtual,
          location: form.meetupType !== "virtual" ? (form.location || undefined) : undefined,
          virtualUrl: form.meetupType !== "in-person" ? (form.virtualUrl || undefined) : undefined,
          category: form.category || undefined,
          maxAttendees: form.maxAttendees ? Number(form.maxAttendees) : undefined,
          coverImageUrl: form.coverImageUrl || undefined,
        }),
      });
      setDone(true);
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} className="w-full max-w-lg bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Edit Meetup</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {err && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{err}</p>}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="What's your meetup about?" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Date *</label>
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Time</label>
              <input type="time" value={form.time} onChange={e => set("time", e.target.value)} className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          </div>

          <div className="flex gap-2">
            {([
              { value: "in-person", label: "In-Person", icon: <MapPin size={13} />, cls: "bg-orange-600/15 border-orange-500/40 text-orange-400" },
              { value: "virtual",   label: "Virtual",   icon: <Video size={13} />, cls: "bg-blue-600/15 border-blue-500/40 text-blue-400" },
              { value: "both",      label: "Both",      icon: <Globe size={13} />, cls: "bg-violet-600/15 border-violet-500/40 text-violet-400" },
            ] as const).map(opt => (
              <button key={opt.value} type="button" onClick={() => set("meetupType", opt.value)}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all",
                  form.meetupType === opt.value ? opt.cls : "bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground")}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {form.meetupType !== "virtual" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Location</label>
              <input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Venue, address, or city" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          )}

          {form.meetupType !== "in-person" && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Meeting Link</label>
              <input value={form.virtualUrl} onChange={e => set("virtualUrl", e.target.value)} placeholder="https://meet.google.com/ or https://zoom.us/..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors">
                <option value="">No category</option>
                {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Max Attendees</label>
              <input type="number" value={form.maxAttendees} onChange={e => set("maxAttendees", e.target.value)} placeholder="Unlimited" min="1" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="Tell people what to expect..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Cover Image URL</label>
            <input value={form.coverImageUrl} onChange={e => set("coverImageUrl", e.target.value)} placeholder="https://..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/60">
          {done ? (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
              <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-400">Meetup updated!</p>
                <p className="text-xs text-muted-foreground">Your changes are now live.</p>
              </div>
              <button type="button" onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">Close</button>
            </div>
          ) : (
            <button type="submit" disabled={saving} className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
              Save Changes
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const LOOKING_FOR_OPTIONS = [
  { value: "friendship", label: "Friendship", color: "blue" },
  { value: "collab", label: "Collaboration", color: "violet" },
  { value: "dating", label: "Dating", color: "rose" },
  { value: "networking", label: "Networking", color: "teal" },
  { value: "mentorship", label: "Mentorship", color: "amber" },
  { value: "activity", label: "Activity Partner", color: "green" },
];

const LF_COLORS: Record<string, string> = {
  friendship: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  collab: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  dating: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  networking: "bg-teal-500/15 text-teal-400 border-teal-500/25",
  mentorship: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  activity: "bg-green-500/15 text-green-400 border-green-500/25",
};

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function PersonalCard({ personal, onDelete }: { personal: any; onDelete: () => void }) {
  const { user } = useCurrentUser();
  const [expanded, setExpanded] = useState(false);
  const tags: string[] = personal.lookingFor ?? [];

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden hover:border-border hover:shadow-lg hover:shadow-primary/5 transition-all">
      <div className="p-4 flex gap-3">
        <Link href={`/profile/${personal.author?.username}`}>
          {personal.photoUrl ? (
            <img src={personal.photoUrl} alt={personal.author?.displayName} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 border border-border/60" />
          ) : personal.author?.avatarUrl ? (
            <img src={personal.author.avatarUrl} alt={personal.author?.displayName} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 border border-border/60" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-black text-xl flex-shrink-0 border border-border/60">
              {personal.author?.displayName?.[0] ?? "?"}
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <Link href={`/profile/${personal.author?.username}`}>
                <p className="font-bold text-sm text-foreground truncate hover:underline">{personal.author?.displayName}</p>
              </Link>
              <p className="text-xs text-muted-foreground">
                {[personal.age && `${personal.age}`, personal.gender, personal.location].filter(Boolean).join(" · ")}
              </p>
            </div>
            {personal.isOwn && (
              <button onClick={onDelete} className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            )}
          </div>

          <p className="text-sm font-semibold text-foreground mb-2 leading-snug">{personal.headline}</p>

          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map(tag => {
              const opt = LOOKING_FOR_OPTIONS.find(o => o.value === tag);
              return (
                <span key={tag} className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", LF_COLORS[tag] ?? "bg-muted/40 text-muted-foreground border-border/60")}>
                  {opt?.label ?? tag}
                </span>
              );
            })}
          </div>

          {personal.description.length > 120 && !expanded ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {personal.description.slice(0, 120)}…
              <button onClick={() => setExpanded(true)} className="ml-1 text-primary hover:underline">more</button>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">{personal.description}</p>
          )}

          {user && !personal.isOwn && (
            <div className="mt-3">
              <Link href={`/messages/${personal.author?.username}`}>
                <button className="flex items-center gap-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-3 py-1.5 rounded-lg transition-colors">
                  <MessageCircle size={12} />
                  Say hi
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatePersonalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    headline: "",
    description: "",
    age: "",
    gender: "",
    lookingFor: [] as string[],
    location: "",
    photoUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleLF = (v: string) => set("lookingFor", form.lookingFor.includes(v) ? form.lookingFor.filter(x => x !== v) : [...form.lookingFor, v]);

  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!form.headline || !form.description) return;
    setSaving(true);
    setErr("");
    try {
      await apiFetch("/api/meetups/personals", {
        method: "POST",
        body: JSON.stringify({
          headline: form.headline,
          description: form.description,
          age: form.age ? Number(form.age) : undefined,
          gender: form.gender || undefined,
          lookingFor: form.lookingFor,
          location: form.location || undefined,
          photoUrl: form.photoUrl || undefined,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["personals"] });
      setDone(true);
      onCreated();
    } catch (e: any) {
      setErr("Something went wrong, please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Heart size={18} className="text-rose-400" />
            <h2 className="text-base font-bold">Post a Personal</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <form id="post-personal-form" onSubmit={e => { e.preventDefault(); handleSubmit(); }} className="overflow-y-auto flex-1 p-5 space-y-4">
          {err && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{err}</p>}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Headline *</label>
            <input value={form.headline} onChange={e => set("headline", e.target.value)} maxLength={120} placeholder="e.g. Looking for a music collab partner" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">About you *</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4} maxLength={1000} placeholder="Tell people about yourself and what you're looking for..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Looking for</label>
            <div className="flex flex-wrap gap-2">
              {LOOKING_FOR_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => toggleLF(opt.value)} className={cn("text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all", form.lookingFor.includes(opt.value) ? cn(LF_COLORS[opt.value], "border-2") : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground")}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Age</label>
              <input type="number" value={form.age} onChange={e => set("age", e.target.value)} min="18" max="99" placeholder="Optional" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Gender</label>
              <select value={form.gender} onChange={e => set("gender", e.target.value)} className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors">
                <option value="">Prefer not to say</option>
                <option>Man</option>
                <option>Woman</option>
                <option>Non-binary</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Location</label>
            <input value={form.location} onChange={e => set("location", e.target.value)} placeholder="City, region, or 'Remote'" className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Photo URL (optional)</label>
            <input value={form.photoUrl} onChange={e => set("photoUrl", e.target.value)} placeholder="https://..." className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>
        </form>

        <div className="px-5 py-4 border-t border-border/60">
          {done ? (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
              <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-400">Personal posted!</p>
                <p className="text-xs text-muted-foreground">Others can now find and connect with you.</p>
              </div>
              <button onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">Close</button>
            </div>
          ) : (
            <button type="submit" form="post-personal-form" disabled={!form.headline || !form.description || saving} className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Heart size={16} />}
              Post Personal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonalsTab() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["personals", filter],
    queryFn: () => apiFetch(`/api/meetups/personals${filter ? `?lookingFor=${filter}` : ""}`),
  });

  const deletePersonal = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/meetups/personals/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personals"] }),
  });

  const personals: any[] = data?.personals ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-wrap">
          <button onClick={() => setFilter("")} className={cn("flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all", filter === "" ? "bg-rose-600 text-white border-rose-600" : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground")}>
            All
          </button>
          {LOOKING_FOR_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setFilter(filter === opt.value ? "" : opt.value)} className={cn("flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all", filter === opt.value ? cn(LF_COLORS[opt.value], "border-2") : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground")}>
              {opt.label}
            </button>
          ))}
        </div>
        {user && (
          <button onClick={() => setShowCreate(true)} className="flex-shrink-0 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors ml-2">
            <Plus size={13} />
            Post
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card animate-pulse p-4 flex gap-3">
              <div className="w-14 h-14 rounded-2xl bg-muted/40 flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-muted/60 rounded w-2/3" />
                <div className="h-3 bg-muted/40 rounded w-full" />
                <div className="h-3 bg-muted/40 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : personals.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
            <Heart size={28} className="text-rose-400/50" />
          </div>
          <p className="text-foreground font-semibold mb-1">No personals yet</p>
          <p className="text-muted-foreground text-sm mb-4">Be the first to post a personal and connect with the community</p>
          {user && (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
              <Plus size={14} /> Post Personal
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {personals.map((p: any) => (
            <PersonalCard key={p.id} personal={p} onDelete={() => deletePersonal.mutate(p.id)} />
          ))}
        </div>
      )}

      {showCreate && <CreatePersonalModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  );
}

export default function Meetups() {
  const { user } = useCurrentUser();
  const { categories: baseCategories } = useCategories();
  const CATEGORIES = ["All", ...baseCategories];
  const [tab, setTab] = useState<"browse" | "mine" | "personals">("browse");
  const [category, setCategory] = useState("All");
  const [type, setType] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingMeetup, setEditingMeetup] = useState<any>(null);
  const [key, setKey] = useState(0);

  const params: any = { limit: 50 };
  if (category !== "All") params.category = category;
  if (type) params.type = type;

  const { data, isLoading, refetch } = useListMeetups(params);
  const allMeetups: any[] = (data as any)?.meetups ?? [];

  const myMeetups = allMeetups.filter((m: any) => user && (m.hostId === user.id || m.hasRsvped));
  const displayed = tab === "mine" ? myMeetups : allMeetups;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24 xl:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
              <Calendar size={16} className="text-orange-400" />
            </div>
            <h1 className="text-2xl font-black text-foreground">Meetups</h1>
            {allMeetups.length > 0 && (
              <span className="bg-orange-500/15 border border-orange-500/20 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">
                {allMeetups.length}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">In-person and virtual events from creators you love</p>
        </div>
        {user && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={14} />
            <span className="hidden sm:block">Create</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 border border-border/60 rounded-xl p-1 mb-4 w-fit">
        <button onClick={() => setTab("browse")} className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold transition-all", tab === "browse" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          Browse
        </button>
        {user && (
          <button onClick={() => setTab("mine")} className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold transition-all", tab === "mine" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            My Events
          </button>
        )}
        <button onClick={() => setTab("personals")} className={cn("flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all", tab === "personals" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Heart size={12} className={tab === "personals" ? "text-rose-400" : ""} />
          Personals
        </button>
      </div>

      {/* Personals tab */}
      {tab === "personals" && <PersonalsTab />}

      {/* Filters (meetup tabs only) */}
      {tab !== "personals" && tab === "browse" && (
        <div className="space-y-3 mb-5">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TYPES.map(({ label, value }) => (
              <button key={value} onClick={() => setType(value)} className={cn("flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all", type === value ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border")}>
                {value === "virtual" ? <Globe size={11} /> : value === "in-person" ? <MapPin size={11} /> : null}
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)} className={cn("flex-shrink-0 px-3 py-1 rounded-xl text-xs font-semibold border transition-all", category === c ? "bg-orange-600 text-white border-orange-600" : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border")}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Meetup content */}
      {tab !== "personals" && (isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card animate-pulse overflow-hidden">
              <div className="h-40 bg-muted/40" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-muted/60 rounded w-3/4" />
                <div className="h-3 bg-muted/40 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center mx-auto mb-4">
            <Calendar size={28} className="text-muted-foreground/40" />
          </div>
          <p className="text-foreground font-semibold mb-1">
            {tab === "mine" ? "No events yet" : "No meetups yet"}
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            {tab === "mine" ? "RSVP to events or create your own" : "Be the first to host a meetup!"}
          </p>
          {user && tab === "browse" && (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
              <Plus size={14} /> Create Meetup
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayed.map((meetup: any) => (
            <MeetupCard key={meetup.id} meetup={meetup} onRsvpChange={() => refetch()} onEdit={m => setEditingMeetup(m)} />
          ))}
        </div>
      ))}

      {showCreate && <CreateMeetupModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
      {editingMeetup && (
        <EditMeetupModal
          meetup={editingMeetup}
          onClose={() => setEditingMeetup(null)}
          onSaved={() => { setEditingMeetup(null); refetch(); }}
        />
      )}
    </div>
  );
}
