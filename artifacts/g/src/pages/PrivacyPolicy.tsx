import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Lock } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Lock size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: May 2026</p>
          </div>
        </div>

        <div className="space-y-8 text-muted-foreground leading-relaxed text-sm">

          <section>
            <p className="text-foreground/80 mb-6">This Privacy Policy applies to J.I.M. Investments LLC (operating SWEATHEORY), the operator of this Platform. J.I.M. Investments LLC is the data controller responsible for your personal information.</p>
            <h2 className="text-base font-bold text-foreground mb-3">1. Information We Collect</h2>
            <p className="mb-2"><strong className="text-foreground">Account information:</strong> username, email address, display name, password (hashed), bio, avatar, and banner images.</p>
            <p className="mb-2"><strong className="text-foreground">Content:</strong> posts, photos, videos, livestreams, messages, marketplace listings, and meetup details you create.</p>
            <p className="mb-2"><strong className="text-foreground">Financial:</strong> wallet balances, transaction history (tips, deposits, withdrawals, purchases). Payment processor information handled by our payment partners.</p>
            <p><strong className="text-foreground">Usage data:</strong> post views, engagement metrics, session activity, and device/browser information for security and analytics.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Operating and personalizing the Platform experience</li>
              <li>Processing payments, tips, and creator payouts</li>
              <li>Content moderation and safety enforcement</li>
              <li>Fraud detection and prevention</li>
              <li>Compliance with legal requirements</li>
              <li>Sending service-related notifications and updates</li>
              <li>Analytics to improve Platform features</li>
              <li>Responding to legal requests and court orders</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">3. Data Sharing</h2>
            <p className="mb-2">We do not sell your personal data. We may share information with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Service providers:</strong> payment processors, cloud infrastructure, and analytics tools under confidentiality agreements</li>
              <li><strong className="text-foreground">Law enforcement:</strong> when required by law, court order, or to report illegal content (including CSAM)</li>
              <li><strong className="text-foreground">Other users:</strong> your public profile information, posts, and social activity (followers, following) are visible per your privacy settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">4. Content & Moderation Logging</h2>
            <p>We maintain moderation logs including reported content, moderation decisions, timestamps, and evidence tracking. Livestreams may be archived. These logs support appeals, compliance, and platform safety operations.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">5. Security</h2>
            <p>All connections use encrypted HTTPS. Passwords are bcrypt-hashed and never stored in plain text. JWT tokens are signed with a secure secret. We maintain access controls, backup systems, and incident response procedures to protect your data.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">6. Data Retention</h2>
            <p>Account data is retained while your account is active. Deleted content is removed from public view immediately but may be retained in backups for up to 30 days. Moderation logs and financial records are retained for legal compliance periods.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">7. Your Rights</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access and download your data through account settings</li>
              <li>Correct inaccurate profile information at any time</li>
              <li>Delete your account (subject to legal retention requirements)</li>
              <li>Opt out of non-essential communications</li>
              <li>Appeal moderation decisions through our support process</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">8. Cookies & Tracking</h2>
            <p className="mb-2">
              We use an <strong className="text-foreground">httpOnly, Secure, SameSite=Strict cookie</strong> named{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">g_token</code> to store your
              authentication session. This cookie is set by the server and is <strong className="text-foreground">not
              accessible to JavaScript</strong>, protecting it from cross-site scripting attacks. It is never stored
              in localStorage or sessionStorage.
            </p>
            <p className="mb-2">
              We also set a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">cookie_consent</code> cookie
              to remember your cookie preferences, and optional analytics and preference cookies if you consent.
              No third-party advertising trackers are embedded in the core platform.
            </p>
            <p>
              For full details on every cookie we use, how long they last, and how to control them, see our{" "}
              <Link href="/cookies"><span className="text-primary hover:underline cursor-pointer">Cookie Policy</span></Link>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">9. Children's Privacy</h2>
            <p>This Platform is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If we discover such an account, it will be terminated and the data deleted. If you believe a child has registered, contact us immediately.</p>
          </section>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/60">
              See also our{" "}
              <Link href="/terms"><span className="text-primary hover:underline cursor-pointer">Terms of Service</span></Link>
              {" "}and{" "}
              <Link href="/guidelines"><span className="text-primary hover:underline cursor-pointer">Sweatiquette</span></Link>.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
