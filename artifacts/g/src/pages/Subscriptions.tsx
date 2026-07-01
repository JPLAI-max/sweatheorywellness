import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Avatar } from "@/components/Avatar";
import { Crown, Calendar, DollarSign, Loader2, X, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

interface Subscription {
  id: number;
  creatorId: number;
  price: number;
  status: string;
  currentPeriodEnd: string;
  createdAt: string;
  creator: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isVerified?: boolean;
  } | null;
}

function useSubscriptions() {
  return useQuery<Subscription[]>({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/subscriptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load subscriptions");
      return res.json();
    },
  });
}

function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creatorId: number) => {
      const res = await fetch(`/api/users/${creatorId}/subscribe`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to cancel");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export default function Subscriptions() {
  const { user } = useCurrentUser();
  const { data: subs, isLoading } = useSubscriptions();
  const cancel = useCancelSubscription();
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function handleCancel(creatorId: number) {
    setCancelling(creatorId);
    try {
      await cancel.mutateAsync(creatorId);
    } finally {
      setCancelling(null);
      setConfirmId(null);
    }
  }

  if (!user) {
    return (
      <div className="px-4 py-16 text-center text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">Sign in</Link> to view your subscriptions.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20 md:pb-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Star size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">My Subscriptions</h1>
            <p className="text-xs text-muted-foreground">Creators you support each month</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : !subs || subs.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Crown size={24} className="text-muted-foreground" />
            </div>
            <p className="font-semibold mb-1">No active subscriptions</p>
            <p className="text-sm text-muted-foreground mb-5">
              Subscribe to creators to support them and unlock exclusive content.
            </p>
            <Link href="/explore">
              <button className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
                Discover creators
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {subs.map(sub => (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4"
              >
                <Link href={`/profile/${sub.creator?.username}`}>
                  <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 cursor-pointer">
                    <Avatar user={sub.creator as any} fill />
                  </div>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${sub.creator?.username}`}>
                    <p className="font-semibold text-sm truncate hover:text-primary transition-colors cursor-pointer">
                      {sub.creator?.displayName ?? sub.creator?.username ?? "Unknown"}
                    </p>
                  </Link>
                  <p className="text-xs text-muted-foreground">@{sub.creator?.username}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                      <DollarSign size={10} />
                      ${sub.price}/mo
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar size={10} />
                      Renews {format(new Date(sub.currentPeriodEnd), "MMM d")}
                    </span>
                  </div>
                </div>

                {confirmId === sub.creatorId ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">Cancel?</span>
                    <button
                      onClick={() => handleCancel(sub.creatorId)}
                      disabled={cancelling === sub.creatorId}
                      className="px-3 py-1.5 bg-destructive/10 text-destructive text-xs font-semibold rounded-lg hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
                    >
                      {cancelling === sub.creatorId ? <Loader2 size={12} className="animate-spin" /> : "Yes, cancel"}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <X size={14} className="text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(sub.creatorId)}
                    className="flex-shrink-0 text-xs text-muted-foreground hover:text-destructive border border-border hover:border-destructive/40 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </motion.div>
            ))}

            <p className="text-xs text-muted-foreground text-center pt-2">
              Subscriptions renew automatically from your wallet balance.{" "}
              <Link href="/wallet" className="text-primary hover:underline">Top up wallet</Link>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
