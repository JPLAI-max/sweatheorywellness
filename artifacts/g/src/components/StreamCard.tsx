import { Link } from "wouter";
import { Users, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar } from "./Avatar";
import { TipButton } from "./TipModal";
import { cn } from "@/lib/utils";

interface Stream {
  id: number;
  host: any;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  status: string;
  viewerCount: number;
  category?: string;
  isPaid: boolean;
  accessPrice?: number;
}

export function StreamCard({ stream }: { stream: Stream }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      data-testid="stream-card"
    >
      <Link href={`/stream/${stream.id}`}>
        <div className="group cursor-pointer bg-card border border-card-border rounded-xl overflow-hidden hover:border-primary/40 transition-all duration-200">
          {/* Thumbnail */}
          <div className="relative aspect-video bg-muted overflow-hidden">
            {stream.thumbnailUrl ? (
              <img src={stream.thumbnailUrl} alt={stream.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                <img src="/gooncity-logo.png" alt="Sweatheory" className="w-12 h-12 rounded-xl object-cover opacity-40" />
              </div>
            )}
            {/* Live badge */}
            {stream.status === "live" && (
              <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                Live
              </span>
            )}
            {stream.isPaid && (
              <span className="absolute top-2 right-2 bg-background/80 backdrop-blur text-foreground text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1">
                <Lock size={10} />
                {stream.accessPrice ? `$${stream.accessPrice}` : "Paid"}
              </span>
            )}
            <div className={cn(
              "absolute bottom-2 right-2 flex items-center gap-1 text-xs text-white bg-black/60 backdrop-blur px-2 py-0.5 rounded-full"
            )}>
              <Users size={10} />
              {stream.viewerCount.toLocaleString()}
            </div>
          </div>

          {/* Info */}
          <div className="p-3 flex items-start gap-2.5">
            <Avatar user={stream.host} size="sm" showVerified />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors">{stream.title}</p>
              <p className="text-xs text-muted-foreground truncate">@{stream.host?.username}</p>
              {stream.category && (
                <span className="mt-1 inline-block text-xs text-primary/80 bg-primary/10 rounded px-1.5 py-0.5">{stream.category}</span>
              )}
            </div>
            {stream.host?.id && (
              <div onClick={e => e.preventDefault()}>
                <TipButton recipientId={stream.host.id} recipientName={stream.host.displayName ?? stream.host.username} />
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
