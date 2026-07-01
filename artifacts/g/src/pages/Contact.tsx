import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Mail, Flag, AlertTriangle, MessageSquare, Shield, Send } from "lucide-react";
import { useState } from "react";

const REPORT_REASONS = [
  "Child Sexual Abuse Material (CSAM)",
  "Non-consensual intimate imagery",
  "Harassment or targeted abuse",
  "Hate speech",
  "Spam or bot activity",
  "Impersonation",
  "Illegal content",
  "Other violation",
];

export default function Contact() {
  const [tab, setTab] = useState<"contact" | "report">("contact");
  const [contactForm, setContactForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [reportForm, setReportForm] = useState({ reason: "", url: "", description: "", email: "" });
  const [contactSent, setContactSent] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const submitContact = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSent(true);
  };

  const submitReport = (e: React.FormEvent) => {
    e.preventDefault();
    setReportSent(true);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/feed">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft size={15} />
            Back
          </button>
        </Link>
        <h1 className="text-2xl font-black">Contact & Report</h1>
        <p className="text-sm text-muted-foreground mt-1">Get in touch with our team or report a violation.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-8 bg-muted/40 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("contact")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "contact" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <MessageSquare size={14} />
          Contact Us
        </button>
        <button
          onClick={() => setTab("report")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "report" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Flag size={14} />
          Report Content
        </button>
      </div>

      {tab === "contact" ? (
        <motion.div key="contact" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {contactSent ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4">
                <Send size={28} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">Message sent!</h2>
              <p className="text-muted-foreground text-sm">We'll get back to you within 24–48 hours.</p>
              <button onClick={() => { setContactSent(false); setContactForm({ name: "", email: "", subject: "", message: "" }); }} className="mt-6 text-sm text-primary hover:underline">Send another message</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                {[
                  { icon: Mail, title: "General", desc: "Questions, feedback, partnerships" },
                  { icon: Shield, title: "Safety", desc: "Account security & trust issues" },
                  { icon: AlertTriangle, title: "Billing", desc: "Wallet, tips & payment issues" },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="bg-card border border-border/60 rounded-xl p-4">
                    <Icon size={18} className="text-primary mb-2" />
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={submitContact} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Your name</label>
                    <input
                      required
                      value={contactForm.name}
                      onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                      placeholder="Display name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Email</label>
                    <input
                      required
                      type="email"
                      value={contactForm.email}
                      onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Subject</label>
                  <input
                    required
                    value={contactForm.subject}
                    onChange={e => setContactForm(f => ({ ...f, subject: e.target.value }))}
                    className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="What's this about?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Message</label>
                  <textarea
                    required
                    rows={5}
                    value={contactForm.message}
                    onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                    className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
                    placeholder="Tell us how we can help..."
                  />
                </div>
                <button type="submit" className="w-full py-3 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                  <Send size={15} />
                  Send message
                </button>
              </form>
            </>
          )}
        </motion.div>
      ) : (
        <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {reportSent ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <Flag size={28} className="text-red-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Report submitted</h2>
              <p className="text-muted-foreground text-sm">Our safety team reviews every report, typically within 24 hours.</p>
              <button onClick={() => { setReportSent(false); setReportForm({ reason: "", url: "", description: "", email: "" }); }} className="mt-6 text-sm text-primary hover:underline">Submit another report</button>
            </div>
          ) : (
            <>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex gap-3">
                <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-400">CSAM / child safety violations</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Are reported to NCMEC immediately and result in permanent account termination and law enforcement referral.</p>
                </div>
              </div>

              <form onSubmit={submitReport} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Reason for report</label>
                  <select
                    required
                    value={reportForm.reason}
                    onChange={e => setReportForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  >
                    <option value="">Select a reason...</option>
                    {REPORT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">URL or username being reported</label>
                  <input
                    required
                    value={reportForm.url}
                    onChange={e => setReportForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="https://gooncity.com/profile/username or @username"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Description</label>
                  <textarea
                    required
                    rows={4}
                    value={reportForm.description}
                    onChange={e => setReportForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
                    placeholder="Describe the violation in detail..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Your email (optional — for follow-up)</label>
                  <input
                    type="email"
                    value={reportForm.email}
                    onChange={e => setReportForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
                <button type="submit" className="w-full py-3 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                  <Flag size={15} />
                  Submit report
                </button>
              </form>
            </>
          )}
        </motion.div>
      )}

      <div className="mt-10 pt-6 border-t border-border/40 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Link href="/terms"><span className="hover:text-foreground transition-colors cursor-pointer">Terms of Service</span></Link>
        <Link href="/privacy"><span className="hover:text-foreground transition-colors cursor-pointer">Privacy Policy</span></Link>
        <Link href="/guidelines"><span className="hover:text-foreground transition-colors cursor-pointer">Sweatiquette</span></Link>
      </div>
    </div>
  );
}
