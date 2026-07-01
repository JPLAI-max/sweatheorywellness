import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { uploadToR2Media } from "@/lib/r2Upload";
import {
  ChevronRight, ChevronLeft, Check, Printer, Globe, Truck,
  DollarSign, Package, Tag, Sparkles, Info,
  PlusCircle, X, Search, Loader2, Camera, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Browse Catalog", "Pick Variants", "Upload Design", "Pricing & Details"];

interface Blueprint {
  id: number;
  title: string;
  description: string;
  brand: string;
  model: string;
  images: string[];
}

interface PrintProvider {
  id: number;
  title: string;
  location: { country: string; region: string };
}

interface Variant {
  id: number;
  title: string;
  options: Record<string, number>;
  placeholders: Array<{ position: string }>;
}

interface VariantData {
  id: number;
  variants: Variant[];
  options: Array<{
    name: string;
    type: string;
    values: Array<{ id: number; title: string; colors?: string[] }>;
  }>;
}

interface EnabledVariant {
  id: number;
  color: string;
  size: string;
  priceInCents: number;
}

const CATEGORY_FILTERS = [
  { label: "All", match: "" },
  { label: "T-Shirts", match: "t-shirt" },
  { label: "Hoodies", match: "hoodie" },
  { label: "Hats", match: "hat" },
  { label: "Mugs", match: "mug" },
  { label: "Posters", match: "poster" },
  { label: "Phone Cases", match: "phone" },
  { label: "Tote Bags", match: "tote" },
  { label: "Stickers", match: "sticker" },
];

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={28} className="text-primary animate-spin" />
    </div>
  );
}

export default function CreateMerch() {
  const [, setLocation] = useLocation();
  const isAuthed = useRequireAuth();

  const { user } = useCurrentUser();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Step 0 — catalog
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);

  // Step 1 — provider + variants
  const [providers, setProviders] = useState<PrintProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PrintProvider | null>(null);
  const [variantData, setVariantData] = useState<VariantData | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [enabledVariants, setEnabledVariants] = useState<EnabledVariant[]>([]);

  // Step 2 — design upload
  const designInputRef = useRef<HTMLInputElement>(null);
  const [designUrl, setDesignUrl] = useState("");   // local preview URL only — not sent to API
  const [designKey, setDesignKey] = useState("");    // durable R2 object key — sent to API
  const [designUploadState, setDesignUploadState] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [designUploadProgress, setDesignUploadProgress] = useState(0);

  // Step 3 — pricing + details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [profitPerItem, setProfitPerItem] = useState(8);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isLimitedDrop, setIsLimitedDrop] = useState(false);
  const [stockLimit, setStockLimit] = useState("");

  // Load blueprints on mount
  useEffect(() => {
    setBlueprintsLoading(true);
    fetch("/api/printify/catalog", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setBlueprints(Array.isArray(data) ? data : []);
        setBlueprintsLoading(false);
      })
      .catch(() => {
        setBlueprintsLoading(false);
        setError("Failed to load Printify catalog");
      });
  }, []);

  // Load providers when a blueprint is selected
  useEffect(() => {
    if (!selectedBlueprint) return;
    setProvidersLoading(true);
    setSelectedProvider(null);
    setVariantData(null);
    setEnabledVariants([]);
    fetch(`/api/printify/catalog/${selectedBlueprint.id}/providers`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setProviders(Array.isArray(data) ? data : []);
        setProvidersLoading(false);
      })
      .catch(() => setProvidersLoading(false));
  }, [selectedBlueprint]);

  // Load variants when a provider is selected
  useEffect(() => {
    if (!selectedBlueprint || !selectedProvider) return;
    setVariantsLoading(true);
    setEnabledVariants([]);
    fetch(`/api/printify/catalog/${selectedBlueprint.id}/providers/${selectedProvider.id}/variants`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: VariantData) => {
        setVariantData(data);
        setVariantsLoading(false);
      })
      .catch(() => setVariantsLoading(false));
  }, [selectedProvider]);

  const filteredBlueprints = blueprints.filter((b) => {
    const matchesSearch = !search || b.title.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || b.title.toLowerCase().includes(categoryFilter);
    return matchesSearch && matchesCategory;
  });

  function resolveVariantLabel(variant: Variant): { color: string; size: string } {
    if (!variantData) return { color: "", size: "" };
    const colorOpt = variantData.options.find((o) => o.name === "color" || o.name === "Color");
    const sizeOpt = variantData.options.find((o) => o.name === "size" || o.name === "Size");
    const colorId = variant.options?.color ?? variant.options?.Color;
    const sizeId = variant.options?.size ?? variant.options?.Size;
    const color = colorOpt?.values.find((v) => v.id === colorId)?.title ?? "";
    const size = sizeOpt?.values.find((v) => v.id === sizeId)?.title ?? "";
    return { color, size };
  }

  function toggleVariant(variant: Variant, priceInCents: number) {
    const { color, size } = resolveVariantLabel(variant);
    setEnabledVariants((prev) => {
      const exists = prev.find((v) => v.id === variant.id);
      if (exists) return prev.filter((v) => v.id !== variant.id);
      return [...prev, { id: variant.id, color, size, priceInCents }];
    });
  }

  async function handleDesignFile(file: File) {
    if (file.size > 50 * 1024 * 1024) { setError("Design file too large (max 50 MB)"); return; }
    setDesignUploadState("uploading");
    setDesignUploadProgress(0);
    setError("");
    try {
      const { publicUrl, key } = await uploadToR2Media(file, "merch-designs", (p) => setDesignUploadProgress(p));
      setDesignUrl(publicUrl);  // local preview only
      setDesignKey(key);         // durable key sent to API
      setDesignUploadState("ready");
    } catch {
      setDesignUploadState("error");
    }
  }

  async function handleSubmit() {
    if (!title.trim()) { setError("Title is required"); return; }
    if (!designKey) { setError("Please upload a design"); return; }
    if (enabledVariants.length === 0) { setError("Select at least one variant"); return; }
    if (!selectedBlueprint || !selectedProvider) { setError("No blueprint or provider selected"); return; }
    setError("");
    setSubmitting(true);

    try {
      const body = {
        blueprintId: selectedBlueprint.id,
        printProviderId: selectedProvider.id,
        title: title.trim(),
        description: description || undefined,
        designUrl: designKey,
        enabledVariants,
        basePrice: buyerPrice,
        tags,
        isLimitedDrop,
        stockLimit: isLimitedDrop && stockLimit ? Number(stockLimit) : undefined,
      };

      const res = await fetch("/api/printify/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create product");
      setLocation(`/merch/${data.id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to create product");
      setSubmitting(false);
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function canAdvance() {
    if (step === 0) return !!selectedBlueprint;
    if (step === 1) return enabledVariants.length > 0;
    if (step === 2) return !!designUrl;
    if (step === 3) return title.trim().length >= 3;
    return false;
  }

  const minVariantPriceDollars =
    enabledVariants.length > 0
      ? Math.min(...enabledVariants.map((v) => v.priceInCents)) / 100
      : 0;
  const buyerPrice = Number((minVariantPriceDollars + profitPerItem).toFixed(2));
  // Real payout: (retail − max variant Printify cost − CCBill fee) × 70% creator share
  const maxVariantCostDollars =
    enabledVariants.length > 0 ? Math.max(...enabledVariants.map((v) => v.priceInCents)) / 100 : 0;
  const ccbillFee = Number((0.099 * buyerPrice + 0.35).toFixed(2));
  const margin = Number((buyerPrice - maxVariantCostDollars - ccbillFee).toFixed(2));
  const creatorPayout = Number((Math.max(0, margin) * 0.70).toFixed(2));

  if (!isAuthed) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => step > 0 ? setStep((s) => s - 1) : setLocation("/merch")} className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-black">Create Merch</h1>
          <p className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {STEPS.map((_, i) => (
          <div key={i} className={cn("h-1.5 rounded-full flex-1 transition-colors", i <= step ? "bg-primary" : "bg-muted/40")} />
        ))}
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">{error}</div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.18 }}
        >
          {/* ─── Step 0: Browse Printify Catalog ─── */}
          {step === 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold">Browse Printify Catalog</h2>
                <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">Powered by Printify</span>
              </div>
              <p className="text-sm text-muted-foreground mb-5">Pick a product to print your design on — fulfilled and shipped worldwide by Printify.</p>

              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search products…"
                    className="w-full bg-input border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-thin">
                {CATEGORY_FILTERS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => setCategoryFilter(f.match)}
                    className={cn(
                      "flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors",
                      categoryFilter === f.match ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {blueprintsLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredBlueprints.slice(0, 60).map((bp) => (
                    <button
                      key={bp.id}
                      onClick={() => setSelectedBlueprint(bp)}
                      className={cn(
                        "relative flex flex-col rounded-2xl border-2 overflow-hidden text-left transition-all",
                        selectedBlueprint?.id === bp.id
                          ? "border-primary shadow-lg shadow-primary/10"
                          : "border-border bg-card hover:border-primary/40"
                      )}
                    >
                      <div className="aspect-square bg-muted/30 overflow-hidden">
                        {bp.images?.[0] ? (
                          <img src={bp.images[0]} alt={bp.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={32} className="text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="font-semibold text-xs leading-tight line-clamp-2">{bp.title}</p>
                        {bp.brand && <p className="text-[10px] text-muted-foreground mt-0.5">{bp.brand}</p>}
                      </div>
                      {selectedBlueprint?.id === bp.id && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check size={11} className="text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {selectedBlueprint && (
                <div className="mt-5 p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-3">
                  {selectedBlueprint.images?.[0] && (
                    <img src={selectedBlueprint.images[0]} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{selectedBlueprint.title}</p>
                    <p className="text-xs text-muted-foreground">{selectedBlueprint.brand}</p>
                  </div>
                  <Check size={16} className="text-primary flex-shrink-0" />
                </div>
              )}
            </div>
          )}

          {/* ─── Step 1: Pick Print Provider + Variants ─── */}
          {step === 1 && selectedBlueprint && (
            <div>
              <h2 className="text-lg font-bold mb-1">Choose Variants</h2>
              <p className="text-sm text-muted-foreground mb-5">Select a print partner and pick the sizes & colors you want to offer.</p>

              {/* Print providers */}
              <div className="mb-5">
                <p className="text-sm font-bold mb-3">Print Partner</p>
                {providersLoading ? (
                  <LoadingSpinner />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProvider(p)}
                        className={cn(
                          "p-3 rounded-xl border-2 text-left transition-all",
                          selectedProvider?.id === p.id
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-primary/40"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-sm">{p.title}</p>
                          {selectedProvider?.id === p.id && <Check size={14} className="text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.location?.country}{p.location?.region ? `, ${p.location.region}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Variants */}
              {selectedProvider && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold">Variants <span className="text-muted-foreground font-normal">({enabledVariants.length} selected)</span></p>
                    {variantData && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const all = variantData.variants.map((v) => {
                              const { color, size } = resolveVariantLabel(v);
                              return { id: v.id, color, size, priceInCents: 1299 };
                            });
                            setEnabledVariants(all);
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Select all
                        </button>
                        <button type="button" onClick={() => setEnabledVariants([])} className="text-xs text-muted-foreground hover:underline">Clear</button>
                      </div>
                    )}
                  </div>

                  {variantsLoading ? (
                    <LoadingSpinner />
                  ) : variantData ? (
                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                      {variantData.variants.slice(0, 100).map((v) => {
                        const { color, size } = resolveVariantLabel(v);
                        const isEnabled = enabledVariants.some((e) => e.id === v.id);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => toggleVariant(v, 1299)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-all text-left",
                              isEnabled ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/30"
                            )}
                          >
                            <div className={cn("w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors", isEnabled ? "border-primary bg-primary" : "border-muted-foreground")}>
                              {isEnabled && <Check size={10} className="text-primary-foreground" />}
                            </div>
                            <span className="text-sm font-medium flex-1">{v.title || `${color} / ${size}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">Select a print partner to see variants</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2: Upload Design ─── */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-bold mb-1">Upload Your Design</h2>
              <p className="text-sm text-muted-foreground mb-4">Your artwork is uploaded to Printify and printed on demand for each order.</p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 rounded-xl px-4 py-3 mb-5">
                <div className="flex items-center gap-2">
                  <Printer size={14} className="text-primary flex-shrink-0" />
                  <span className="text-xs font-bold text-primary">Printify Fulfillment</span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">Ships in 5–7 days</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">Ships worldwide</span>
                </div>
              </div>

              <input
                ref={designInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDesignFile(f); }}
              />

              <div
                onClick={() => designInputRef.current?.click()}
                className={cn(
                  "relative border-2 border-dashed rounded-2xl p-6 mb-5 text-center cursor-pointer transition-all",
                  designUploadState === "ready"
                    ? "border-green-500/50 bg-green-500/5"
                    : designUploadState === "error"
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                {designUploadState === "idle" && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-1">
                      <Camera size={22} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold">Tap to upload design</p>
                    <p className="text-xs text-muted-foreground">PNG, SVG, JPEG — transparent background recommended</p>
                    <p className="text-xs text-muted-foreground">Max 50 MB · Printify prints at 300 DPI</p>
                  </div>
                )}
                {designUploadState === "uploading" && (
                  <div className="py-4 space-y-3">
                    <p className="text-sm font-semibold text-primary">Uploading…</p>
                    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden max-w-xs mx-auto">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${designUploadProgress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{designUploadProgress}%</p>
                  </div>
                )}
                {designUploadState === "ready" && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="w-12 h-12 rounded-2xl bg-green-500/15 flex items-center justify-center mb-1">
                      <Check size={22} className="text-green-400" />
                    </div>
                    <p className="text-sm font-semibold text-green-400">Design uploaded</p>
                    {designUrl && (
                      <img src={designUrl} alt="design" className="w-20 h-20 object-contain mt-1 rounded-xl border border-border/40 bg-white/5" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDesignUrl(""); setDesignUploadState("idle"); setDesignUploadProgress(0); }}
                      className="text-xs text-muted-foreground underline mt-1"
                    >
                      Replace file
                    </button>
                  </div>
                )}
                {designUploadState === "error" && (
                  <div className="py-4">
                    <p className="text-sm font-semibold text-destructive">Upload failed</p>
                    <p className="text-xs text-muted-foreground mt-1">Tap to try again</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">— or paste an existing URL —</p>
                <input
                  type="url"
                  value={designUploadState !== "ready" ? designUrl : ""}
                  onChange={(e) => { setDesignUrl(e.target.value); setDesignUploadState("idle"); }}
                  placeholder="https://your-cdn.com/design.png"
                  className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="mt-5 bg-muted/30 border border-border/60 rounded-xl p-4 flex gap-3">
                <Info size={14} className="text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your design file is uploaded to <strong className="text-foreground">Printify</strong> and printed on demand for each order — no inventory, no upfront cost. You must own all rights to artwork you upload.
                </p>
              </div>
            </div>
          )}

          {/* ─── Step 3: Pricing & Details ─── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold mb-1">Pricing & Details</h2>
                <p className="text-sm text-muted-foreground mb-5">Name your product and set your profit margin.</p>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5">Product Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Classic Logo Tee"
                  maxLength={100}
                  className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell buyers about this product..."
                  rows={3}
                  maxLength={1000}
                  className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              {/* Pricing */}
              <div className="bg-card border border-card-border rounded-2xl p-5 space-y-4">
                <p className="text-sm font-bold">Pricing</p>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Your Profit (per item)</label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={profitPerItem}
                      onChange={(e) => setProfitPerItem(Number(e.target.value))}
                      className="w-full bg-input border border-border rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div className="bg-muted/30 rounded-xl px-4 py-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Printify base cost (est.)</span>
                    <span>${minVariantPriceDollars.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Your profit</span>
                    <span className="text-green-400">+${profitPerItem.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Est. payout to you</span>
                    <span className="text-green-400">+${creatorPayout.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border/60">
                    <span>Buyer pays</span>
                    <span className="text-primary">${buyerPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-bold mb-2">Tags <span className="text-muted-foreground font-normal">(optional)</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    placeholder="Add a tag…"
                    className="flex-1 bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button type="button" onClick={addTag} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
                    <PlusCircle size={14} />
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((t) => (
                      <span key={t} className="flex items-center gap-1 bg-muted/40 text-xs px-2.5 py-1 rounded-full border border-border/60">
                        <Tag size={10} className="text-primary" />
                        {t}
                        <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))} className="ml-1 hover:text-destructive"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Limited drop */}
              <div className="flex items-start gap-3 p-4 bg-card border border-card-border rounded-2xl">
                <input
                  type="checkbox"
                  id="limitedDrop"
                  checked={isLimitedDrop}
                  onChange={(e) => setIsLimitedDrop(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label htmlFor="limitedDrop" className="font-semibold text-sm cursor-pointer flex items-center gap-2">
                    <Sparkles size={13} className="text-amber-400" />
                    Limited Drop
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">Cap the number of orders to create urgency</p>
                  {isLimitedDrop && (
                    <input
                      type="number"
                      value={stockLimit}
                      onChange={(e) => setStockLimit(e.target.value)}
                      placeholder="Max orders"
                      min="1"
                      className="mt-2 w-32 bg-input border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-muted/20 border border-border/60 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Product Summary</p>
                <div className="flex items-center gap-3">
                  {selectedBlueprint?.images?.[0] && (
                    <img src={selectedBlueprint.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">{selectedBlueprint?.title}</p>
                    <p className="text-xs text-muted-foreground">{enabledVariants.length} variants · via {selectedProvider?.title}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex-1 py-3.5 border border-border bg-card font-semibold rounded-xl hover:bg-muted/60 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <ChevronLeft size={15} /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => { setError(""); setStep((s) => s + 1); }}
            disabled={!canAdvance()}
            className="flex-1 py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue <ChevronRight size={15} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canAdvance() || submitting}
            className="flex-1 py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : <><Check size={15} /> Publish to Store</>}
          </button>
        )}
      </div>
    </div>
  );
}
