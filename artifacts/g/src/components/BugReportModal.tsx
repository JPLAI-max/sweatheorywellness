import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bug, Flag, User, HelpCircle, Send, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type IssueType = "bug" | "content_report" | "account_issue" | "other";

const ISSUE_TYPES: { value: IssueType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "bug", label: "Bug Report", icon: <Bug size={15} />, desc: "Something isn't working as expected" },
  { value: "content_report", label: "Content Report", icon: <Flag size={15} />, desc: "Inappropriate or harmful content" },
  { value: "account_issue", label: "Account Issue", icon: <User size={15} />, desc: "Login, access or account problem" },
  { value: "other", label: "Other", icon: <HelpCircle size={15} />, desc: "General question or feedback" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BugReportModal({ open, onClose }: Props) {
  const { user } = useCurrentUser();
  const [issueType, setIssueType] = useState<IssueType>("bug");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setIssueType("bug");
    setDescription("");
    setContactEmail(user?.email ?? "");
    setSubmitting(false);
    setDone(false);
    setError("");
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 10) {
      setError("Please describe the issue in at least 10 characters.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ issueType, description: description.trim(), contactEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="w-full max-w-md bg-card border border-card-border rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Flag size={14} className="text-primary" />
                </div>
                <h2 className="font-bold text-sm">Contact & Report</h2>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5">
              {done ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={30} className="text-green-400" />
                  </div>
                  <p className="font-black text-lg mb-1">Report submitted</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    We've received your report and will review it within 24–48 hours. If you provided an email we may follow up.
                  </p>
                  <button
                    onClick={handleClose}
                    className="px-6 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Issue type */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Issue Type</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ISSUE_TYPES.map(({ value, label, icon, desc }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setIssueType(value)}
                          className={cn(
                            "flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all",
                            issueType === value
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
                          )}
                        >
                          <div className={cn("flex items-center gap-1.5 font-semibold text-xs", issueType === value ? "text-primary" : "text-foreground")}>
                            {icon}
                            {label}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Description <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the issue in detail — what happened, what you expected, and any steps to reproduce..."
                      maxLength={5000}
                      className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1 text-right">{description.length}/5000</p>
                  </div>

                  {/* Contact email */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Your Email <span className="text-destructive">*</span>
                    </label>
                    <input
                      required
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-input border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">We'll only use this to follow up on your report.</p>
                  </div>

                  {error && (
                    <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <><Send size={14} /> Submit Report</>}
                  </button>

                  <p className="text-[10px] text-muted-foreground text-center">
                    Reports are reviewed by our team within 24–48 hours. All submissions are sent to support@sweatheory.com.
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
