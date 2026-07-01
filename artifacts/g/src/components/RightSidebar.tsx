import { Link } from "wouter";
import { useState } from "react";
import { Radio, Users, X, BadgeCheck } from "lucide-react";
import { Avatar } from "./Avatar";
import {
  useGetSuggestedUsers, useFollowUser, useUnfollowUser,
  useListStreams, getGetSuggestedUsersQueryKey, getListStreamsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";

function StoriesRow() {
  const { user } = useCurrentUser();
  const { data } = useGetSuggestedUsers({ limit: 6 }, {
    query: { staleTime: 120000, queryKey: getGetSuggestedUsersQueryKey({ limit: 6 }) }
  });
  const suggestions = Array.isArray(data) ? (data as any[]) : [];

  const ringColors = [
    "ring-blue-500", "ring-purple-500", "ring-pink-500",
    "ring-orange-500", "ring-green-500", "ring-red-500",
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground">Stories</h3>
        <Link href="/explore">
          <span className="text-xs text-primary hover:underline cursor-pointer">See all</span>
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 -mx-1 scrollbar-none">
        {user && (
          <Link href={`/profile/${(user as any).username}`}>
            <div className="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0 w-14">
              <div className="relative">
                <div className="w-12 h-12 rounded-full ring-2 ring-primary ring-offset-2 ring-offset-background overflow-hidden">
                  <Avatar user={user as any} fill />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                  <span className="text-[9px] text-white font-bold leading-none">+</span>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground text-center truncate w-full">Your story</span>
            </div>
          </Link>
        )}
        {suggestions.slice(0, 5).map((u: any, i: number) => (
          <Link key={u.id} href={`/profile/${u.username}`}>
            <div className="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0 w-14">
              <div className={cn("w-12 h-12 rounded-full ring-2 ring-offset-2 ring-offset-background overflow-hidden", ringColors[i % ringColors.length])}>
                <Avatar user={u} fill />
              </div>
              <span className="text-[10px] text-muted-foreground text-center truncate w-full">
                {u.displayName?.split(" ")[0] ?? u.username}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LiveNow() {
  const { data } = useListStreams({ limit: 5 }, {
    query: { staleTime: 30000, queryKey: getListStreamsQueryKey({ limit: 5 }), refetchInterval: 60000 }
  });
  const streams = (Array.isArray(data) ? (data as any[]) : []).filter((s: any) => s.status === "live").slice(0, 4);
  if (streams.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          Live Now
        </h3>
        <Link href="/explore">
          <span className="text-xs text-primary hover:underline cursor-pointer">See all</span>
        </Link>
      </div>
      <div className="space-y-3">
        {streams.map((s: any) => (
          <Link key={s.id} href={`/stream/${s.id}`}>
            <div className="flex gap-3 cursor-pointer group">
              <div className="relative flex-shrink-0 w-24 rounded-lg overflow-hidden bg-zinc-800" style={{ aspectRatio: "16/9" }}>
                {s.thumbnailUrl ? (
                  <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center">
                    <Radio size={14} className="text-zinc-500" />
                  </div>
                )}
                <div className="absolute top-1 left-1 bg-red-600 text-white text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wide flex items-center gap-0.5">
                  <span className="w-1 h-1 bg-white rounded-full animate-pulse" /> Live
                </div>
                <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Users size={7} /> {(s.viewerCount ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors leading-tight mb-0.5">{s.title}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-0.5">
                  <span className="truncate">{s.host?.displayName ?? s.host?.username}</span>
                  {s.host?.isVerified && <BadgeCheck size={10} className="text-primary flex-shrink-0" />}
                </p>
                {s.category && (
                  <div className="flex gap-1 flex-wrap">
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{s.category}</span>
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PeopleYouMayKnow() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { data } = useGetSuggestedUsers({ limit: 5 }, {
    query: { enabled: !!user, staleTime: 120000, queryKey: getGetSuggestedUsersQueryKey({ limit: 5 }) }
  });
  const suggestions = Array.isArray(data) ? (data as any[]) : [];
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [followedIds, setFollowedIds] = useState<Set<number>>(new Set());

  const followMut = useFollowUser({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSuggestedUsersQueryKey() }) } });
  const unfollowMut = useUnfollowUser({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSuggestedUsersQueryKey() }) } });

  const visible = suggestions.filter((u: any) => !dismissed.has(u.id));
  if (!user || visible.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground">People you may know</h3>
        <Link href="/explore">
          <span className="text-xs text-primary hover:underline cursor-pointer">See all</span>
        </Link>
      </div>
      <div className="space-y-3">
        {visible.slice(0, 4).map((u: any) => {
          const isFollowing = followedIds.has(u.id) || u.isFollowing;
          return (
            <div key={u.id} className="flex items-center gap-2.5">
              <Link href={`/profile/${u.username}`}>
                <div className="flex-shrink-0 cursor-pointer"><Avatar user={u} size="sm" showVerified /></div>
              </Link>
              <Link href={`/profile/${u.username}`}>
                <div className="flex-1 min-w-0 cursor-pointer">
                  <p className="text-xs font-semibold truncate hover:text-primary transition-colors leading-tight">{u.displayName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">@{u.username}</p>
                </div>
              </Link>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    if (isFollowing) {
                      setFollowedIds(prev => { const s = new Set(prev); s.delete(u.id); return s; });
                      unfollowMut.mutate({ userId: u.id });
                    } else {
                      setFollowedIds(prev => new Set(prev).add(u.id));
                      followMut.mutate({ userId: u.id });
                    }
                  }}
                  className={cn(
                    "text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                    isFollowing
                      ? "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                      : "border-primary/40 text-primary bg-primary/5 hover:bg-primary hover:text-primary-foreground"
                  )}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
                <button onClick={() => setDismissed(prev => new Set(prev).add(u.id))}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RightSidebar() {
  return (
    <div className="flex flex-col gap-6 px-4 py-5 overflow-y-auto h-full scrollbar-none">
      <StoriesRow />
      <LiveNow />
      <PeopleYouMayKnow />
    </div>
  );
}
