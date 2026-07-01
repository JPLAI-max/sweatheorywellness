// IMPORTANT: Any non-essential cookie or tracking script
// must call hasConsent('analytics') or hasConsent('preferences')
// before firing. Do not add analytics/tracking without this check.

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X, Settings2 } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type ConsentState = {
  essential: true;
  analytics: boolean;
  preferences: boolean;
};

type ConsentCategory = "analytics" | "preferences";

function getCookieConsent(): ConsentState | null {
  try {
    const match = document.cookie.match(/(?:^|; )cookie_consent=([^;]*)/);
    if (!match) return null;
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/**
 * Returns true only if the user has given consent for the specified category.
 * Call this before firing any non-essential cookie or tracking script.
 *
 * @example
 *   if (hasConsent('analytics')) { initAnalytics(); }
 */
export function hasConsent(category: ConsentCategory): boolean {
  const consent = getCookieConsent();
  if (!consent) return false;
  return consent[category] === true;
}

function setCookieConsent(consent: ConsentState) {
  const value = encodeURIComponent(JSON.stringify(consent));
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `cookie_consent=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [preferences, setPreferences] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  function acceptAll() {
    const consent: ConsentState = { essential: true, analytics: true, preferences: true };
    setCookieConsent(consent);
    setVisible(false);
  }

  function rejectNonEssential() {
    const consent: ConsentState = { essential: true, analytics: false, preferences: false };
    setCookieConsent(consent);
    setVisible(false);
  }

  function savePreferences() {
    const consent: ConsentState = { essential: true, analytics, preferences };
    setCookieConsent(consent);
    setVisible(false);
    setShowManage(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Manage Preferences Modal */}
          <AnimatePresence>
            {showManage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) setShowManage(false); }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl"
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <Settings2 size={18} className="text-primary" />
                      <h2 className="text-base font-bold">Cookie Preferences</h2>
                    </div>
                    <button onClick={() => setShowManage(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="px-5 py-4 space-y-4">
                    {/* Essential */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">Essential</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Required for login, session management, and core platform functionality. Cannot be disabled.</p>
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-10 h-5 bg-primary rounded-full flex items-center justify-end px-0.5 opacity-50 cursor-not-allowed">
                          <div className="w-4 h-4 bg-white rounded-full" />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border/40" />

                    {/* Analytics */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">Analytics</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Anonymised usage data to help us improve the platform. No data is shared with advertisers.</p>
                      </div>
                      <button
                        onClick={() => setAnalytics(a => !a)}
                        className={cn("flex-shrink-0 mt-0.5 w-10 h-5 rounded-full flex items-center transition-all duration-200", analytics ? "bg-primary justify-end px-0.5" : "bg-muted/60 justify-start px-0.5")}
                      >
                        <div className="w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                    </div>

                    <div className="border-t border-border/40" />

                    {/* Preferences */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">Preferences</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Remembers your UI settings such as sidebar state and layout preferences across sessions.</p>
                      </div>
                      <button
                        onClick={() => setPreferences(p => !p)}
                        className={cn("flex-shrink-0 mt-0.5 w-10 h-5 rounded-full flex items-center transition-all duration-200", preferences ? "bg-primary justify-end px-0.5" : "bg-muted/60 justify-start px-0.5")}
                      >
                        <div className="w-4 h-4 bg-white rounded-full shadow" />
                      </button>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <button
                      onClick={savePreferences}
                      className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
                    >
                      Save my preferences
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Banner */}
          {!showManage && (
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[9998] md:bottom-4 md:left-4 md:right-auto md:max-w-sm"
            >
              <div className="bg-card border border-border/80 md:rounded-2xl shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:pb-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Cookie size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">We use cookies</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Essential cookies keep you logged in. We'd also like to set optional analytics cookies.{" "}
                      <Link href="/cookies">
                        <span className="text-primary hover:underline cursor-pointer">Cookie Policy</span>
                      </Link>
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={acceptAll}
                    className="w-full py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Accept All
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={rejectNonEssential}
                      className="flex-1 py-2 border border-border text-muted-foreground text-sm font-semibold rounded-xl hover:bg-muted/40 hover:text-foreground transition-colors"
                    >
                      Reject Non-Essential
                    </button>
                    <button
                      onClick={() => setShowManage(true)}
                      className="flex-1 py-2 border border-border text-muted-foreground text-sm font-semibold rounded-xl hover:bg-muted/40 hover:text-foreground transition-colors"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
