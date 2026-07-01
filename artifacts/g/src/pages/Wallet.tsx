import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion } from "framer-motion";
import { useGetWallet, useGetTransactions, useDepositFunds, useWithdrawFunds, useSendTip, getGetWalletQueryKey, getGetTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, Zap, ArrowLeftRight, Search, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, any> = {
  deposit: ArrowDownLeft,
  withdrawal: ArrowUpRight,
  tip: Zap,
  purchase: ArrowLeftRight,
  fee: ArrowUpRight,
};

const TYPE_COLORS: Record<string, string> = {
  deposit: "text-green-500",
  withdrawal: "text-red-400",
  tip: "text-primary",
  purchase: "text-amber-400",
  fee: "text-muted-foreground",
};

export default function Wallet() {
  const isAuthed = useRequireAuth();

  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"overview" | "deposit" | "withdraw" | "tip">("overview");
  const [amount, setAmount] = useState("");
  const [tipUsername, setTipUsername] = useState("");
  const [tipRecipientId, setTipRecipientId] = useState<number | null>(null);
  const [tipRecipientName, setTipRecipientName] = useState("");
  const [tipMsg, setTipMsg] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const { data: wallet, isLoading } = useGetWallet({
    query: { queryKey: getGetWalletQueryKey() }
  });
  const { data: txData } = useGetTransactions({ limit: 20, offset: 0 }, {
    query: { queryKey: getGetTransactionsQueryKey({ limit: 20, offset: 0 }) }
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
  };

  const deposit = useDepositFunds({
    mutation: {
      onSuccess: () => { setActionSuccess("Deposit successful!"); setAmount(""); invalidate(); },
      onError: (e: any) => setActionError(e?.data?.error || "Deposit failed"),
    }
  });

  const withdraw = useWithdrawFunds({
    mutation: {
      onSuccess: () => { setActionSuccess("Withdrawal initiated!"); setAmount(""); invalidate(); },
      onError: (e: any) => setActionError(e?.data?.error || "Withdrawal failed"),
    }
  });

  const sendTip = useSendTip({
    mutation: {
      onSuccess: () => {
        setActionSuccess("Tip sent!");
        setAmount("");
        setTipUsername("");
        setTipRecipientId(null);
        setTipRecipientName("");
        setTipMsg("");
        invalidate();
      },
      onError: (e: any) => setActionError(e?.data?.error || "Tip failed"),
    }
  });

  const w = wallet as any;
  const txs = Array.isArray(txData) ? txData : [];

  async function lookupUser() {
    if (!tipUsername.trim()) return;
    setLookingUp(true);
    setActionError("");
    setTipRecipientId(null);
    setTipRecipientName("");
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(tipUsername.trim())}`);
      if (!res.ok) { setActionError("User not found"); setLookingUp(false); return; }
      const user = await res.json();
      setTipRecipientId(user.id);
      setTipRecipientName(user.displayName || user.username);
    } catch {
      setActionError("Failed to look up user");
    }
    setLookingUp(false);
  }

  function handleAction(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");
    setActionSuccess("");
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setActionError("Enter a valid amount"); return; }

    if (tab === "deposit") deposit.mutate({ data: { amount: amt } });
    else if (tab === "withdraw") withdraw.mutate({ data: { amount: amt } });
    else if (tab === "tip") {
      if (!tipRecipientId) { setActionError("Look up a valid recipient first"); return; }
      sendTip.mutate({ data: { recipientId: tipRecipientId, amount: amt, message: tipMsg || undefined } });
    }
  }

  if (!isAuthed) return null;
  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-bold mb-6 flex items-center gap-2">
        <WalletIcon size={20} className="text-primary" />
        Wallet
      </h1>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-36 bg-muted rounded-2xl" />
          <div className="h-4 bg-muted rounded w-32" />
        </div>
      ) : (
        <>
          {/* Balance card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 rounded-2xl p-6 mb-6 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-8 translate-x-8" />
            <p className="text-sm text-muted-foreground mb-1">Available balance</p>
            <p className="text-5xl font-black text-foreground mb-4" data-testid="wallet-balance">
              ${(w?.balance ?? 0).toFixed(2)}
            </p>
            <div className="flex gap-6 text-xs text-muted-foreground">
              <div>
                <p className="text-green-400 font-semibold text-sm">${(w?.totalEarned ?? 0).toFixed(2)}</p>
                <p>Total earned</p>
              </div>
              <div>
                <p className="text-red-400 font-semibold text-sm">${(w?.totalSpent ?? 0).toFixed(2)}</p>
                <p>Total spent</p>
              </div>
            </div>
          </motion.div>

          {/* Action tabs */}
          <div className="flex gap-1 mb-5 bg-muted/40 p-1 rounded-xl w-fit">
            {[
              { key: "overview", label: "History" },
              { key: "deposit", label: "Deposit" },
              { key: "withdraw", label: "Withdraw" },
              { key: "tip", label: "Tip" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key as any); setActionError(""); setActionSuccess(""); }}
                data-testid={`wallet-tab-${key}`}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div>
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">Transaction history</h2>
              {txs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm bg-card border border-card-border rounded-xl">
                  No transactions yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {txs.map((tx: any) => {
                    const Icon = TYPE_ICONS[tx.type] ?? ArrowLeftRight;
                    const colorCls = TYPE_COLORS[tx.type] ?? "text-foreground";
                    const isCredit = tx.type === "deposit" || tx.type === "tip";
                    return (
                      <div key={tx.id} className="flex items-center gap-3 p-3 bg-card border border-card-border rounded-xl" data-testid="transaction-item">
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-muted", colorCls)}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description || tx.type}</p>
                          <p className="text-xs text-muted-foreground">{tx.createdAt ? formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true }) : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("text-sm font-bold", isCredit ? "text-green-400" : "text-red-400")}>
                            {isCredit ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                          </p>
                          {Number(tx.fee) > 0 && <p className="text-xs text-muted-foreground">fee ${Number(tx.fee).toFixed(2)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : tab === "deposit" ? (
            <div className="bg-card border border-card-border rounded-xl p-5">
              <div className="py-10 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-1">
                  <ArrowDownLeft size={22} className="text-muted-foreground/40" />
                </div>
                <p className="font-semibold">Deposits coming soon</p>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                  Connect your payment method to enable deposits. CCBill integration is currently in progress.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAction} className="space-y-4 bg-card border border-card-border rounded-xl p-5">
              {actionError && <div className="text-destructive text-sm bg-destructive/10 border border-destructive/30 px-4 py-3 rounded-lg">{actionError}</div>}
              {actionSuccess && <div className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 px-4 py-3 rounded-lg">{actionSuccess}</div>}

              <div>
                <label className="block text-sm font-medium mb-1.5">Amount (USD)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  data-testid="wallet-amount-input"
                  placeholder="0.00"
                  className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {tab === "tip" && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Recipient username</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                        <input
                          type="text"
                          value={tipUsername}
                          onChange={e => { setTipUsername(e.target.value); setTipRecipientId(null); setTipRecipientName(""); }}
                          data-testid="tip-recipient-input"
                          placeholder="username"
                          className="w-full bg-input border border-border rounded-lg pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={lookupUser}
                        disabled={lookingUp || !tipUsername.trim()}
                        data-testid="lookup-user-button"
                        className="flex items-center gap-1.5 px-3 py-2 bg-muted text-foreground text-sm font-medium rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
                      >
                        <Search size={14} />
                        {lookingUp ? "..." : "Find"}
                      </button>
                    </div>
                    {tipRecipientId && (
                      <div className="mt-2 flex items-center gap-1.5 text-sm text-green-400">
                        <CheckCircle size={14} />
                        <span>Found: <strong>{tipRecipientName}</strong></span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Message (optional)</label>
                    <input
                      type="text"
                      value={tipMsg}
                      onChange={e => setTipMsg(e.target.value)}
                      data-testid="tip-message-input"
                      placeholder="Say something..."
                      className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={deposit.isPending || withdraw.isPending || sendTip.isPending || (tab === "tip" && !tipRecipientId)}
                data-testid="wallet-action-submit"
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 capitalize"
              >
                {tab === "withdraw" ? "Withdraw funds" : "Send tip"}
              </button>
              {tab === "withdraw" && <p className="text-xs text-muted-foreground text-center">2% withdrawal fee applies</p>}
              {tab === "tip" && <p className="text-xs text-muted-foreground text-center">5% platform fee applies</p>}
            </form>
          )}
        </>
      )}
    </div>
  );
}
