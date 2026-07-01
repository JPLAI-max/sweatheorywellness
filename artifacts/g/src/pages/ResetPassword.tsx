import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff, KeyRound, Check, ArrowLeft } from "lucide-react";
import { useResetPassword } from "@workspace/api-client-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const resetPassword = useResetPassword({
    mutation: {
      onSuccess: () => setDone(true),
      onError: (err: any) => {
        setError(err?.data?.error || "Reset link is invalid or has expired.");
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirm) { setError("Passwords do not match."); return; }
    if (!token) { setError("No reset token found. Please request a new link."); return; }
    resetPassword.mutate({ data: { token, newPassword } });
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-5">
            <Check size={28} className="text-green-400" />
          </div>
          <h1 className="text-xl font-bold mb-2">Password updated!</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <button
            onClick={() => setLocation("/login")}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            Go to sign in
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <KeyRound size={24} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-1">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">Must be at least 8 characters.</p>
        </div>

        {!token && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg mb-4">
            No reset token found. Please request a new password reset link.
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">New password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                placeholder="At least 8 characters"
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Confirm new password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repeat your new password"
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={resetPassword.isPending || !token}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {resetPassword.isPending ? "Updating..." : "Update password"}
          </button>
        </form>

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
