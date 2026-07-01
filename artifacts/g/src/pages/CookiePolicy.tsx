import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Cookie } from "lucide-react";

export default function CookiePolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/privacy">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft size={16} /> Privacy Policy
          </button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Cookie size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cookie Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: May 2026</p>
          </div>
        </div>

        <div className="space-y-8 text-muted-foreground leading-relaxed text-sm">

          <section>
            <p className="text-foreground/80 mb-6">This Cookie Policy is issued by J.I.M. Investments LLC (operating SWEATHEORY). It explains how J.I.M. Investments LLC uses cookies and similar technologies on the SWEATHEORY platform.</p>
            <h2 className="text-base font-bold text-foreground mb-3">What Are Cookies?</h2>
            <p>
              Cookies are small text files stored on your device by your browser when you visit a website.
              They allow the site to remember information about your visit — such as whether you're logged in —
              making your experience faster and easier on return visits.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">Cookies We Use</h2>
            <p className="mb-4">We use the following categories of cookies:</p>

            <div className="space-y-4">
              <div className="bg-card border border-border/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 bg-primary/15 text-primary rounded-full">Essential</span>
                  <span className="text-xs text-muted-foreground/60">Always active</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground/70 border-b border-border/40">
                      <th className="text-left py-1 pr-3 font-semibold">Name</th>
                      <th className="text-left py-1 pr-3 font-semibold">Purpose</th>
                      <th className="text-left py-1 font-semibold">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    <tr>
                      <td className="py-2 pr-3 font-mono text-foreground">g_token</td>
                      <td className="py-2 pr-3">Authenticates your session. Set as httpOnly and Secure — not readable by JavaScript.</td>
                      <td className="py-2">30 days (rolling)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-mono text-foreground">cookie_consent</td>
                      <td className="py-2 pr-3">Stores your cookie consent preferences.</td>
                      <td className="py-2">1 year</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-card border border-border/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded-full">Analytics</span>
                  <span className="text-xs text-muted-foreground/60">Requires consent</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground/70 border-b border-border/40">
                      <th className="text-left py-1 pr-3 font-semibold">Name</th>
                      <th className="text-left py-1 pr-3 font-semibold">Purpose</th>
                      <th className="text-left py-1 font-semibold">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    <tr>
                      <td className="py-2 pr-3 font-mono text-foreground">_gc_session</td>
                      <td className="py-2 pr-3">Anonymised usage analytics to help us understand how features are used and improve the platform.</td>
                      <td className="py-2">Session</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground/60 mt-3">
                  Analytics cookies are only set after you click "Accept All" or explicitly enable them in your preferences.
                  No data is shared with third-party advertising networks.
                </p>
              </div>

              <div className="bg-card border border-border/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded-full">Preferences</span>
                  <span className="text-xs text-muted-foreground/60">Requires consent</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground/70 border-b border-border/40">
                      <th className="text-left py-1 pr-3 font-semibold">Name</th>
                      <th className="text-left py-1 pr-3 font-semibold">Purpose</th>
                      <th className="text-left py-1 font-semibold">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    <tr>
                      <td className="py-2 pr-3 font-mono text-foreground">sidebar_left</td>
                      <td className="py-2 pr-3">Remembers whether you prefer the sidebar expanded or collapsed.</td>
                      <td className="py-2">Persistent</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-mono text-foreground">sidebar_right</td>
                      <td className="py-2 pr-3">Remembers whether you prefer the right sidebar expanded or collapsed.</td>
                      <td className="py-2">Persistent</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">Third-Party Cookies</h2>
            <p>
              J.I.M. Investments LLC does not embed third-party advertising networks or social media tracking pixels.
              When you view embedded third-party content (such as external video players), those providers may set their
              own cookies subject to their own privacy policies. We do not control those cookies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">How Long Do Cookies Last?</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Session cookies</strong> expire when you close your browser.</li>
              <li><strong className="text-foreground">Persistent cookies</strong> remain on your device until their expiry date or until you delete them manually.</li>
              <li>Your authentication cookie (<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">g_token</code>) is renewed for 30 days each time you use the platform and expires if you don't visit for 30 days.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">How to Control Cookies</h2>
            <p className="mb-3">You have several ways to control cookies:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">Cookie consent banner:</strong> When you first visit SWEATHEORY, a banner lets you Accept All, Reject Non-Essential, or manage your preferences per category.
              </li>
              <li>
                <strong className="text-foreground">Browser settings:</strong> Most browsers let you block or delete cookies via their settings. Note that blocking essential cookies (like the authentication cookie) will prevent you from staying logged in.
              </li>
              <li>
                <strong className="text-foreground">Opt-out links:</strong> Where applicable, you can opt out of analytics via your browser's Do Not Track signal.
              </li>
            </ul>
            <p className="mt-3 text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-amber-400/80">
              Disabling the <code className="font-mono">g_token</code> session cookie will log you out and prevent you from using authenticated features.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">Updates to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time. Material changes will be indicated by an updated
              "Last updated" date and, where appropriate, notified to you through the Platform.
            </p>
          </section>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/60">
              See also our{" "}
              <Link href="/privacy"><span className="text-primary hover:underline cursor-pointer">Privacy Policy</span></Link>
              {" "}and{" "}
              <Link href="/terms"><span className="text-primary hover:underline cursor-pointer">Terms of Service</span></Link>.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
