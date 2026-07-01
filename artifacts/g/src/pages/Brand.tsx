import { motion } from "framer-motion";
import { Download, Copy, Check } from "lucide-react";
import { useState } from "react";

const COLORS = [
  { name: "Neon Purple",  hex: "#9333ea", class: "bg-purple-600" },
  { name: "Cyber Cyan",   hex: "#06b6d4", class: "bg-cyan-500" },
  { name: "Night Blue",   hex: "#1e1b4b", class: "bg-indigo-950" },
  { name: "Drip White",   hex: "#f1f5f9", class: "bg-slate-100" },
  { name: "Deep Black",   hex: "#050505", class: "bg-zinc-950 border border-zinc-700" },
  { name: "Glow Violet",  hex: "#7c3aed", class: "bg-violet-700" },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className="ml-2 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

function AssetCard({ label, file, description, preview = "contain", bg = "bg-zinc-900/60" }: {
  label: string; file: string; description: string; preview?: "contain" | "cover"; bg?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border overflow-hidden bg-zinc-950 group flex flex-col">
      <div className={`flex-1 flex items-center justify-center p-8 ${bg}`} style={{ minHeight: 180 }}>
        <img src={file} alt={label}
          className={`max-h-36 w-full object-${preview} drop-shadow-[0_0_24px_rgba(147,51,234,0.35)]`} />
      </div>
      <div className="p-4 border-t border-border">
        <p className="font-semibold text-sm mb-0.5">{label}</p>
        <p className="text-xs text-muted-foreground leading-snug mb-3">{description}</p>
        <a href={file} download className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
          <Download size={12} /> Download PNG
        </a>
      </div>
    </motion.div>
  );
}

export default function Brand() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-16">

      {/* ── ALL THREE TOGETHER ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">Full Brand Identity</h2>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-zinc-950 p-10 flex flex-col sm:flex-row items-center justify-center gap-8">
          {/* G mark */}
          <img src="/favicon.svg" alt="G mark"
            className="w-28 h-28 rounded-3xl object-cover shadow-2xl shadow-purple-900/40 flex-shrink-0" />
          {/* divider */}
          <div className="hidden sm:block w-px h-24 bg-border" />
          {/* full logo (G + wordmark stacked) */}
          <img src="/favicon.svg" alt="Sweatheory full logo"
            className="h-32 w-auto object-contain drop-shadow-[0_0_32px_rgba(147,51,234,0.4)]" />
          {/* divider */}
          <div className="hidden sm:block w-px h-24 bg-border" />
          {/* wordmark only */}
          <img src="/favicon.svg" alt="Sweatheory wordmark"
            className="h-14 w-auto object-contain drop-shadow-[0_0_20px_rgba(6,182,212,0.35)]" />
        </motion.div>
      </section>

      {/* ── EACH ONE SEPARATE ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">Individual Assets</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <AssetCard
            label="G Mark"
            file="/favicon.svg"
            description="Standalone icon — app icons, avatars, favicons, profile images"
            preview="cover"
            bg="bg-black"
          />
          <AssetCard
            label="Full Logo"
            file="/favicon.svg"
            description="G mark + SWEATHEORY text combined — splash screens, OG images, marketing"
            preview="contain"
            bg="bg-black"
          />
          <AssetCard
            label="Wordmark"
            file="/favicon.svg"
            description="SWEATHEORY text logo — headers, banners, navigation alongside G mark"
            preview="contain"
            bg="bg-black"
          />
        </div>
      </section>

      {/* ── COLORS ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">Brand Colors</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {COLORS.map((c) => (
            <div key={c.hex} className="rounded-2xl border border-border overflow-hidden bg-zinc-900/50">
              <div className={`h-20 w-full ${c.class}`} />
              <div className="p-3">
                <p className="font-semibold text-sm">{c.name}</p>
                <div className="flex items-center mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono">{c.hex}</span>
                  <CopyBtn text={c.hex} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── USAGE ───────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">Usage Guidelines</h2>
        <div className="space-y-3">
          {[
            { do: true,  text: "Use the G mark alone as the app icon, favicon, and avatar on all platforms." },
            { do: true,  text: "Use the full logo (G + SWEATHEORY stacked) on splash screens, OG images, and marketing." },
            { do: true,  text: "Use the wordmark alongside the G mark in navigation headers and banners." },
            { do: false, text: "Don't stretch, rotate, or recolor any logo assets." },
            { do: false, text: "Don't place logos on busy backgrounds without sufficient contrast." },
            { do: false, text: "Don't use an old or unofficial version of the logo." },
          ].map((g, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 bg-zinc-900/40">
              <span className={`mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black ${g.do ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                {g.do ? "✓" : "✗"}
              </span>
              <p className="text-sm text-foreground/90 leading-snug">{g.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TYPOGRAPHY ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">Typography</h2>
        <div className="rounded-2xl border border-border p-6 bg-zinc-900/40 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">UI Font — Inter</p>
            <p className="text-3xl font-black">Sweatheory Creator Platform</p>
            <p className="text-base font-semibold text-muted-foreground mt-1">Live streaming · Creator economy · Community</p>
          </div>
          <div className="pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
            <p><span className="text-foreground font-semibold">Headlines:</span> Inter Black (900), tracking-tight</p>
            <p><span className="text-foreground font-semibold">Body:</span> Inter Regular / Semibold (400 / 600)</p>
            <p><span className="text-foreground font-semibold">Captions:</span> Inter Medium (500), text-muted-foreground</p>
          </div>
        </div>
      </section>

    </div>
  );
}
