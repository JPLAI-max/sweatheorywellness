import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";

export default function TrademarksIP() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/legal">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} /> Legal
        </button>
      </Link>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <FileText size={22} className="text-primary" />
          <h1 className="text-2xl font-black">Trademarks & Intellectual Property</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Last updated: January 1, 2025</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-base font-bold mb-3">Sweatheory Trademarks</h2>
            <p className="mb-3">The following are trademarks of Sweatheory and may not be used without prior written permission:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Sweatheory™ (name and wordmark)</li>
              <li>The Sweatheory "G" logo and icon</li>
              <li>Associated slogans, taglines, and brand elements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Permitted Use of Sweatheory Trademarks</h2>
            <p className="mb-2">You may refer to Sweatheory by name when:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Referring to the platform in editorial or journalistic context</li>
              <li>Linking to Sweatheory from your website or social media</li>
              <li>Describing your Sweatheory creator page ("Find me on Sweatheory")</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Prohibited Uses</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Using Sweatheory marks in a way that implies endorsement, sponsorship, or official affiliation</li>
              <li>Modifying or incorporating Sweatheory marks into your own branding</li>
              <li>Using Sweatheory marks in a domain name or app name</li>
              <li>Creating merchandise featuring Sweatheory marks without a license</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">User Content & Ownership</h2>
            <p>You retain ownership of all content you upload to Sweatheory. By posting content, you grant Sweatheory a non-exclusive, worldwide, royalty-free license to display and distribute your content within the platform. Sweatheory does not claim ownership of your creative work.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Third-Party IP Infringement</h2>
            <p>If you believe your intellectual property rights have been infringed on Sweatheory, please refer to our <Link href="/dmca"><span className="text-primary hover:underline cursor-pointer">DMCA / Photo Complaints</span></Link> page for instructions on how to file a notice.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Licensing Inquiries</h2>
            <p>For permission to use Sweatheory trademarks or to report trademark infringement, contact: <span className="text-primary">legal@gooncity.com</span></p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
