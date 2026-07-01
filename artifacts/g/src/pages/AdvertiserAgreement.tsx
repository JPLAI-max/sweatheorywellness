import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Zap } from "lucide-react";

export default function AdvertiserAgreement() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/legal">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} /> Legal
        </button>
      </Link>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <Zap size={22} className="text-primary" />
          <h1 className="text-2xl font-black">Advertiser Agreement</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Last updated: January 1, 2025</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-base font-bold mb-3">1. Acceptance of Terms</h2>
            <p>By placing an advertisement on Sweatheory, you ("Advertiser") agree to be bound by this Advertiser Agreement, our Terms of Service, and all applicable laws and regulations. Sweatheory reserves the right to reject or remove any advertisement at its sole discretion.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">2. Eligible Advertisers</h2>
            <p className="mb-2">Advertising on Sweatheory is available to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Creators and brands relevant to the Sweatheory community</li>
              <li>Products and services relevant to the Sweatheory community</li>
              <li>Businesses compliant with all applicable advertising laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">3. Prohibited Advertising Content</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Any content involving minors or implying minors</li>
              <li>Non-consensual content or content obtained illegally</li>
              <li>Deceptive, misleading, or fraudulent claims</li>
              <li>Malware, spyware, or harmful code</li>
              <li>Illegal goods or services</li>
              <li>Content that violates third-party intellectual property rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">4. Payment & Billing</h2>
            <p>All advertising fees are billed in advance. Fees are non-refundable once an advertisement has been displayed. Sweatheory reserves the right to modify advertising rates with 30 days' notice.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">5. Advertiser Representations</h2>
            <p>Advertiser represents and warrants that: (a) all ad content is truthful and not deceptive; (b) Advertiser owns or has rights to all content submitted; (c) ad content complies with all applicable laws; (d) Advertiser is of legal age to enter into this agreement.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">6. Indemnification</h2>
            <p>Advertiser agrees to indemnify and hold Sweatheory harmless from any claims, damages, or expenses arising from Advertiser's content, breach of this agreement, or violation of applicable law.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">7. Termination</h2>
            <p>Sweatheory may terminate any advertising arrangement immediately if Advertiser violates this agreement, our Terms of Service, or if the advertising content is found to be harmful, illegal, or otherwise objectionable.</p>
          </section>

          <section className="bg-card border border-border/60 rounded-xl p-5">
            <h2 className="text-base font-bold mb-2">Advertising Inquiries</h2>
            <p className="text-muted-foreground text-sm">For advertising opportunities, contact us at <span className="text-primary">ads@gooncity.com</span></p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
