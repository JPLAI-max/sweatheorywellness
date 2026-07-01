import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";

export default function TermsOfService() {
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
            <Shield size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Terms of Service</h1>
            <p className="text-sm text-muted-foreground">Last updated: May 2026</p>
          </div>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using SWEATHEORY, a service of J.I.M. Investments LLC (operating SWEATHEORY) ("the Platform", "we", "us"), you agree to be bound by these Terms of Service. If you do not agree to all terms, you may not access or use the Platform. You must be of legal age to form a binding contract in your jurisdiction to use this Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">2. User Responsibilities</h2>
            <p className="mb-2">You are solely responsible for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>All content you upload, post, livestream, or otherwise make available</li>
              <li>Your marketplace listings, products, services, and related transactions</li>
              <li>Your meetup/event creation, promotion, and hosting</li>
              <li>Your interactions with other users, both on and off the Platform</li>
              <li>All financial transactions you initiate, including tips, purchases, and withdrawals</li>
              <li>Maintaining the security of your account credentials</li>
              <li>Compliance with all applicable local, national, and international laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">3. Platform Liability Disclaimer</h2>
            <p className="mb-2">J.I.M. Investments LLC is not responsible for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>User-generated content, including posts, streams, marketplace listings, or messages</li>
              <li>Private interactions between users</li>
              <li>Off-platform conduct, meetups, or in-person events</li>
              <li>Disputes between creators and their audiences or customers</li>
              <li>Failed transactions, chargebacks, or payment disputes between users</li>
              <li>Content accuracy, product quality, delivery, or authenticity</li>
              <li>Damages caused by third-party users or content</li>
            </ul>
            <p className="mt-3">THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. IN NO EVENT SHALL J.I.M. INVESTMENTS LLC BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">4. Content Standards & Prohibited Content</h2>
            <p className="mb-2">The following content is strictly prohibited and will result in immediate account termination:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sexual content involving minors (CSAM) — zero tolerance, will be reported to authorities</li>
              <li>Non-consensual intimate imagery or recordings</li>
              <li>Content that facilitates human trafficking or exploitation</li>
              <li>Doxxing, stalking, or targeted harassment campaigns</li>
              <li>Illegal activity, including fraud, money laundering, or drug sales</li>
              <li>Hate speech based on race, ethnicity, religion, gender, or sexual orientation</li>
              <li>Violent threats or incitement to violence</li>
              <li>Deceptive impersonation of other users or public figures</li>
              <li>Spam, malware distribution, or phishing attempts</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">5. Creator Monetization</h2>
            <p>Creators monetize through tips, subscriptions, marketplace sales, and paid livestreams. J.I.M. Investments LLC applies transaction fees as disclosed in your account tier. You are solely responsible for reporting and paying all applicable taxes on your earnings. The Platform may require identity and tax documentation before releasing payouts.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">6. Copyright & Intellectual Property</h2>
            <p>You retain ownership of content you create. By posting, you grant J.I.M. Investments LLC a non-exclusive, worldwide license to display, distribute, and promote your content on the Platform. You may not post content that infringes third-party copyrights. We respond to valid DMCA takedown requests and maintain a repeat-infringer termination policy.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">7. Account Termination</h2>
            <p>J.I.M. Investments LLC reserves the right to suspend, restrict, demonetize, or permanently ban any account at its sole discretion for policy violations, fraud, abuse, or harmful behavior. Moderation decisions are logged with timestamps and may be appealed through our support process.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">8. Dispute Resolution & Arbitration</h2>
            <p>Any disputes arising from your use of the Platform shall be resolved through binding arbitration rather than in court. You waive any right to a jury trial or class-action lawsuit. This agreement is governed by applicable law.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">9. Merch &amp; Physical Goods — All Sales Final</h2>
            <p>All merchandise purchases on Sweatheory are custom-made to order and <strong>all sales are final</strong>. We do not offer buyer-initiated returns, refunds, or exchanges. The sole exceptions are: (a) confirmed manufacturing defects, or (b) items that are never delivered. In either case, contact support within 30 days of your expected delivery date. Refunds for qualifying exceptions are credited to your Sweatheory wallet balance; no cash or card refunds are issued at this time. Chargebacks initiated outside this process may result in account suspension.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-3">10. Changes to Terms</h2>
            <p>We may update these terms at any time. Continued use of the Platform after changes constitutes acceptance. Material changes will be communicated via the Platform or email.</p>
          </section>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/60">
              Questions? Contact us through our support channels. See also our{" "}
              <Link href="/privacy"><span className="text-primary hover:underline cursor-pointer">Privacy Policy</span></Link>
              {" "}and{" "}
              <Link href="/guidelines"><span className="text-primary hover:underline cursor-pointer">Sweatiquette</span></Link>.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
