import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, BookOpen, ShieldCheck, Star, AlertTriangle, Heart } from "lucide-react";

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-primary/40 pl-4 py-1">
      <p className="text-foreground/80 leading-relaxed">{children}</p>
    </div>
  );
}

function Principle({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-3">
      <h3 className="font-bold text-foreground text-sm">{title}</h3>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <p key={i} className="text-sm text-foreground/75 leading-relaxed">{item}</p>
        ))}
      </div>
    </div>
  );
}

export default function CommunityGuidelines() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <BookOpen size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Sweatiquette®</h1>
            <p className="text-sm text-muted-foreground">The Official Culture & Trust Standard of Sweatheory</p>
          </div>
        </div>

        <div className="space-y-8 text-sm text-muted-foreground leading-relaxed mt-8">

          {/* Manifesto intro */}
          <section className="space-y-3">
            <p className="text-foreground/90 text-base leading-relaxed">
              Sweatiquette is more than community guidelines.
            </p>
            <p className="text-foreground/80">
              Sweatiquette is the ethical framework that governs the Sweatheory ecosystem.
            </p>
            <p className="text-foreground/80">
              Every user, creator, reviewer, coach, affiliate, partner, and studio participant agrees to follow Sweatiquette.
            </p>
            <p className="font-semibold text-foreground/90">
              The goal is simple: Create the most trusted wellness community possible.
            </p>
          </section>

          <div className="border-t border-border/40" />

          {/* Core Principles */}
          <Section title="Core Principles">
            <div className="space-y-4">
              <Principle
                title="Honesty First"
                items={[
                  "Share real experiences.",
                  "Share real results.",
                  "Share real struggles.",
                  "Share real successes.",
                  "Do not make false claims.",
                  "Do not intentionally mislead the community.",
                ]}
              />

              <Principle
                title="Disclosure Required"
                items={[
                  "If you receive free products, affiliate commissions, sponsorships, payments, discounts, or compensation of any kind — you must clearly disclose it.",
                  "Users deserve transparency.",
                  "Trust is more important than sales.",
                ]}
              />

              <Principle
                title="Honest Reviews"
                items={[
                  "Users and creators may leave positive or negative reviews.",
                  "Reviews should reflect genuine personal experiences.",
                  "No review should be influenced by compensation without disclosure.",
                ]}
              />

              <Principle
                title="Respect Individual Results"
                items={[
                  "What works for one person may not work for another.",
                  "Members should avoid making absolute claims.",
                  'Instead of: "This works for everyone." — say: "This worked for me."',
                ]}
              />
            </div>
          </Section>

          <div className="border-t border-border/40" />

          {/* Sweatheory Approved */}
          <Section title="Sweatheory Approved®" icon={<ShieldCheck size={16} className="text-primary" />}>
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4">
              <p className="text-foreground/80 italic">Future Program</p>
              <p className="text-foreground/80">
                Products, creators, studios, and services may earn Sweatheory Approved status.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-red-500/5 border border-red-500/15 rounded-xl px-4 py-3">
                  <p className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">Sweatheory Approved does NOT mean:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Guaranteed results</li>
                    <li>• Medical endorsement</li>
                    <li>• Universal effectiveness</li>
                  </ul>
                </div>
                <div className="bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-3">
                  <p className="font-semibold text-foreground mb-2 text-xs uppercase tracking-wide">Sweatheory Approved means:</p>
                  <p className="text-xs leading-relaxed">The product, service, creator, or experience has demonstrated value to the Sweatheory community based on reviews, engagement, transparency, and overall reputation.</p>
                </div>
              </div>
            </div>
          </Section>

          <div className="border-t border-border/40" />

          {/* Approved Creators */}
          <Section title="Sweatheory Approved Creators®" icon={<Star size={16} className="text-primary" />}>
            <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-3">
              <p className="text-foreground/80">Requirements may include:</p>
              <ul className="space-y-2">
                {[
                  "Honest disclosures",
                  "Consistent participation",
                  "Positive community standing",
                  "Transparent partnerships",
                  "Authentic content",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-foreground/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-foreground/70 text-xs pt-2 border-t border-border/40">
                Creators can lose approval if they violate Sweatiquette.
              </p>
              <div className="pt-1">
                <Link href="/approved">
                  <button className="text-xs font-bold text-primary hover:underline">
                    Learn about the Sweatheory Approved program →
                  </button>
                </Link>
              </div>
            </div>
          </Section>

          <div className="border-t border-border/40" />

          {/* Approved Products */}
          <Section title="Sweatheory Approved Products®">
            <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-3">
              <p className="text-foreground/80">Products may earn recognition based on:</p>
              <ul className="space-y-2">
                {[
                  "Community feedback",
                  "Reviews",
                  "Ratings",
                  "User experiences",
                  "Transparency",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-foreground/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="pt-2 border-t border-border/40 space-y-1">
                <p className="font-semibold text-foreground text-xs">Approval is community-driven.</p>
                <p className="text-xs text-foreground/70">Not purchased.</p>
              </div>
            </div>
          </Section>

          <div className="border-t border-border/40" />

          {/* Approved Studios */}
          <Section title="Sweatheory Approved Studios®">
            <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-3">
              <p className="text-foreground/80">Studios may earn approval through:</p>
              <ul className="space-y-2">
                {[
                  "Community satisfaction",
                  "Service quality",
                  "Transparency",
                  "Positive user experiences",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-foreground/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <div className="border-t border-border/40" />

          {/* Disclaimers */}
          <Section title="Important Disclaimers" icon={<AlertTriangle size={16} className="text-amber-500" />}>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-3">
              <p className="text-foreground/80">
                Sweatheory provides community information, discussions, reviews, and educational content.
              </p>
              <p className="text-foreground/80">Sweatheory does not guarantee:</p>
              <ul className="space-y-1.5 pl-1">
                {["Results", "Outcomes", "Medical benefits", "Product effectiveness"].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-foreground/75 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-foreground/80 text-xs pt-1 border-t border-amber-500/15">
                All wellness decisions remain the responsibility of the individual user. Members should consult qualified professionals when making health, wellness, fitness, nutritional, or medical decisions.
              </p>
            </div>
          </Section>

          <div className="border-t border-border/40" />

          {/* Community Values */}
          <Section title="Community Values" icon={<Heart size={16} className="text-primary" />}>
            <div className="space-y-3">
              <div className="flex gap-3">
                {["Think.", "Talk.", "Do."].map((word) => (
                  <div key={word} className="flex-1 bg-primary/10 border border-primary/20 rounded-xl py-3 text-center font-bold text-primary text-base">
                    {word}
                  </div>
                ))}
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-5">
                <ul className="space-y-2">
                  {[
                    "Support others.",
                    "Share honestly.",
                    "Celebrate progress.",
                    "Respect different journeys.",
                    "Help people find what works.",
                  ].map((value, i) => (
                    <li key={i} className="flex items-center gap-2 text-foreground/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      {value}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          <div className="border-t border-border/40" />

          {/* Mission */}
          <section className="space-y-3 pb-2">
            <h2 className="text-base font-bold text-foreground">Our Mission</h2>
            <Rule>The internet has enough advertisements.</Rule>
            <Rule>The internet has enough influencers.</Rule>
            <Rule>The internet has enough exaggerated claims.</Rule>
            <p className="text-foreground/80 pt-2">
              Sweatheory exists to create a place where people can share honest experiences, learn from one another, and make more informed wellness decisions.
            </p>
            <p className="font-bold text-foreground/90">
              Trust is our most valuable asset.
            </p>
          </section>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/60">
              See also our{" "}
              <Link href="/terms"><span className="text-primary hover:underline cursor-pointer">Terms of Service</span></Link>
              {" "}and{" "}
              <Link href="/privacy"><span className="text-primary hover:underline cursor-pointer">Privacy Policy</span></Link>.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
