import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Scissors, Maximize2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type AspectOption = { id: string; label: string; ratio: string };

const ASPECT_OPTIONS: AspectOption[] = [
  { id: "auto",  label: "Original", ratio: "auto"  },
  { id: "9/16",  label: "9:16",     ratio: "9/16"  },
  { id: "1/1",   label: "1:1",      ratio: "1/1"   },
  { id: "16/9",  label: "16:9",     ratio: "16/9"  },
];

interface VideoEditResult {
  displayAspect: string;
  trimStart: number;
  trimEnd: number | null;
}

interface Props {
  muxPlaybackId?: string;
  localPreviewUrl: string;
  onDone: (result: VideoEditResult) => void;
  onCancel: () => void;
}

export function VideoEditModal({ muxPlaybackId, localPreviewUrl, onDone, onCancel }: Props) {
  const playerRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState<number | null>(null);
  const [displayAspect, setDisplayAspect] = useState("auto");
  const [tab, setTab] = useState<"aspect" | "trim">("aspect");
  const [playing, setPlaying] = useState(false);

  const effectiveTrimEnd = trimEnd ?? duration;

  function handleLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const video = e.currentTarget;
    playerRef.current = video;
    setDuration(video.duration || 0);
  }

  function handleTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    const video = e.currentTarget;
    setCurrentTime(video.currentTime);
    if (trimEnd !== null && video.currentTime >= trimEnd) {
      video.currentTime = trimStart;
      video.pause();
      setPlaying(false);
    }
  }

  function handlePlayState(e: React.SyntheticEvent<HTMLVideoElement>) {
    setPlaying(!e.currentTarget.paused);
  }

  function seek(t: number) {
    if (playerRef.current) {
      playerRef.current.currentTime = t;
    }
    setCurrentTime(t);
  }

  function togglePlay() {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pause();
    } else {
      if (playerRef.current.currentTime < trimStart || (trimEnd !== null && playerRef.current.currentTime >= trimEnd)) {
        playerRef.current.currentTime = trimStart;
      }
      playerRef.current.play();
    }
  }

  function resetTrim() {
    setTrimStart(0);
    setTrimEnd(null);
    seek(0);
  }

  function handleDone() {
    onDone({
      displayAspect,
      trimStart,
      trimEnd: trimEnd !== null && trimEnd < duration ? trimEnd : null,
    });
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  const hasTrim = trimStart > 0 || (trimEnd !== null && trimEnd < duration);
  const hasAspect = displayAspect !== "auto";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg flex flex-col overflow-hidden"
        style={{ maxHeight: "min(92dvh, 92vh)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Scissors size={16} className="text-primary" />
            <h2 className="text-sm font-bold">Edit Video</h2>
            {(hasTrim || hasAspect) && (
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                {[hasAspect && "Resized", hasTrim && "Trimmed"].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Video preview */}
        <div className="relative bg-black flex-shrink-0" style={{ minHeight: "180px", maxHeight: "45vh", overflow: "hidden" }}>
          <video
            ref={playerRef}
            src={localPreviewUrl || (muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}/high.mp4` : undefined)}
            controls={false}
            playsInline
            muted
            autoPlay
            preload="auto"
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={(e) => {
              const v = e.currentTarget;
              v.currentTime = 0.001;
            }}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlayState}
            onPause={handlePlayState}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              maxHeight: "45vh",
              ...(displayAspect !== "auto" && {
                aspectRatio: displayAspect.replace("/", " / "),
                objectFit: "cover",
              }),
            }}
          />

          {/* Play overlay tap target */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 w-full h-full"
            aria-label={playing ? "Pause" : "Play"}
          />
          {/* Play indicator */}
          {!playing && (
            <div className="absolute pointer-events-none flex items-center justify-center w-12 h-12 rounded-full bg-black/60">
              <span className="text-white text-lg ml-0.5">▶</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/60 flex-shrink-0">
          {(["aspect", "trim"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold transition-colors relative",
                tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "aspect" ? "Aspect Ratio" : "Trim"}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <AnimatePresence mode="wait">
            {tab === "aspect" ? (
              <motion.div key="aspect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-xs text-muted-foreground mb-4">
                  Choose how your video displays in the feed. "Original" uses the video's natural dimensions.
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {ASPECT_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setDisplayAspect(opt.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        displayAspect === opt.id
                          ? "border-primary bg-primary/10"
                          : "border-border/60 hover:border-border"
                      )}
                    >
                      {/* Visual ratio preview */}
                      <div className="flex items-center justify-center w-10 h-10">
                        {opt.id === "9/16" && <div className="w-5 h-9 rounded border-2 border-current opacity-70" />}
                        {opt.id === "1/1" && <div className="w-7 h-7 rounded border-2 border-current opacity-70" />}
                        {opt.id === "16/9" && <div className="w-9 h-5 rounded border-2 border-current opacity-70" />}
                        {opt.id === "auto" && <Maximize2 size={20} className="opacity-70" />}
                      </div>
                      <span className="text-[11px] font-semibold">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div key="trim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-xs text-muted-foreground mb-4">
                  Set start and end points. The video will play between these points only.
                </p>

                {duration === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Loading video…
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Timeline */}
                    <div className="relative h-2 bg-muted rounded-full">
                      {/* Active range */}
                      <div
                        className="absolute h-full bg-primary/40 rounded-full"
                        style={{
                          left: `${(trimStart / duration) * 100}%`,
                          right: `${((duration - effectiveTrimEnd) / duration) * 100}%`,
                        }}
                      />
                      {/* Playhead */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md border-2 border-primary"
                        style={{ left: `${(currentTime / duration) * 100}%`, transform: "translate(-50%, -50%)" }}
                      />
                    </div>

                    {/* Start point */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Start</label>
                        <span className="text-xs font-mono text-foreground">{fmt(trimStart)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={trimStart}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setTrimStart(v);
                          if (trimEnd !== null && v >= trimEnd) setTrimEnd(Math.min(v + 0.5, duration));
                          seek(v);
                        }}
                        className="w-full accent-primary"
                      />
                    </div>

                    {/* End point */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">End</label>
                        <span className="text-xs font-mono text-foreground">{trimEnd !== null ? fmt(trimEnd) : fmt(duration)} / {fmt(duration)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={duration}
                        step={0.1}
                        value={trimEnd ?? duration}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          const newEnd = v >= duration ? null : v;
                          setTrimEnd(newEnd);
                          if (newEnd !== null && newEnd <= trimStart) setTrimStart(Math.max(newEnd - 0.5, 0));
                          seek(v >= duration ? duration - 0.1 : v);
                        }}
                        className="w-full accent-primary"
                      />
                    </div>

                    {/* Preview controls */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlay}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors"
                      >
                        {playing ? "⏸ Pause" : "▶ Preview trim"}
                      </button>
                      {hasTrim && (
                        <button
                          onClick={resetTrim}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-xl transition-colors"
                        >
                          <RotateCcw size={12} /> Reset
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        Clip: {fmt(effectiveTrimEnd - trimStart)}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div
          className="px-5 border-t border-border/60 flex gap-3 flex-shrink-0 pt-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        >
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-semibold"
          >
            Skip
          </button>
          <button
            onClick={handleDone}
            className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Check size={15} /> Save edits
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
