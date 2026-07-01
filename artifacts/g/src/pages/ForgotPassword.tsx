import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { useForgotPassword } from "@workspace/api-client-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const forgotPassword = useForgotPassword({
    mutation: {
      onSuccess: (data: any) => {
        setSubmitted(true);
        if (data?.resetUrl) setResetUrl(data.resetUrl);
      },
      onError: (err: any) => {
        setError(err?.data?.error || "Something went wrong. Please try again.");
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    forgotPassword.mutate({ data: { email } });
  }

  function copyLink() {
    if (!resetUrl) return;
    navigator.clipboard?.writeText(resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3">
            <img src="/sweatheory-logo.png" alt="Sweatheory" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 shadow-sm" />
          </div>
          <h1 className="text-xl font-bold mt-3 mb-1">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            {submitted ? "Check the link below to reset your password." : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={forgotPassword.isPending}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {forgotPassword.isPending ? "Sending..." : "Send reset link"}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                <Check size={18} className="text-green-400" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Link generated</p>
              <p className="text-xs text-muted-foreground">
                Use the link below to reset your password. It expires in 1 hour.
              </p>
            </div>

            {resetUrl && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your reset link</p>
                <p className="text-xs text-muted-foreground break-all font-mono bg-muted/40 rounded-lg px-3 py-2">
                  {resetUrl}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={copyLink}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-muted/60 hover:bg-muted text-sm font-medium rounded-lg transition-colors"
                  >
                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                  <a
                    href={resetUrl}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink size={14} />
                    Open link
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        <Link href="/login">
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mt-6 transition-colors cursor-pointer">
            <ArrowLeft size={14} />
            Back to sign in
          </p>
        </Link>
      </motion.div>
    </div>
  );
}
