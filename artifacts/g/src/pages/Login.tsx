import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useLogin } from "@workspace/api-client-react";
import { setLoggedIn, saveAccount } from "@/lib/auth";
import { Eye, EyeOff, LogIn, ShieldCheck, KeyRound } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const [requires2fa, setRequires2fa] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const login = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        if (data?.requires2fa && data?.tempToken) {
          setTempToken(data.tempToken);
          setRequires2fa(true);
          setError("");
          return;
        }
        if (data?.user) {
          if (data.devToken) localStorage.setItem("g_dev_token", data.devToken);
          setLoggedIn(data.user.id);
          saveAccount({ id: data.user.id, username: data.user.username, displayName: data.user.displayName ?? data.user.username, avatarUrl: data.user.avatarUrl });
          setLocation("/feed");
        }
      },
      onError: (err: any) => {
        setError(err?.data?.error || "Invalid credentials");
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    login.mutate({ data: { email, password } });
  }

  async function verify2fa(e: React.FormEvent) {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) { setError("Enter the 6-digit code from your authenticator app"); return; }
    setVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code"); return; }
      if (data?.user) {
        setLoggedIn(data.user.id);
        saveAccount({ id: data.user.id, username: data.user.username, displayName: data.user.displayName ?? data.user.username, avatarUrl: data.user.avatarUrl });
        setLocation("/feed");
      }
    } catch {
      setError("Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="flex flex-col items-center gap-2">
            <img src="/sweatheory-logo.png" alt="Sweatheory" className="w-24 h-24 rounded-3xl object-cover flex-shrink-0 shadow-md" />
          </div>
          <h1 className="text-xl font-bold mt-2 mb-1">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        {requires2fa ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-col items-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center">
                <ShieldCheck size={22} className="text-amber-400" />
              </div>
              <h2 className="text-base font-bold">Two-Factor Authentication</h2>
              <p className="text-xs text-muted-foreground text-center">Enter the 6-digit code from your authenticator app to complete sign in.</p>
            </div>
            <form onSubmit={verify2fa} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">Authentication Code</label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                    autoFocus
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={verifying || totpCode.length !== 6}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ShieldCheck size={16} />
                {verifying ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                onClick={() => { setRequires2fa(false); setTotpCode(""); setError(""); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                ← Back to login
              </button>
            </form>
          </motion.div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-4" data-testid="login-form">
              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  data-testid="email-input"
                  placeholder="you@example.com"
                  className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    data-testid="password-input"
                    placeholder="Your password"
                    className="w-full bg-input border border-border rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
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

              <button
                type="submit"
                disabled={login.isPending}
                data-testid="login-submit"
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <LogIn size={16} />
                {login.isPending ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="mt-5">
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-xs text-muted-foreground/70 font-medium">or continue with</span>
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

            <div className="mt-5 space-y-3 text-center text-sm text-muted-foreground">
              <p>
                <Link href="/forgot-password">
                  <span className="text-primary hover:underline cursor-pointer font-medium">Forgot your password?</span>
                </Link>
              </p>
              <p>
                No account?{" "}
                <Link href="/register">
                  <span className="text-primary hover:underline cursor-pointer font-medium">Create one</span>
                </Link>
              </p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
