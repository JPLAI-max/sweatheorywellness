import { useRef, useEffect } from "react";
import { MicOff, X, Star, StarOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VideoTileProps {
  stream: MediaStream | null;
  displayName: string;
  participantId: string;
  isLocal?: boolean;
  isSelected?: boolean;
  isMuted?: boolean;
  showHostControls?: boolean;
  onMute?: () => void;
  onRemove?: () => void;
  onSpotlight?: () => void;
  onClick?: () => void;
  label?: string;
}

export function VideoTile({
  stream,
  displayName,
  isLocal,
  isSelected,
  isMuted,
  showHostControls,
  onMute,
  onRemove,
  onSpotlight,
  onClick,
  label,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex-shrink-0 w-36 rounded-xl overflow-hidden bg-zinc-900 border border-border cursor-pointer transition-all",
        isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/40",
      )}
      style={{ aspectRatio: "16/9" }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
          <span className="text-lg font-bold text-zinc-600">{displayName[0]?.toUpperCase()}</span>
        </div>
      )}

      {/* Name bar */}
      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 flex items-center gap-1">
        {isMuted && <MicOff size={9} className="text-red-400 flex-shrink-0" />}
        <span className="text-white text-[10px] truncate">{label ?? displayName}</span>
        {isLocal && <span className="text-primary text-[9px] ml-auto flex-shrink-0">You</span>}
      </div>

      {/* Host control buttons */}
      {showHostControls && (
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
          {onSpotlight && (
            <button
              onClick={(e) => { e.stopPropagation(); onSpotlight(); }}
              title={isSelected ? "Remove spotlight" : "Spotlight for all"}
              className="p-0.5 bg-primary/80 hover:bg-primary rounded text-white transition-colors"
            >
              {isSelected ? <StarOff size={10} /> : <Star size={10} />}
            </button>
          )}
          {onMute && (
            <button
              onClick={(e) => { e.stopPropagation(); onMute(); }}
              title={isMuted ? "Unmute" : "Mute audio"}
              className={cn("p-0.5 rounded text-white transition-colors", isMuted ? "bg-red-600 hover:bg-red-700" : "bg-zinc-700/80 hover:bg-zinc-600")}
            >
              <MicOff size={10} />
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="Remove from stage"
              className="p-0.5 bg-red-600/80 hover:bg-red-700 rounded text-white transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* Always show controls on hover (for non-host) */}
      {!showHostControls && showHostControls !== false && (
        <div className="absolute inset-0 group" />
      )}
    </div>
  );
}
