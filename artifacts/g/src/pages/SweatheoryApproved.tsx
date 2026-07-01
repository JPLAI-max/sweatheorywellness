import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck, Star, Building2, Package, AlertTriangle, Mail } from "lucide-react";
import { SweatheoryApprovedBadge } from "@/components/SweatheoryApprovedBadge";

function ApprovalCard({ icon, title, subtitle, items, note }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  items: string[];
  note?: string;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-foreground text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-foreground/80">
            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
      {note && (
        <p className="text-xs text-muted-foreground/70 pt-2 border-t border-border/40">{note}</p>
      )}
    </div>
  );
}

export default function SweatheoryApproved() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/legal">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <ShieldCheck size={20} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Sweatheory Approved®</h1>
              <SweatheoryApprovedBadge size="md" />
            </div>
            <p className="text-sm text-muted-foreground">Creator · Product · Studio Verification Program</p>
          </div>
        </div>

        <div className="mt-8 space-y-8 text-sm text-muted-foreground leading-relaxed">

          {/* What it means */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-3">
            <SweatheoryApprovedBadge size="md" showLabel />
            <p className="text-foreground/80">
              Products, creators, studios, and services may earn Sweatheory Approved status. It is a recognition of demonstrated value to the Sweatheory community — based on reviews, engagement, transparency, and overall reputation.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-red-500/5 border border-red-500/15 rounded-xl px-4 py-3">
                <p className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">Does NOT mean:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Guaranteed results</li>
                  <li>• Medical endorsement</li>
                  <li>• Universal effectiveness</li>
                </ul>
              </div>
              <div className="bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-3">
                <p className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">Does mean:</p>
                <p className="text-xs leading-relaxed">Demonstrated value to the Sweatheory community based on reviews, engagement, transparency, and reputation.</p>
              </div>
            </div>
          </section>

          {/* Wellness disclaimer */}
          <section className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Important Wellness Disclaimer
            </h2>
            <p className="text-foreground/80">
              Content shared by Sweatheory Approved creators — and all creators on this platform — reflects their <strong className="text-foreground">personal experiences and opinions only</strong>.
            </p>
            <p className="text-foreground/80">
              <strong className="text-foreground">The Sweatheory Approved badge means we found this creator's content to be honest and experience-based — not that we endorse any specific wellness method, product, or result.</strong>
            </p>
            <p className="text-foreground/80">
              "Find What Works" is a personal journey. What works for one person may not work for another. Always consult a qualified healthcare professional before beginning any wellness program, diet, supplement regimen, or treatment.
            </p>
          </section>

          {/* Three approval tracks */}
          <section>
            <h2 className="text-base font-bold text-foreground mb-4">Approval Tracks</h2>
            <div className="space-y-4">
              <ApprovalCard
                icon={<Star size={17} className="text-primary" />}
                title="Sweatheory Approved Creators®"
                subtitle="Verified wellness creators on the platform"
                items={[
                  "Honest disclosures on all paid and gifted content",
                  "Consistent participation in the community",
                  "Positive community standing",
                  "Transparent partnerships",
                  "Authentic, experience-based content",
                ]}
                note="Creators can lose approval if they violate Sweatiquette."
              />

              <ApprovalCard
                icon={<Package size={17} className="text-primary" />}
                title="Sweatheory Approved Products®"
                subtitle="Community-recognized wellness products"
                items={[
                  "Community feedback and ratings",
                  "Verified user reviews",
                  "Demonstrated user experiences",
                  "Brand transparency",
                ]}
                note="Approval is community-driven. Not purchased."
              />

              <ApprovalCard
                icon={<Building2 size={17} className="text-primary" />}
                title="Sweatheory Approved Studios®"
                subtitle="Recognized wellness studios and spaces"
                items={[
                  "Community satisfaction scores",
                  "Verified service quality",
                  "Operational transparency",
                  "Positive user experiences",
                ]}
              />
            </div>
          </section>

          {/* How to apply */}
          <section className="bg-card border border-border/60 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-bold text-foreground">How to Apply</h2>
            <p>
              Applications are reviewed manually by the Sweatheory Wellness team. We evaluate content history, community engagement, and adherence to Sweatiquette. The review process takes 5–10 business days.
            </p>
            <p>
              To apply, email us with the subject line <strong className="text-foreground">"Sweatheory Approved Application"</strong> and include your username, the track you're applying for (Creator / Product / Studio), a brief overview of your wellness journey or offering, and three examples of your content or reviews.
            </p>
            <a
              href="mailto:approved@sweatheory.com?subject=Sweatheory%20Approved%20Application"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
            >
              <Mail size={15} />
              Apply for Sweatheory Approved
            </a>
          </section>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/60">
              See also our{" "}
              <Link href="/guidelines"><span className="text-primary hover:underline cursor-pointer">Sweatiquette</span></Link>
              {" "}and{" "}
              <Link href="/terms"><span className="text-primary hover:underline cursor-pointer">Terms of Service</span></Link>.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
