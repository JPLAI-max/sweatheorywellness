import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
const MuxPlayer = lazy(() => import("@mux/mux-player-react"));
import { Link } from "wouter";
import { Heart, MessageCircle, Eye, MoreHorizontal, Trash2, Pencil, Bookmark, Repeat2, Share2, Check, Copy, Link2, Flag, EyeOff, ShieldAlert, X as XIcon, SmilePlus, Lock, DollarSign, Download, RefreshCw, Maximize2, ChevronLeft, ChevronRight, VideoOff, Settings, Pin, PinOff, Ban, Star, ExternalLink } from "lucide-react";
import { SweatheoryApprovedBadge } from "./SweatheoryApprovedBadge";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "./Avatar";
import { TipButton } from "./TipModal";
import { EditPostModal } from "./EditPostModal";
import {
  useLikePost, useUnlikePost, useDeletePost, useBookmarkPost, useUnbookmarkPost,
  useGetPostReactions, useAddReaction, useRemoveReaction,
  getListPostsQueryKey, getGetFeedQueryKey, getGetTrendingPostsQueryKey, getGetBookmarksQueryKey, getGetPostReactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { formatDistanceToNow } from "date-fns";

const REACTION_EMOJIS = [
  "❤️", "🔥", "😂", "😍", "👏", "💯", "✨", "🫶",
];

const REPORT_REASONS = [
  { value: "spam",             label: "Spam or misleading" },
  { value: "harassment",       label: "Harassment or bullying" },
  { value: "hate_speech",      label: "Hate speech" },
  { value: "illegal_content",  label: "Illegal content" },
  { value: "nsfw_unlabeled",   label: "Adult or sexual content" },
  { value: "violence",         label: "Violence or threats" },
  { value: "exploitation",     label: "Exploitation or trafficking" },
  { value: "nonconsensual_intimate", label: "Nonconsensual intimate content (TAKE IT DOWN Act)" },
  { value: "other",            label: "Other" },
];

interface Post {
  id: number;
  authorId: number;
  author: any;
  type: string;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  muxPlaybackId?: string;
  embedUrl?: string | null;
  hashtags: string[];
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  repostsCount?: number;
  isLiked: boolean;
  isBookmarked?: boolean;
  isReposted?: boolean;
  contentRating?: string;
  visibility?: string;
  isLocked?: boolean;
  price?: number | null;
  allowDownload?: boolean;
  downloadPrice?: number | null;
  isUnlocked?: boolean;
  displayAspect?: string | null;
  trimStart?: number | null;
  trimEnd?: number | null;
  mediaItems?: string[] | null;
  createdAt: string;
  scanStatus?: string;
  linkPreview?: { title: string; description: string | null; image: string | null; domain: string; url: string } | null;
  repostedBy?: { username: string; displayName: string; avatarUrl?: string | null };
}

function PhotoCarousel({ urls }: {
  urls: string[];
}) {
  const [index, setIndex] = useState(0);
  const count = urls.length;

  return (
    <div className="relative overflow-hidden select-none">
      <img
        src={urls[index]}
        alt=""
        className="w-full max-h-[560px] object-contain transition-all duration-300"
        draggable={false}
      />

      {/* Prev / next arrows */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-default"
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setIndex(i => Math.min(count - 1, i + 1))}
            disabled={index === count - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-default"
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Count badge */}
      {count > 1 && (
        <div className="absolute top-2 right-2 bg-black/60 text-white text-[11px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
          {index + 1} / {count}
        </div>
      )}

      {/* Dot indicators */}
      {count > 1 && count <= 12 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 pointer-events-none">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all pointer-events-auto",
                i === index ? "bg-white scale-110" : "bg-white/40 hover:bg-white/70"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PollCard({ caption }: { caption: string }) {
  const lines = caption.split("\n");
  const question = lines[0].replace("[POLL]", "").trim();
  const optLine = lines.find(l => l.startsWith("[OPTIONS]")) ?? "";
  const options = optLine.replace("[OPTIONS]", "").split("|").filter(Boolean);
  const [voted, setVoted] = useState<number | null>(null);
  const [votes, setVotes] = useState(() => options.map(() => Math.floor(Math.random() * 40)));

  function vote(i: number) {
    if (voted !== null) return;
    setVoted(i);
    setVotes(v => v.map((c, j) => j === i ? c + 1 : c));
  }

  const grandTotal = votes.reduce((a, b) => a + b, 0);

  return (
    <div className="px-4 pb-3 space-y-3">
      <p className="text-sm font-semibold">{question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          const pct = grandTotal > 0 ? Math.round((votes[i] / grandTotal) * 100) : 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => vote(i)}
              disabled={voted !== null}
              className={cn(
                "relative w-full text-left px-3 py-2.5 rounded-xl border text-sm font-medium overflow-hidden transition-colors",
                voted === null ? "border-border hover:border-primary/50 hover:bg-primary/5" :
                  voted === i ? "border-primary text-primary" : "border-border/40 text-muted-foreground"
              )}
            >
              {voted !== null && (
                <div
                  className={cn("absolute inset-0 rounded-xl transition-all", voted === i ? "bg-primary/15" : "bg-muted/30")}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between">
                <span>{opt}</span>
                {voted !== null && <span className="text-xs opacity-70">{pct}%</span>}
              </div>
            </button>
          );
        })}
      </div>
      {voted !== null && (
        <p className="text-xs text-muted-foreground">{grandTotal} votes</p>
      )}
    </div>
  );
}

const SHARE_PLATFORMS = [
  {
    id: "copy",
    label: "Copy link",
    icon: <Link2 size={14} />,
    color: "text-zinc-300",
    bg: "hover:bg-muted/60",
    action: (url: string) => { navigator.clipboard?.writeText(url); return true; },
  },
  {
    id: "twitter",
    label: "Twitter / X",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    color: "text-sky-400",
    bg: "hover:bg-sky-500/10",
    action: (url: string, text?: string) => {
      window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text ?? "")}`, "_blank");
      return false;
    },
  },
  {
    id: "reddit",
    label: "Reddit",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
    color: "text-orange-400",
    bg: "hover:bg-orange-500/10",
    action: (url: string, text?: string) => {
      window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text ?? "")}`, "_blank");
      return false;
    },
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
    color: "text-blue-400",
    bg: "hover:bg-blue-500/10",
    action: (url: string) => {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
      return false;
    },
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    color: "text-green-400",
    bg: "hover:bg-green-500/10",
    action: (url: string, text?: string) => {
      window.open(`https://wa.me/?text=${encodeURIComponent((text ? text + " " : "") + url)}`, "_blank");
      return false;
    },
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
    color: "text-pink-400",
    bg: "hover:bg-pink-500/10",
    action: (url: string, _text?: string) => {
      navigator.clipboard?.writeText(url);
      window.open("https://www.instagram.com/", "_blank");
      return true;
    },
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
    color: "text-sky-400",
    bg: "hover:bg-sky-500/10",
    action: (url: string, text?: string) => {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text ?? "")}`, "_blank");
      return false;
    },
  },
  {
    id: "snapchat",
    label: "Snapchat",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.479-.105l-.015-.509c-.106-1.629-.233-3.654.297-4.847C7.853 1.07 11.206.793 12.206.793z" />
      </svg>
    ),
    color: "text-yellow-400",
    bg: "hover:bg-yellow-500/10",
    action: (url: string) => {
      window.open(`https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`, "_blank");
      return false;
    },
  },
];

function VideoPlayer({ post }: {
  post: Post;
}) {
  const muxRef = useRef<any>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [muxError, setMuxError] = useState(false);

  const hasAspect = !!(post.displayAspect && post.displayAspect !== "auto");

  const containerStyle: React.CSSProperties = hasAspect
    ? { aspectRatio: post.displayAspect!.replace("/", " / "), overflow: "hidden", background: "#000" }
    : { position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", background: "#000" };

  const playerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
  };

  const startTime = post.trimStart ?? undefined;

  const handleTimeUpdate = useCallback((e: Event) => {
    if (!post.trimEnd) return;
    const video = (e.target as any)?.media as HTMLVideoElement | undefined;
    if (video && video.currentTime >= post.trimEnd) {
      video.currentTime = post.trimStart ?? 0;
      video.pause();
    }
  }, [post.trimStart, post.trimEnd]);

  return (
    <>
      <div className="relative group" style={containerStyle}>
        {post.muxPlaybackId ? (
          muxError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900">
              <VideoOff size={28} className="text-zinc-600" />
              <p className="text-zinc-500 text-xs font-medium">Video unavailable</p>
            </div>
          ) : (
          <Suspense fallback={<div className="w-full h-48 bg-black animate-pulse" />}>
            <MuxPlayer
              ref={muxRef}
              playbackId={post.muxPlaybackId}
              streamType="on-demand"
              autoPlay="muted"
              loop
              startTime={startTime}
              style={playerStyle as any}
              onTimeUpdate={handleTimeUpdate as any}
              onError={() => setMuxError(true)}
            />
          </Suspense>
          )
        ) : (
          <video
            src={post.mediaUrl}
            controls
            loop
            className="absolute inset-0 w-full h-full bg-black object-contain block"
            poster={post.thumbnailUrl ?? undefined}
          />
        )}

        {/* Fullscreen button */}
        {post.muxPlaybackId && (
          <button
            onClick={() => setFullscreen(true)}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            aria-label="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {fullscreen && post.muxPlaybackId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            onClick={() => setFullscreen(false)}
          >
            <button
              onClick={() => setFullscreen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <XIcon size={20} />
            </button>
            <Suspense fallback={null}>
              <MuxPlayer
                playbackId={post.muxPlaybackId}
                streamType="on-demand"
                autoPlay
                startTime={startTime}
                style={{ width: "100%", maxHeight: "100vh", display: "block" } as any}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function PostCard({ post, onDelete }: { post: Post; onDelete?: () => void }) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const dragOrigin = useRef({ x: 0, y: 0 });
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likesCount);
  const [bookmarked, setBookmarked] = useState(post.isBookmarked ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [reposted, setReposted] = useState(post.isReposted ?? false);
  const [repostCount, setRepostCount] = useState(post.repostsCount ?? 0);
  const [repostToast, setRepostToast] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [unlocked, setUnlocked] = useState(post.isUnlocked ?? false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [embedError, setEmbedError] = useState(false);
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const embedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start a timeout when a gif embed is present — mark as error if iframe never fires onLoad
  useEffect(() => {
    if (post.type === "gif" && post.embedUrl && !embedLoaded && !embedError) {
      embedTimeoutRef.current = setTimeout(() => setEmbedError(true), 10000);
    }
    return () => { if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current); };
  }, [post.type, post.embedUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const postUrl = typeof window !== "undefined"
    ? `${window.location.origin}/post/${post.id}`
    : `/post/${post.id}`;
  const shareText = post.caption?.slice(0, 100) ?? "";

  useEffect(() => {
    if (!showShareMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showShareMenu]);

  useEffect(() => {
    if (!showReactionPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showReactionPicker]);

  const reactionsQuery = useGetPostReactions(post.id, {
    query: { staleTime: 30000, queryKey: getGetPostReactionsQueryKey(post.id) }
  });
  const serverCounts: Record<string, number> = (reactionsQuery.data as any)?.counts ?? {};
  const serverUserReactions: string[] = (reactionsQuery.data as any)?.userReactions ?? [];

  const [optimisticReactions, setOptimisticReactions] = useState<{ counts: Record<string, number>; userReactions: string[] } | null>(null);

  const reactionCounts = optimisticReactions?.counts ?? serverCounts;
  const userReactions = optimisticReactions?.userReactions ?? serverUserReactions;
  const hasAnyReactions = Object.keys(reactionCounts).filter(k => reactionCounts[k] > 0).length > 0;

  const invalidateReactions = () => {
    queryClient.invalidateQueries({ queryKey: getGetPostReactionsQueryKey(post.id) });
    setOptimisticReactions(null);
  };
  const addReaction = useAddReaction({ mutation: { onSuccess: invalidateReactions, onError: () => setOptimisticReactions(null) } });
  const removeReaction = useRemoveReaction({ mutation: { onSuccess: invalidateReactions, onError: () => setOptimisticReactions(null) } });

  function toggleReaction(emoji: string) {
    if (!user) return;
    const baseCounts = optimisticReactions?.counts ?? serverCounts;
    const baseUserReactions = optimisticReactions?.userReactions ?? serverUserReactions;
    const isReacted = baseUserReactions.includes(emoji);

    if (isReacted) {
      setOptimisticReactions({
        counts: { ...baseCounts, [emoji]: Math.max(0, (baseCounts[emoji] ?? 1) - 1) },
        userReactions: baseUserReactions.filter(e => e !== emoji),
      });
      removeReaction.mutate({ postId: post.id, emoji: encodeURIComponent(emoji) });
    } else {
      setOptimisticReactions({
        counts: { ...baseCounts, [emoji]: (baseCounts[emoji] ?? 0) + 1 },
        userReactions: [...baseUserReactions, emoji],
      });
      addReaction.mutate({ postId: post.id, data: { emoji } });
    }
    setShowReactionPicker(false);
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
  };

  const likePost = useLikePost({ mutation: { onSuccess: invalidate } });
  const unlikePost = useUnlikePost({ mutation: { onSuccess: invalidate } });
  const deletePost = useDeletePost({ mutation: { onSuccess: () => { onDelete?.(); invalidate(); } } });
  const bookmarkPost = useBookmarkPost({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBookmarksQueryKey() }) } });
  const unbookmarkPost = useUnbookmarkPost({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBookmarksQueryKey() }) } });

  function toggleLike() {
    if (!user) return;
    if (liked) { setLiked(false); setLikeCount(c => c - 1); unlikePost.mutate({ postId: post.id }); }
    else { setLiked(true); setLikeCount(c => c + 1); likePost.mutate({ postId: post.id }); }
  }

  function toggleBookmark() {
    if (!user) return;
    if (bookmarked) { setBookmarked(false); unbookmarkPost.mutate({ postId: post.id }); }
    else { setBookmarked(true); bookmarkPost.mutate({ postId: post.id }); }
  }

  async function handleRepost() {
    if (!user || reposting) return;
    setReposting(true);
    try {
      const next = !reposted;
      const res = await fetch(`/api/posts/${post.id}/repost`, {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setReposted(next);
        setRepostCount(data.repostsCount ?? (next ? repostCount + 1 : Math.max(0, repostCount - 1)));
        if (next) {
          setRepostToast(true);
          setTimeout(() => setRepostToast(false), 2000);
        }
      }
    } finally {
      setReposting(false);
    }
  }

  function handleSharePlatform(platform: typeof SHARE_PLATFORMS[number]) {
    const copied = platform.action(postUrl, shareText);
    if (copied) {
      setCopiedLink(true);
      setTimeout(() => { setCopiedLink(false); setShowShareMenu(false); }, 1500);
    } else {
      setShowShareMenu(false);
    }
  }

  async function handleUnlock() {
    if (unlocking || !user) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/unlock`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setUnlocked(true);
      } else if (res.status === 409) {
        setUnlocked(true);
      } else {
        setUnlockError(data.error ?? "Unlock failed");
      }
    } catch {
      setUnlockError("Network error");
    } finally {
      setUnlocking(false);
    }
  }

  const isOwner = user && (user as any).id === post.authorId;
  const isPaidLocked = !isOwner && !!post.price && Number(post.price) > 0 && !unlocked;
  const timeAgo = post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : "";

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-card border border-card-border rounded-2xl hover:border-border/80 transition-colors overflow-hidden"
      data-testid="post-card"
      onMouseDown={(e) => { dragOrigin.current = { x: e.clientX, y: e.clientY }; }}
      onClickCapture={(e) => {
        const dx = Math.abs(e.clientX - dragOrigin.current.x);
        const dy = Math.abs(e.clientY - dragOrigin.current.y);
        if (dx > 5 || dy > 5) { e.stopPropagation(); e.preventDefault(); }
      }}
    >
      {/* Pending scan banner — only shown to the post author */}
      {post.scanStatus === 'pending' && user?.id === post.authorId && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-0">
          <RefreshCw size={12} className="text-amber-400 animate-spin flex-shrink-0" />
          <span className="text-xs text-amber-400 font-medium">Reviewing content — will appear publicly once complete</span>
        </div>
      )}

      {/* Repost attribution banner */}
      {post.repostedBy && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-0">
          <Repeat2 size={13} className="text-green-500 flex-shrink-0" />
          <Link href={`/profile/${post.repostedBy.username}`}>
            <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <span className="font-semibold text-green-500">@{post.repostedBy.username}</span> reposted
            </span>
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link href={`/profile/${post.author?.username}`}>
          <div className="flex items-center gap-3 cursor-pointer group">
            <Avatar user={post.author} size="sm" />
            <div>
              <div className="flex items-center gap-1.5 leading-tight">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors">{post.author?.displayName}</p>
                {post.author?.isVerified && <SweatheoryApprovedBadge size="sm" />}
              </div>
              <p className="text-xs text-muted-foreground">@{post.author?.username} · {timeAgo}</p>
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          {!isOwner && post.author?.id && (
            <TipButton recipientId={post.author.id} recipientName={post.author.displayName ?? post.author.username} />
          )}
          {!isOwner && user && (
            <button
              onClick={() => { setShowReport(true); setReportSubmitted(false); setReportReason(""); }}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Report post"
            >
              <Flag size={13} />
            </button>
          )}
          {(user as any)?.isAdmin && (
            <div className="relative">
              <button
                onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                className="p-1.5 rounded-lg text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                title="Admin actions"
              >
                <Settings size={14} />
              </button>
              {adminMenuOpen && (
                <div className="absolute right-0 top-9 bg-popover border border-border rounded-xl shadow-xl z-20 min-w-[185px] overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-border/60">
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Admin Controls</p>
                  </div>
                  <button
                    onClick={async () => {
                      setAdminMenuOpen(false);
                      await fetch(`/api/admin/posts/${post.id}/pin`, { method: "POST", credentials: "include" });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Pin size={12} className="text-amber-400" /> Pin post
                  </button>
                  <button
                    onClick={async () => {
                      setAdminMenuOpen(false);
                      await fetch(`/api/admin/posts/${post.id}/unpin`, { method: "POST", credentials: "include" });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <PinOff size={12} className="text-muted-foreground" /> Unpin post
                  </button>
                  <button
                    onClick={async () => {
                      setAdminMenuOpen(false);
                      await fetch(`/api/admin/posts/${post.id}/feature`, { method: "POST", credentials: "include" });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Star size={12} className="text-amber-400" /> Feature post
                  </button>
                  <button
                    onClick={async () => {
                      setAdminMenuOpen(false);
                      await fetch(`/api/admin/posts/${post.id}/hide`, { method: "POST", credentials: "include" });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <EyeOff size={12} className="text-muted-foreground" /> Hide post
                  </button>
                  <a
                    href={`/admin?tab=reports&postId=${post.id}`}
                    onClick={() => setAdminMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <ShieldAlert size={12} className="text-amber-400" /> View in admin
                  </a>
                  <button
                    onClick={async () => {
                      setAdminMenuOpen(false);
                      if (confirm(`Ban user @${post.author?.username}?`)) {
                        await fetch(`/api/admin/users/${post.authorId}/ban`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Ban size={12} /> Ban author
                  </button>
                  <button
                    onClick={async () => {
                      setAdminMenuOpen(false);
                      if (confirm("Delete this post?")) {
                        await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE", credentials: "include" });
                        onDelete?.();
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 size={12} /> Delete post
                  </button>
                </div>
              )}
            </div>
          )}
          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                data-testid="post-menu-button"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 bg-popover border border-border rounded-xl shadow-xl z-10 min-w-[150px] overflow-hidden">
                  <button
                    onClick={() => { setEditModalOpen(true); setMenuOpen(false); }}
                    data-testid="edit-post-button"
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Pencil size={14} />
                    Edit post
                  </button>
                  <button
                    onClick={() => { deletePost.mutate({ postId: post.id }); setMenuOpen(false); }}
                    data-testid="delete-post-button"
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete post
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Paid locked post */}
      {isPaidLocked && (
        <div className="relative overflow-hidden">
          {(post.thumbnailUrl || post.mediaUrl) && (
            <div className="relative h-48 overflow-hidden">
              <img
                src={post.thumbnailUrl ?? post.mediaUrl}
                alt=""
                className="w-full h-full object-cover blur-2xl scale-110 opacity-60"
              />
              <div className="absolute inset-0 bg-background/50" />
            </div>
          )}
          <div className="px-4 py-5 text-center space-y-3">
            {post.caption && (
              <p className="text-sm text-muted-foreground/80 line-clamp-2 italic">{post.caption}</p>
            )}
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/25 flex items-center justify-center mx-auto">
              <DollarSign size={20} className="text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Premium {post.type === "photo" ? "photo" : post.type === "video" ? "video" : "content"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unlock to view full {post.type === "video" ? "video" : "content"}
                {post.allowDownload && " · download included"}
              </p>
            </div>
            {unlockError && (
              <p className="text-xs text-red-400 font-medium">{unlockError}</p>
            )}
            <button
              onClick={handleUnlock}
              disabled={unlocking || !user}
              className="inline-flex items-center gap-2 px-7 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-rose-500/20"
            >
              {unlocking ? (
                <><RefreshCw size={14} className="animate-spin" /> Processing…</>
              ) : (
                <><DollarSign size={14} /> Unlock · ${Number(post.price).toFixed(2)}</>
              )}
            </button>
            {!user && (
              <p className="text-xs text-muted-foreground">
                <Link href="/login"><span className="text-primary hover:text-primary/80 cursor-pointer">Sign in</span></Link> to unlock
              </p>
            )}
          </div>
        </div>
      )}

      {/* Locked post */}
      {post.isLocked && (
        <div className="relative overflow-hidden">
          {post.thumbnailUrl && (
            <div className="relative h-36 overflow-hidden">
              <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover blur-xl scale-110 opacity-50" />
              <div className="absolute inset-0 bg-background/70" />
            </div>
          )}
          <div className="px-4 py-5 text-center space-y-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Lock size={18} className="text-primary" />
            </div>
            {post.caption && (
              <div className="relative max-h-10 overflow-hidden">
                <p className="text-sm text-muted-foreground">{post.caption}</p>
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-card to-transparent" />
              </div>
            )}
            <p className="text-sm font-semibold text-foreground">
              {post.author?.subscriptionPrice
                ? `Subscribe to unlock this content`
                : "Followers-only content"}
            </p>
            <Link href={`/profile/${post.author?.username}`}>
              <button className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
                {post.author?.subscriptionPrice
                  ? `Subscribe · $${Number(post.author.subscriptionPrice).toFixed(2)}/mo`
                  : "View profile"}
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Poll post */}
      {!post.isLocked && !isPaidLocked && post.type === "text" && post.caption?.startsWith("[POLL]") ? (
        <PollCard caption={post.caption} />
      ) : (
        !post.isLocked && !isPaidLocked && post.caption && (
          <div className={cn("px-4", post.mediaUrl ? "pb-3" : "pb-1")}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.caption}</p>
            {post.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {post.hashtags.map(tag => (
                  <Link key={tag} href={`/hashtag/${tag}`}>
                    <span className="text-xs text-primary hover:text-primary/70 transition-colors cursor-pointer font-medium">#{tag}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Full-bleed media (single or carousel) */}
      {!post.isLocked && !isPaidLocked && post.type === "photo" && (() => {
        const photoUrls = post.mediaItems?.length ? post.mediaItems : (post.mediaUrl ? [post.mediaUrl] : []);
        if (photoUrls.length === 0) return null;
        return (
          <PhotoCarousel
            urls={photoUrls}
          />
        );
      })()}
      {!post.isLocked && !isPaidLocked && post.type === "video" && (post.muxPlaybackId || post.mediaUrl) && (
        <VideoPlayer post={post} />
      )}

      {/* GIF embed */}
      {!post.isLocked && !isPaidLocked && post.type === "gif" && post.embedUrl && (
        <div className="relative overflow-hidden rounded-none">
          {embedError ? (
            /* Fallback: GIF unavailable */
            <div
              className="relative aspect-video w-full flex flex-col items-center justify-center gap-2 bg-muted/60 border-y border-border/40"
              style={post.thumbnailUrl ? { backgroundImage: `url(${post.thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              {post.thumbnailUrl && <div className="absolute inset-0 bg-black/65" />}
              <div className="relative flex flex-col items-center gap-2 text-muted-foreground">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 opacity-60"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                <p className="text-xs font-semibold">GIF unavailable</p>
                <p className="text-[11px] opacity-60">This content may have been removed</p>
              </div>
            </div>
          ) : (
            <div className="aspect-video w-full transition-all duration-300">
              <iframe
                src={post.embedUrl}
                className="w-full h-full border-0"
                allowFullScreen
                scrolling="no"
                allow="autoplay; fullscreen"
                onLoad={() => {
                  setEmbedLoaded(true);
                  if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Link preview card */}
      {!post.isLocked && !isPaidLocked && post.type === "link" && post.linkPreview && (
        <div className="mx-4 mb-3">
          <a
            href={post.linkPreview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl overflow-hidden border border-border/60 hover:border-border transition-colors bg-muted/30 hover:bg-muted/50 group"
          >
            {post.linkPreview.image && (
              <div className="w-full aspect-[1.91/1] overflow-hidden bg-muted">
                <img
                  src={post.linkPreview.image}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <ExternalLink size={10} className="text-muted-foreground flex-shrink-0" />
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium truncate">{post.linkPreview.domain}</span>
              </div>
              <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{post.linkPreview.title}</p>
              {post.linkPreview.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{post.linkPreview.description}</p>
              )}
            </div>
          </a>
        </div>
      )}

      {/* Download button — shown after unlock when download is included */}
      {unlocked && post.allowDownload && post.mediaUrl && (
        <div className="px-4 pb-2">
          <a
            href={post.mediaUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/15 border border-cyan-500/20 px-3 py-1.5 rounded-xl transition-colors"
          >
            <Download size={13} />
            Download {post.type === "video" ? "video" : "photo"}
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 px-3 py-2.5">

        {/* Like */}
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={toggleLike}
          data-testid="like-button"
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-medium transition-colors",
            liked ? "text-red-500 bg-red-500/10" : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
          )}
        >
          <Heart size={16} className={cn("transition-all", liked && "fill-current")} />
          <span>{likeCount}</span>
        </motion.button>

        {/* Comment */}
        <Link href={`/post/${post.id}`}>
          <button
            data-testid="comment-button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <MessageCircle size={16} />
            <span>{post.commentsCount}</span>
          </button>
        </Link>

        {/* Repost */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.82 }}
            onClick={handleRepost}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-medium transition-colors",
              reposted ? "text-green-500 bg-green-500/10" : "text-muted-foreground hover:text-green-400 hover:bg-green-500/10"
            )}
          >
            <Repeat2 size={16} />
            <span>{repostCount}</span>
          </motion.button>
          <AnimatePresence>
            {repostToast && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.92 }}
                animate={{ opacity: 1, y: -4, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.92 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap flex items-center gap-1.5 bg-green-500/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-lg pointer-events-none z-20"
              >
                <Check size={10} />
                Reposted!
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Share */}
        <div className="relative" ref={shareMenuRef}>
          <button
            onClick={() => setShowShareMenu(s => !s)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm transition-colors",
              showShareMenu
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            {copiedLink ? <Check size={16} className="text-green-400" /> : <Share2 size={16} />}
          </button>

          <AnimatePresence>
            {showShareMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 6 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden w-56"
              >
                <div className="px-3 py-2 border-b border-border/50">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Share post</p>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border/30 p-0">
                  {SHARE_PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSharePlatform(p)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 text-sm transition-colors bg-popover",
                        p.bg
                      )}
                    >
                      <span className={p.color}>
                        {p.id === "copy" && copiedLink ? <Check size={14} className="text-green-400" /> : p.icon}
                      </span>
                      <span className="font-medium text-foreground text-xs truncate">
                        {p.id === "copy" && copiedLink ? "Copied!" : p.label}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Reaction picker trigger */}
        {user && (
          <div className="relative" ref={reactionPickerRef}>
            <button
              onClick={() => setShowReactionPicker(s => !s)}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded-xl text-sm transition-colors",
                showReactionPicker ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
              title="React"
            >
              <SmilePlus size={16} />
            </button>
            <AnimatePresence>
              {showReactionPicker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full right-0 mb-2 z-50 bg-popover border border-border rounded-2xl shadow-2xl p-2"
                  style={{ minWidth: "220px" }}
                >
                  <div className="grid grid-cols-6 gap-0.5">
                    {REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleReaction(emoji); }}
                        style={{ touchAction: "manipulation" }}
                        className={cn(
                          "w-9 h-9 flex items-center justify-center rounded-xl text-xl transition-all active:scale-90",
                          userReactions.includes(emoji) ? "bg-primary/20 ring-1 ring-primary/40" : "hover:bg-muted/60"
                        )}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Views + Bookmark */}
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground/60">
            <Eye size={12} />
            <span>{post.viewsCount}</span>
          </div>
          {user && (
            <motion.button
              whileTap={{ scale: 0.82 }}
              onClick={toggleBookmark}
              data-testid="bookmark-button"
              className={cn(
                "p-2 rounded-xl transition-colors",
                bookmarked ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10"
              )}
            >
              <Bookmark size={15} className={cn("transition-all", bookmarked && "fill-current")} />
            </motion.button>
          )}
        </div>
      </div>
      {/* Reaction bar */}
      {hasAnyReactions && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {REACTION_EMOJIS.filter(e => reactionCounts[e] > 0).map(emoji => (
            <button
              key={emoji}
              onClick={() => user && toggleReaction(emoji)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-sm border transition-all",
                userReactions.includes(emoji)
                  ? "bg-primary/15 border-primary/40 text-primary font-semibold"
                  : "bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted/70 hover:border-border"
              )}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className="text-xs font-medium">{reactionCounts[emoji]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Report modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowReport(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={e => e.stopPropagation()}
            className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Flag size={16} className="text-red-400" />
                <h3 className="font-bold text-sm">Report post</h3>
              </div>
              <button onClick={() => setShowReport(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <XIcon size={16} />
              </button>
            </div>
            {reportSubmitted ? (
              <div className="px-5 py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                  <Check size={20} className="text-green-400" />
                </div>
                <p className="font-semibold mb-1">Report submitted</p>
                <p className="text-sm text-muted-foreground">Our team will review this content. Thank you for keeping the community safe.</p>
                <button onClick={() => setShowReport(false)} className="mt-5 text-sm text-primary hover:underline">Close</button>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground px-1 mb-3">Why are you reporting this post?</p>
                {REPORT_REASONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setReportReason(r.value)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors border",
                      reportReason === r.value
                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                        : "border-border/40 hover:bg-muted/50"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
                <button
                  disabled={!reportReason}
                  onClick={async () => {
                    if (!reportReason) return;
                    try {
                      await fetch(`/api/posts/${post.id}/report`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reason: reportReason }),
                      });
                    } catch {}
                    setReportSubmitted(true);
                  }}
                  className="w-full mt-2 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  Submit report
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>

    {editModalOpen && (
      <EditPostModal
        post={post}
        onClose={() => setEditModalOpen(false)}
      />
    )}
    </>
  );
}
