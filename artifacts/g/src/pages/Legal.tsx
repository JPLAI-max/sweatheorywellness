import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Shield, FileText, Zap, BookOpen, Flag,
} from "lucide-react";

const LEGAL_LINKS = [
  {
    href: "/privacy",
    icon: Shield,
    title: "Privacy Policy",
    desc: "How we collect, use, and protect your data",
  },
  {
    href: "/terms",
    icon: FileText,
    title: "Terms & Conditions",
    desc: "Rules governing use of the Sweatheory platform",
  },
  {
    href: "/advertiser-agreement",
    icon: Zap,
    title: "Advertiser Agreement",
    desc: "Terms for advertising on Sweatheory",
  },
  {
    href: "/dmca",
    icon: Shield,
    title: "DMCA / Photo Complaints",
    desc: "Copyright and intimate image removal requests",
  },
  {
    href: "/trademarks",
    icon: FileText,
    title: "Trademarks & IP",
    desc: "Sweatheory brand usage and intellectual property",
  },
  {
    href: "/guidelines",
    icon: BookOpen,
    title: "Sweatiquette®",
    desc: "Our community standards — what Sweatheory Wellness is built on",
  },
  {
    href: "/contact",
    icon: Flag,
    title: "Contact & Report Abuse",
    desc: "Get help or report a violation",
  },
];

export default function Legal() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black mb-2">Legal</h1>
        <p className="text-sm text-muted-foreground mb-8">Sweatheory legal documents, policies, and compliance resources.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LEGAL_LINKS.map(({ href, icon: Icon, title, desc }) => (
            <Link key={href} href={href}>
              <div className="group bg-card border border-border/60 rounded-xl p-4 cursor-pointer hover:border-primary/40 transition-all h-full">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10">
                    <Icon size={15} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-border/40 text-xs text-muted-foreground space-y-1">
          <p>© {new Date().getFullYear()} J.I.M. Investments LLC. All rights reserved. SWEATHEORY is a service of J.I.M. Investments LLC.</p>
          <p>For legal inquiries: <span className="text-primary">legal@sweatheory.com</span></p>
        </div>
      </motion.div>
    </div>
  );
}
