import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Shield, FileText, Mail } from "lucide-react";

export default function DMCA() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/legal">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} /> Legal
        </button>
      </Link>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <Shield size={22} className="text-primary" />
          <h1 className="text-2xl font-black">DMCA / Photo Complaints</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-base font-bold mb-3">Copyright Policy</h2>
            <p>J.I.M. Investments LLC (operating SWEATHEORY) respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act (DMCA), 17 U.S.C. § 512, J.I.M. Investments LLC will respond promptly to claims of copyright infringement committed using the SWEATHEORY platform.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Filing a DMCA Takedown Notice</h2>
            <p className="mb-3">If you believe that content on SWEATHEORY infringes your copyright, please submit a written notice to our designated DMCA agent that includes all of the following:</p>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
              <li>A physical or electronic signature of the copyright owner or authorized agent</li>
              <li>Identification of the copyrighted work claimed to have been infringed</li>
              <li>Identification of the material that is claimed to be infringing, with sufficient detail to locate it on our platform (URL, username, etc.)</li>
              <li>Your contact information: name, address, telephone number, and email address</li>
              <li>A statement that you have a good-faith belief that the disputed use is not authorized by the copyright owner, its agent, or the law</li>
              <li>A statement made under penalty of perjury that the above information is accurate and that you are the copyright owner or authorized to act on their behalf</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Photo / Intimate Image Complaints</h2>
            <p>If intimate or private images of you have been shared without your consent, please use our <Link href="/contact"><span className="text-primary hover:underline cursor-pointer">Report Content</span></Link> form and select "Non-consensual intimate imagery." We treat these reports with the highest urgency and will act within 24 hours.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Counter-Notice</h2>
            <p>If you believe your content was removed in error, you may submit a counter-notice. Counter-notices must include your contact information, identification of the removed content, a statement under penalty of perjury that you have a good-faith belief the material was removed by mistake, and your consent to jurisdiction in the relevant federal district court.</p>
          </section>

          <section className="bg-card border border-border/60 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Mail size={16} className="text-primary" />
              <h2 className="text-base font-bold">DMCA Agent Contact</h2>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><strong className="text-foreground">DMCA Designated Agent:</strong> Julian Ledesma</p>
              <p>J.I.M. Investments LLC</p>
              <p>1503 N Cahuenga Blvd</p>
              <p>Los Angeles, CA 90028</p>
              <p>Email: <span className="text-primary">legal@sweatheory.com</span> — Subject line: DMCA Takedown Notice</p>
              <p className="mt-2"><strong className="text-foreground">US Copyright Office Registration No.</strong> DMCA-1072959</p>
            </div>
            <p className="text-xs text-muted-foreground mt-3">We respond to valid DMCA notices within 3 business days.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Repeat Infringers</h2>
            <p>J.I.M. Investments LLC will terminate the accounts of users who are repeat copyright infringers in appropriate circumstances.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
