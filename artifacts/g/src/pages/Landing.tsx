import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Activity, Users, Radio, PenLine, ArrowRight } from "lucide-react";

const PILLARS = [
  { icon: Activity, label: "Sweat Yourself®", desc: "Document and track your personal wellness journey" },
  { icon: Users, label: "Sweat Squad®", desc: "Join accountability groups and wellness circles" },
  { icon: Radio, label: "Sweat Live™", desc: "Wellness classes, coaching & real conversations" },
  { icon: PenLine, label: "Journals", desc: "Reflect privately or share anonymously" },
];

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-base font-semibold tracking-[0.1em] text-foreground select-none">SWEATHEORY WELLNESS</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocation("/login")}
            className="px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => setLocation("/register")}
            className="px-4 py-1.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
          >
            Join free
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="max-w-2xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-4 py-1.5 rounded-full mb-8 uppercase tracking-widest">
            Think. Talk. Do.
          </div>

          <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter text-foreground mb-6 leading-[0.9]">
            Find What<br />
            <span className="text-primary">Works.</span>
          </h1>

          <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto mb-10 leading-relaxed">
            Document your journey. Learn from others. Share what works.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setLocation("/register")}
              className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground font-black text-sm rounded-2xl hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
            >
              Start Your Journey
              <ArrowRight size={15} />
            </button>
            <button
              onClick={() => setLocation("/feed")}
              className="w-full sm:w-auto px-8 py-3.5 bg-muted/60 border border-border/60 text-foreground font-semibold text-sm rounded-2xl hover:bg-muted/80 transition-colors"
            >
              Explore Social Sweat
            </button>
          </div>
        </motion.div>

        {/* Platform pillars */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
          className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl w-full"
        >
          {PILLARS.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="bg-card border border-border/60 rounded-2xl p-4 text-left hover:border-border transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Icon size={16} className="text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground mb-0.5">{label}</p>
              <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Mission */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 text-xs text-muted-foreground/60 font-serif tracking-widest uppercase"
        >
          Real People. Real Progress. Find What Works.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground/50"
        >
          <Link href="/terms"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Terms</span></Link>
          <Link href="/privacy"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Privacy</span></Link>
          <Link href="/guidelines"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Sweatiquette</span></Link>
          <Link href="/contact"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Contact & Report</span></Link>
          <Link href="/legal"><span className="hover:text-muted-foreground transition-colors cursor-pointer">Legal</span></Link>
        </motion.div>
      </main>
    </div>
  );
}
