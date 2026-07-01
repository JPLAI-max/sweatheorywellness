import { Link } from "wouter";
import { motion } from "framer-motion";
import { Avatar } from "./Avatar";
import { useFollowUser, useUnfollowUser } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { TipButton } from "./TipModal";

interface UserSummary {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  followersCount?: number;
  isFollowing?: boolean;
}

export function UserCard({ user }: { user: UserSummary }) {
  const { user: me } = useCurrentUser();
  const [following, setFollowing] = useState(user.isFollowing ?? false);

  const followMut = useFollowUser();
  const unfollowMut = useUnfollowUser();

  const isMe = me && (me as any).id === user.id;

  function toggleFollow(e: React.MouseEvent) {
    e.preventDefault();
    if (!me) return;
    if (following) {
      setFollowing(false);
      unfollowMut.mutate({ userId: user.id });
    } else {
      setFollowing(true);
      followMut.mutate({ userId: user.id });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="user-card"
    >
      <Link href={`/profile/${user.username}`}>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-card-border hover:border-primary/30 transition-all cursor-pointer group">
          <Avatar user={user} size="md" showVerified />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">{user.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
            {user.followersCount !== undefined && (
              <p className="text-xs text-muted-foreground mt-0.5">{user.followersCount.toLocaleString()} followers</p>
            )}
          </div>
          {me && !isMe && (
            <div className="flex items-center gap-1.5" onClick={e => e.preventDefault()}>
              <TipButton
                recipientId={user.id}
                recipientName={user.displayName}
                trigger={(open) => (
                  <button onClick={open} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors border border-border text-amber-400 hover:bg-amber-400/10 hover:border-amber-400/50">
                    💰
                  </button>
                )}
              />
              <button
                onClick={toggleFollow}
                data-testid="follow-button"
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border",
                  following
                    ? "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                    : "border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                )}
              >
                {following ? "Following" : "Follow"}
              </button>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
