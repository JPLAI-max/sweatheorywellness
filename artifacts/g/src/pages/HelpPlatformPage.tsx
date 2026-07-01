import { Link } from "wouter";
import { ArrowLeft, ExternalLink } from "lucide-react";

interface Step {
  text: string;
  note?: string;
}

interface HelpPlatformPageProps {
  platform: string;
  slug: string;
  platformUrl: string;
  steps: Step[];
  logoColor?: string;
}

export default function HelpPlatformPage({
  platform, slug, platformUrl, steps, logoColor = "text-primary",
}: HelpPlatformPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-xl mx-auto px-4 py-8">

        {/* Back nav */}
        <Link href="/settings">
          <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft size={14} />
            Back to Settings
          </a>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <img src="/sweatheory-logo.png" alt="Sweatheory" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
            <span className="text-muted-foreground text-sm font-semibold">+</span>
            <span className={`text-lg font-black ${logoColor}`}>{platform}</span>
          </div>
          <h1 className="text-2xl font-black mb-2">
            How to add SWEATHEORY to your {platform}
          </h1>
          <p className="text-sm text-muted-foreground">
            Follow these steps to link your SWEATHEORY profile page from your {platform} account.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4 mb-10">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-4 bg-card border border-border rounded-2xl px-4 py-4">
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0 text-xs font-black mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: step.text.replace(
                    /(https?:\/\/[^\s]+)/g,
                    '<code class="bg-muted/60 px-1.5 py-0.5 rounded text-primary text-xs font-mono">$1</code>'
                  )}}
                />
                {step.note && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{step.note}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Screenshot placeholders */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Visual guide</p>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map(n => (
              <div key={n} className="aspect-video bg-muted/30 border border-dashed border-border/60 rounded-xl flex items-center justify-center">
                <img
                  src={`/help/screenshots/${slug}-step-${n}.png`}
                  alt={`${platform} step ${n}`}
                  className="w-full h-full object-cover rounded-xl"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <span className="text-xs text-muted-foreground/40 absolute">Step {n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tip box */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-4 mb-8">
          <p className="text-xs font-semibold text-primary mb-1">Pro tip</p>
          <p className="text-sm text-muted-foreground">
            Your SWEATHEORY link-in-bio page is at{" "}
            <code className="bg-muted/60 px-1.5 py-0.5 rounded text-primary text-xs font-mono">
              sweatheory.com/@yourusername
            </code>
            . Share it everywhere.
          </p>
        </div>

        {/* Open platform link */}
        <a
          href={platformUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-card border border-border rounded-xl text-sm font-semibold hover:bg-muted/40 transition-colors mb-6"
        >
          Open {platform}
          <ExternalLink size={13} />
        </a>

        {/* Footer */}
        <p className="text-xs text-muted-foreground text-center">
          Need help?{" "}
          <a href="mailto:creators@sweatheory.com" className="text-primary hover:underline">
            Email creators@sweatheory.com
          </a>
        </p>

      </div>
    </div>
  );
}

// ─── Individual platform pages ─────────────────────────────────────────────────

export function HelpLinktree() {
  return (
    <HelpPlatformPage
      platform="Linktree"
      slug="linktree"
      platformUrl="https://linktree.com"
      logoColor="text-green-400"
      steps={[
        { text: "Log into your Linktree account at https://linktr.ee" },
        { text: 'Click "Add link" at the top of your link list.' },
        { text: 'In the Title field, type "My SWEATHEORY".' },
        {
          text: "In the URL field, paste: https://sweatheory.com/@yourusername",
          note: 'Replace "yourusername" with your SWEATHEORY handle.',
        },
        { text: "Click Save." },
      ]}
    />
  );
}

export function HelpBeacons() {
  return (
    <HelpPlatformPage
      platform="Beacons"
      slug="beacons"
      platformUrl="https://beacons.ai"
      logoColor="text-yellow-400"
      steps={[
        { text: "Log into your Beacons account at https://beacons.ai" },
        { text: 'Open your Beacons editor and click "Add a Block".' },
        { text: 'Choose "Link".' },
        { text: 'In the Title field, type "SWEATHEORY".' },
        {
          text: "In the URL field, paste: https://sweatheory.com/@yourusername",
        },
        { text: "Optional: add a thumbnail image from your SWEATHEORY profile." },
        { text: "Click Save." },
      ]}
    />
  );
}

export function HelpAllMyLinks() {
  return (
    <HelpPlatformPage
      platform="AllMyLinks"
      slug="allmylinks"
      platformUrl="https://allmylinks.com"
      logoColor="text-blue-400"
      steps={[
        { text: "Log into your AllMyLinks account at https://allmylinks.com" },
        { text: 'Click "Add Link" in your dashboard.' },
        {
          text: 'If AllMyLinks doesn\'t auto-detect SWEATHEORY, choose "Custom Link".',
        },
        { text: "Title: SWEATHEORY" },
        { text: "URL: https://sweatheory.com/@yourusername" },
        { text: "Save." },
      ]}
    />
  );
}

export function HelpStan() {
  return (
    <HelpPlatformPage
      platform="Stan.store"
      slug="stan"
      platformUrl="https://stan.store"
      logoColor="text-orange-400"
      steps={[
        { text: "Log into your Stan.store account at https://stan.store" },
        { text: "Go to your storefront editor." },
        { text: 'Click "Add Section" and choose "Link".' },
        { text: "Title: SWEATHEORY" },
        { text: "URL: https://sweatheory.com/@yourusername" },
        { text: "Click Publish." },
      ]}
    />
  );
}
