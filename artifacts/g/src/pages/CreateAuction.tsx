import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Gavel, ArrowLeft, Upload, Plus, X, AlertCircle, Clock, DollarSign, Tag, Package } from "lucide-react";
import { useCreateAuction } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { useCategories } from "@/lib/categories";

const ITEM_TYPES = [
  { value: "digital", label: "Digital", desc: "Download, file, or digital access" },
  { value: "experience", label: "Experience", desc: "Meet & greet, custom session" },
  { value: "collectible", label: "Collectible", desc: "Rare or limited edition item" },
  { value: "commission", label: "Commission", desc: "Custom content created for buyer" },
  { value: "ticket", label: "Ticket", desc: "Event or stream access ticket" },
];

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like New" },
  { value: "used", label: "Used" },
  { value: "collectible", label: "Collectible" },
];

const DURATIONS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "12 hours", hours: 12 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

export default function CreateAuction() {
  const { user } = useCurrentUser();
  const [, navigate] = useLocation();
  const { categories: CATEGORIES } = useCategories();
  const createAuction = useCreateAuction();

  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    category: "",
    itemType: "digital" as string,
    condition: "new" as string,
    startingBid: "",
    reservePrice: "",
    buyNowPrice: "",
    shippingInfo: "",
  });
  const [durationHours, setDurationHours] = useState(24);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState("");

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags(prev => [...prev, t]);
      setTagInput("");
    }
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.title.trim()) { setError("Title is required"); return; }
    if (!form.startingBid || isNaN(Number(form.startingBid)) || Number(form.startingBid) <= 0) {
      setError("Enter a valid starting bid"); return;
    }

    const endTime = new Date(Date.now() + durationHours * 3600000).toISOString();

    try {
      const data: any = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        category: form.category || undefined,
        itemType: form.itemType as any,
        condition: form.condition as any,
        startingBid: Number(form.startingBid),
        reservePrice: form.reservePrice ? Number(form.reservePrice) : undefined,
        buyNowPrice: form.buyNowPrice ? Number(form.buyNowPrice) : undefined,
        shippingInfo: form.shippingInfo.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        endTime,
      };

      const auction = await createAuction.mutateAsync({ data });
      navigate(`/auction/${(auction as any).id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to create auction");
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Sign in to list an item</p>
        <Link href="/login"><button className="mt-3 text-sm text-primary hover:underline">Sign in</button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/marketplace">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={14} /> Back to Auction House
        </button>
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
          <Gavel size={17} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black">Create Auction</h1>
          <p className="text-xs text-muted-foreground">List an item for the community to bid on</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Item Type */}
        <section>
          <label className="text-sm font-semibold mb-3 block">Item Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ITEM_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => set("itemType", t.value)}
                className={cn(
                  "text-left p-3 rounded-xl border transition-colors",
                  form.itemType === t.value
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/40 bg-card hover:border-border/80",
                )}
              >
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <Package size={11} className="text-muted-foreground/60 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground/70">
              Selling merch?{" "}
              <Link href="/merch/create" className="text-primary hover:underline font-semibold">
                Create it in the SWEATHEORY shop →
              </Link>
            </p>
          </div>
        </section>

        {/* Basic Info */}
        <section className="space-y-3">
          <label className="text-sm font-semibold">Item Details</label>
          <input
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder="Title *"
            required
            className="w-full px-4 py-3 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50"
          />
          <textarea
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Description (what's included, condition details, etc.)"
            rows={4}
            className="w-full px-4 py-3 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50 resize-none"
          />
          <input
            value={form.imageUrl}
            onChange={e => set("imageUrl", e.target.value)}
            placeholder="Image URL (optional)"
            className="w-full px-4 py-3 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50"
          />
        </section>

        {/* Category + Condition */}
        <section className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Category</label>
            <select
              value={form.category}
              onChange={e => set("category", e.target.value)}
              className="w-full px-3 py-2.5 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="">None</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Condition</label>
            <select
              value={form.condition}
              onChange={e => set("condition", e.target.value)}
              className="w-full px-3 py-2.5 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50"
            >
              {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </section>

        {/* Tags */}
        <section>
          <label className="text-sm font-semibold mb-2 block">Tags</label>
          <div className="flex gap-2 mb-2">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
              placeholder="Add tag and press Enter"
              className="flex-1 px-3 py-2 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50"
            />
            <button type="button" onClick={addTag} className="px-3 py-2 bg-primary/15 text-primary rounded-xl hover:bg-primary/25 transition-colors">
              <Plus size={14} />
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs px-2 py-1 bg-muted/40 rounded-full">
                  #{t}
                  <button type="button" onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Pricing */}
        <section className="space-y-3">
          <label className="text-sm font-semibold flex items-center gap-2"><DollarSign size={14} className="text-primary" />Pricing</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Starting Bid *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input type="number" min="0.01" step="0.01" value={form.startingBid} onChange={e => set("startingBid", e.target.value)} placeholder="0.00" required className="w-full pl-7 pr-3 py-2.5 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Reserve Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input type="number" min="0.01" step="0.01" value={form.reservePrice} onChange={e => set("reservePrice", e.target.value)} placeholder="Optional" className="w-full pl-7 pr-3 py-2.5 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Buy Now Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input type="number" min="0.01" step="0.01" value={form.buyNowPrice} onChange={e => set("buyNowPrice", e.target.value)} placeholder="Optional" className="w-full pl-7 pr-3 py-2.5 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50" />
              </div>
            </div>
          </div>
        </section>

        {/* Duration */}
        <section>
          <label className="text-sm font-semibold flex items-center gap-2 mb-3"><Clock size={14} className="text-primary" />Auction Duration</label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {DURATIONS.map(d => (
              <button
                key={d.hours}
                type="button"
                onClick={() => setDurationHours(d.hours)}
                className={cn(
                  "py-2.5 text-xs font-semibold rounded-xl border transition-colors",
                  durationHours === d.hours ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Ends: {new Date(Date.now() + durationHours * 3600000).toLocaleString()}
          </p>
        </section>

        {/* Shipping (physical only) */}
        {form.itemType === "physical" && (
          <section>
            <label className="text-sm font-semibold flex items-center gap-2 mb-2"><Package size={14} className="text-primary" />Shipping Info</label>
            <textarea
              value={form.shippingInfo}
              onChange={e => set("shippingInfo", e.target.value)}
              placeholder="Shipping methods, estimated delivery, region restrictions..."
              rows={2}
              className="w-full px-4 py-3 bg-card border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50 resize-none"
            />
          </section>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Link href="/marketplace" className="flex-1">
            <button type="button" className="w-full py-3 border border-border/60 rounded-2xl text-sm font-semibold hover:bg-muted/30 transition-colors">
              Cancel
            </button>
          </Link>
          <button
            type="submit"
            disabled={createAuction.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground font-bold rounded-2xl hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-lg shadow-primary/20"
          >
            <Gavel size={15} />
            {createAuction.isPending ? "Listing..." : "List Auction"}
          </button>
        </div>
      </form>
    </div>
  );
}
