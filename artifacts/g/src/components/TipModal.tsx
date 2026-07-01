import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, X, Zap, Check } from "lucide-react";
import { useSendTip, useGetWallet, getGetWalletQueryKey } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const PRESETS = [1, 5, 10, 25];

interface Props {
  recipientId: number;
  recipientName: string;
  /** Render prop — receives onClick handler to open the modal */
  trigger?: (open: () => void) => React.ReactNode;
}

export function TipButton({ recipientId, recipientName, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const { user } = useCurrentUser();
  const [, setLocation] = useLocation();

  function handleOpen() {
    if (!user) { setLocation("/login"); return; }
    setOpen(true);
  }

  return (
    <>
      {trigger ? (
        trigger(handleOpen)
      ) : (
        <button
          onClick={handleOpen}
          data-testid="tip-button"
          title={`Tip ${recipientName}`}
          className="flex items-center gap-1 p-1.5 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
        >
          <Gift size={15} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <TipModal
            recipientId={recipientId}
            recipientName={recipientName}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function TipModal({ recipientId, recipientName, onClose }: { recipientId: number; recipientName: string; onClose: () => void }) {
  const [amount, setAmount] = useState<number>(5);
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const { data: walletData } = useGetWallet({ query: { staleTime: 30000, queryKey: getGetWalletQueryKey() } });
  const balance = Number((walletData as any)?.balance ?? 0);

  const finalAmount = useCustom ? parseFloat(custom) || 0 : amount;
  const fee = Number((finalAmount * 0.05).toFixed(2));
  const creatorReceives = Number((finalAmount - fee).toFixed(2));
  const canSubmit = finalAmount >= 0.5 && finalAmount <= balance;

  const sendTip = useSendTip({
    mutation: {
      onSuccess: () => { setDone(true); setTimeout(onClose, 2000); },
      onError: (err: any) => setError(err?.response?.data?.error ?? "Something went wrong"),
    }
  });

  function submit() {
    setError("");
    sendTip.mutate({ data: { recipientId, amount: finalAmount, message: message || undefined } });
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-sm bg-card border border-card-border rounded-2xl shadow-2xl overflow-hidden">
          {done ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                <Check size={26} className="text-green-400" />
              </div>
              <p className="font-bold text-lg mb-1">Tip sent!</p>
              <p className="text-sm text-muted-foreground">{recipientName} received ${creatorReceives.toFixed(2)}</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/15 flex items-center justify-center">
                    <Gift size={15} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Send a tip</p>
                    <p className="text-xs text-muted-foreground">to {recipientName}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={e => { e.preventDefault(); submit(); }} className="p-5 space-y-4">
                {/* Balance */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Your balance</span>
                  <span className="font-semibold text-foreground">${balance.toFixed(2)}</span>
                </div>

                {/* Preset amounts */}
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p}
                      onClick={() => { setUseCustom(false); setAmount(p); setCustom(""); }}
                      className={cn(
                        "py-2 rounded-xl text-sm font-bold border transition-colors",
                        !useCustom && amount === p
                          ? "bg-amber-400/15 border-amber-400/40 text-amber-400"
                          : "border-border text-muted-foreground hover:border-amber-400/30 hover:text-amber-300"
                      )}
                    >
                      ${p}
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={useCustom ? custom : ""}
                    onChange={e => { setUseCustom(true); setCustom(e.target.value); }}
                    onFocus={() => setUseCustom(true)}
                    placeholder="Custom amount"
                    className={cn(
                      "w-full bg-input border rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors",
                      useCustom ? "border-amber-400/40" : "border-border"
                    )}
                  />
                </div>

                {/* Message */}
                <input
                  type="text"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Add a message (optional)"
                  maxLength={100}
                  className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />

                {/* Fee breakdown */}
                {finalAmount > 0 && (
                  <div className="bg-muted/40 rounded-xl px-4 py-3 text-xs space-y-1.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tip amount</span><span>${finalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Platform fee (5%)</span><span>−${fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1.5 mt-1">
                      <span>Creator receives</span><span className="text-amber-400">${creatorReceives.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {error && <p className="text-xs text-destructive">{error}</p>}
                {finalAmount > 0 && finalAmount > balance && (
                  <p className="text-xs text-destructive">Insufficient balance — <a href="/wallet" className="underline">add funds</a></p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!canSubmit || sendTip.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Zap size={15} />
                  {sendTip.isPending ? "Sending..." : `Send $${finalAmount > 0 ? finalAmount.toFixed(2) : "0.00"}`}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
