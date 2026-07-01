import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useRegister } from "@workspace/api-client-react";
import { setLoggedIn, saveAccount } from "@/lib/auth";
import { Eye, EyeOff, UserPlus, Check, ChevronRight, Video, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCategories } from "@/lib/categories";

export default function Register() {
  const [, setLocation] = useLocation();
  const { categories } = useCategories();
  const INTERESTS = categories.map(c => ({ value: c, label: c }));
  const [form, setForm] = useState({ username: "", email: "", password: "", displayName: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [step, setStep] = useState<"register" | "interests" | "creator">("register");
  const [selected, setSelected] = useState<string[]>([]);
  const [newUserId, setNewUserId] = useState<number | null>(null);

  const register = useRegister({
    mutation: {
      onSuccess: async (data: any) => {
        if (data?.user) {
          if (data.devToken) localStorage.setItem("g_dev_token", data.devToken);
          setLoggedIn(data.user.id);
          setNewUserId(data.user.id);
          saveAccount({ id: data.user.id, username: data.user.username, displayName: data.user.displayName ?? data.user.username, avatarUrl: data.user.avatarUrl });
          setStep("interests");
        }
      },
      onError: (err: any) => {
        setError(err?.data?.error || "Registration failed");
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!tosAccepted) { setError("You must accept the Terms of Service to create an account."); return; }
    register.mutate({ data: form });
  }

  function field(name: keyof typeof form) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [name]: e.target.value })),
    };
  }

  function toggleInterest(v: string) {
    setSelected(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
  }

  async function finishInterests() {
    if (selected.length > 0) {
      const userId = typeof window !== "undefined" ? localStorage.getItem("g_current_user_id") : null;
      if (userId) {
        try {
          await fetch(`/api/users/${userId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ interests: selected }),
          });
        } catch {}
      }
      try { localStorage.setItem("gc_interests", JSON.stringify(selected)); } catch {}
    }
    setStep("creator");
  }

  async function finishCreator(wantsCreator: boolean) {
    if (wantsCreator && newUserId) {
      try {
        await fetch(`/api/users/${newUserId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountTier: "creator" }),
        });
      } catch {}
    }
    setLocation("/feed");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-background">
      <AnimatePresence mode="wait">
        {step === "register" ? (
          <motion.div
            key="register"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm"
          >
            <div className="text-center mb-8">
              <div className="flex flex-col items-center gap-2">
                <img src="/sweatheory-logo.png" alt="Sweatheory" className="w-24 h-24 rounded-3xl object-cover flex-shrink-0 shadow-md" />
              </div>
              <h1 className="text-xl font-bold mt-3 mb-1">Create your account</h1>
              <p className="text-sm text-muted-foreground">Join thousands of creators</p>
            </div>

            <form onSubmit={submit} className="space-y-4" data-testid="register-form">
              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Display name</label>
                <input
                  type="text"
                  required
                  data-testid="displayname-input"
                  placeholder="Your name"
                  autoComplete="name"
                  className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  {...field("displayName")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <input
                    type="text"
                    required
                    minLength={3}
                    data-testid="username-input"
                    placeholder="yourhandle"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full bg-input border border-border rounded-lg pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    {...field("username")}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  data-testid="email-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                  {...field("email")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    data-testid="password-input"
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                    className="w-full bg-input border border-border rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    {...field("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-muted/40 border border-border/50 rounded-xl px-4 py-3">
                <input
                  id="tos"
                  type="checkbox"
                  checked={tosAccepted}
                  onChange={e => setTosAccepted(e.target.checked)}
                  className="mt-0.5 accent-primary flex-shrink-0 cursor-pointer"
                />
                <label htmlFor="tos" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  I agree to the{" "}
                  <Link href="/terms"><span className="text-primary hover:underline">Terms of Service</span></Link>,{" "}
                  <Link href="/privacy"><span className="text-primary hover:underline">Privacy Policy</span></Link>,
                  and{" "}
                  <Link href="/guidelines"><span className="text-primary hover:underline">Sweatiquette</span></Link>.
                </label>
              </div>

              <button
                type="submit"
                disabled={register.isPending || !tosAccepted}
                data-testid="register-submit"
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UserPlus size={16} />
                {register.isPending ? "Creating account..." : "Create account"}
              </button>
            </form>

            <div className="mt-5">
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-xs text-muted-foreground/70 font-medium">or sign up with</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a
                  href="/api/auth/reddit"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-orange-500/10 hover:border-orange-500/40 transition-colors text-sm font-semibold text-foreground"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-orange-400 flex-shrink-0">
                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                  </svg>
                  Reddit
                </a>
                <a
                  href="/api/auth/x"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-sky-500/10 hover:border-sky-500/40 transition-colors text-sm font-semibold text-foreground"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-sky-400 flex-shrink-0">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X / Twitter
                </a>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-5">
              Already have an account?{" "}
              <Link href="/login">
                <span className="text-primary hover:underline cursor-pointer font-medium">Sign in</span>
              </Link>
            </p>
          </motion.div>
        ) : step === "interests" ? (
          <motion.div
            key="interests"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="w-full max-w-sm"
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✨</span>
              </div>
              <h1 className="text-xl font-bold mb-1">What are you into?</h1>
              <p className="text-sm text-muted-foreground">Pick your interests to personalize your feed</p>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {INTERESTS.map(int => (
                <button
                  key={int.value}
                  type="button"
                  onClick={() => toggleInterest(int.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all",
                    selected.includes(int.value)
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {selected.includes(int.value) && <Check size={12} />}
                  {int.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <button
                onClick={finishInterests}
                disabled={selected.length === 0}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ChevronRight size={16} />
                {selected.length === 0 ? "Select at least one" : `Continue with ${selected.length} interest${selected.length > 1 ? "s" : ""}`}
              </button>
              <button
                onClick={() => setStep("creator")}
                className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        ) : step === "creator" ? (
          <motion.div
            key="creator"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="w-full max-w-sm"
          >
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎬</span>
              </div>
              <h1 className="text-xl font-bold mb-1">How will you use Sweatheory?</h1>
              <p className="text-sm text-muted-foreground">You can always change this in your account settings</p>
            </div>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => finishCreator(true)}
                className="w-full flex items-start gap-4 p-4 rounded-2xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Video size={18} className="text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm mb-0.5">I'm a Creator</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">Post content, go live, and earn from your fans</p>
                </div>
              </button>

              <button
                onClick={() => finishCreator(false)}
                className="w-full flex items-start gap-4 p-4 rounded-2xl border-2 border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Users size={18} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="font-bold text-sm mb-0.5">I'm a Viewer</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">Browse content, follow creators, and support your favourites</p>
                </div>
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
