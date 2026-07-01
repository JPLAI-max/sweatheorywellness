import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, MousePointer2, RotateCcw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function resolveWatchPartyEmbed(url: string): string {
  try {
    const u = new URL(url);
    // Strip any subdomain (www, m, rt, de, …) to get the root domain
    const hostParts = u.hostname.split(".");
    const host = hostParts.length >= 2 ? hostParts.slice(-2).join(".") : u.hostname;
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`;
    if (host === "pornhub.com" || host === "pornhub.org") {
      const vk = u.searchParams.get("viewkey") ?? url.match(/\/embed\/([\w]+)/)?.[1];
      if (vk) return `https://www.pornhub.com/embed/${vk}`;
    }
    if (host === "redtube.com") {
      const id = u.pathname.replace(/\//g, "");
      if (id) return `https://embed.redtube.com/?id=${id}&autoplay=1`;
    }
    if (host === "xvideos.com") {
      const xvMatch = url.match(/\/video(\d+)\//);
      if (xvMatch) return `https://www.xvideos.com/embedframe/${xvMatch[1]}`;
    }
    if (host === "xhamster.com" || host === "xhamster.desi" || host === "xhamster.xxx") {
      const xhMatch = url.match(/-(\d+)(?:\/|$)/);
      if (xhMatch) return `https://xhamster.com/xembed.php?video=${xhMatch[1]}&autoplay=1`;
    }
    if (host === "xnxx.com") {
      const xnMatch = url.match(/\/video-([a-z0-9]+)\//);
      if (xnMatch) return `https://www.xnxx.com/embedframe/${xnMatch[1]}`;
    }
    if (host === "vimeo.com") {
      const vmMatch = url.match(/vimeo\.com\/(\d+)/);
      if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}?autoplay=1&api=1`;
    }
    if (host === "twitch.tv") {
      const channel = u.pathname.replace(/\//g, "");
      if (channel) return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&autoplay=true`;
    }
    if (host === "chaturbate.com") {
      const cb = u.pathname.replace(/\//g, "");
      if (cb) return `https://chaturbate.com/in/?tour=dT8X&campaign=9dGvb&track=embed&b=${cb}`;
    }
    return url;
  } catch {
    return url;
  }
}

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export interface WatchPartySuggestion {
  id: number;
  title: string;
  thumbnailUrl?: string | null;
  hostDisplayName: string;
  hostUsername: string;
}

export interface WatchPartyPlayerProps {
  url: string;
  isHost: boolean;
  syncTime?: number;
  syncIsPlaying?: boolean;
  syncSerial?: number;
  onSync?: (currentTime: number, isPlaying: boolean) => void;
  suggestions?: WatchPartySuggestion[];
  onSuggestionClick?: (id: number) => void;
}

export function WatchPartyPlayer({
  url, isHost, syncTime, syncIsPlaying, syncSerial, onSync,
  suggestions = [], onSuggestionClick,
}: WatchPartyPlayerProps) {
  const isDirect = /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(url);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncSerial = useRef<number | undefined>(undefined);

  // tap detection
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const pendingSingleTap = useRef<boolean>(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [interactMode, setInteractMode] = useState(false);
  const [interactSecs, setInteractSecs] = useState(0);
  const [syncState, setSyncState] = useState<"in-sync" | "syncing">("in-sync");
  const [ended, setEnded] = useState(false);
  const [seekFlash, setSeekFlash] = useState<"back" | "forward" | null>(null);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── HLS.js: attach when the URL is an .m3u8 and native HLS is not supported ─
  useEffect(() => {
    if (!isDirect) return;
    const video = videoRef.current;
    if (!video) return;
    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (!isHls) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari — native HLS, just set src
      video.src = url;
      return;
    }
    if (!Hls.isSupported()) return;
    const hls = new Hls({ enableWorker: false });
    hls.loadSource(url);
    hls.attachMedia(video);
    return () => hls.destroy();
  }, [url, isDirect]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (!isDirect || isHost || syncTime === undefined) return;
    const video = videoRef.current;
    if (!video) return;
    const diff = Math.abs(video.currentTime - syncTime);
    if (diff > 2 || syncSerial !== lastSyncSerial.current) {
      lastSyncSerial.current = syncSerial;
      setSyncState("syncing");
      video.currentTime = syncTime;
      setTimeout(() => setSyncState("in-sync"), 1500);
    }
  }, [syncTime, syncSerial, isDirect, isHost]);

  useEffect(() => {
    if (!isDirect || isHost || syncIsPlaying === undefined) return;
    const video = videoRef.current;
    if (!video) return;
    if (syncIsPlaying && video.paused) video.play().catch(() => {});
    else if (!syncIsPlaying && !video.paused) video.pause();
  }, [syncIsPlaying, isDirect, isHost]);

  function notifySync(time: number, isPlaying: boolean) {
    if (isHost && onSync) onSync(time, isPlaying);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (ended) {
      v.currentTime = 0;
      setEnded(false);
      v.play().catch(() => {});
      return;
    }
    if (v.paused) v.play().catch(() => {});
    else { v.pause(); notifySync(v.currentTime, false); }
  }

  function skip(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    v.currentTime = t;
    setCurrentTime(t);
    if (ended) setEnded(false);
    notifySync(t, !v.paused);
  }

  function flashSeek(dir: "back" | "forward") {
    setSeekFlash(dir);
    setTimeout(() => setSeekFlash(null), 700);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    const t = parseFloat(e.target.value);
    v.currentTime = t;
    setCurrentTime(t);
    if (ended) setEnded(false);
    notifySync(t, !v.paused);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }

  function replay() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    setEnded(false);
    setCurrentTime(0);
    v.play().catch(() => {});
    notifySync(0, true);
  }

  // ── TOUCH HANDLERS ─────────────────────────────────────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    const tag = (e.target as HTMLElement).tagName;
    if (tag !== "INPUT" && tag !== "BUTTON" && tag !== "A") {
      e.preventDefault();
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    const tag = (e.target as HTMLElement).tagName;
    if (tag !== "INPUT") e.preventDefault();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "BUTTON" || tag === "A") return;

    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current);
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    const dt = Date.now() - touchStartTime.current;
    // Only treat as a deliberate tap: short, minimal movement
    if (dx > 12 || dy > 12 || dt > 350) return;

    const now = Date.now();
    const sinceLastTap = now - lastTapTime.current;
    lastTapTime.current = now;

    if (sinceLastTap < 320 && pendingSingleTap.current) {
      // ── DOUBLE TAP: seek ±10s ──────────────────────────────────────────
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      pendingSingleTap.current = false;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tapX = e.changedTouches[0].clientX - rect.left;
      if (tapX < rect.width / 2) { skip(-10); flashSeek("back"); }
      else { skip(10); flashSeek("forward"); }
      resetControlsTimer();
    } else {
      // ── SINGLE TAP: toggle controls ────────────────────────────────────
      pendingSingleTap.current = true;
      tapTimer.current = setTimeout(() => {
        pendingSingleTap.current = false;
        setShowControls(prev => {
          if (!prev) { resetControlsTimer(); return true; }
          if (controlsTimer.current) clearTimeout(controlsTimer.current);
          return false;
        });
      }, 280);
    }
  }

  // ── MOUSE HANDLERS (desktop) ────────────────────────────────────────────────
  function handleMouseMove() {
    resetControlsTimer();
  }

  function handleVideoClick(e: React.MouseEvent) {
    // Only handle direct clicks on the video (not control elements)
    if ((e.target as HTMLElement).closest("[data-controls]")) return;
    togglePlay();
    resetControlsTimer();
  }

  function handleContainerDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-controls]")) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.clientX - rect.left < rect.width / 2) { skip(-10); flashSeek("back"); }
    else { skip(10); flashSeek("forward"); }
    resetControlsTimer();
  }

  function startInteract() {
    if (interactInterval.current) clearInterval(interactInterval.current);
    setInteractMode(true);
    setInteractSecs(8);
    interactInterval.current = setInterval(() => {
      setInteractSecs(prev => {
        if (prev <= 1) { clearInterval(interactInterval.current!); setInteractMode(false); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function stopInteract() {
    if (interactInterval.current) clearInterval(interactInterval.current);
    setInteractMode(false);
    setInteractSecs(0);
  }

  // ── DIRECT VIDEO PLAYER ─────────────────────────────────────────────────────
  if (isDirect) {
    return (
      <div
        ref={containerRef}
        className="relative bg-black select-none"
        style={{ height: "100%", aspectRatio: "16/9", maxWidth: "100%", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleContainerDoubleClick}
        onMouseDownCapture={(e) => {
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== "INPUT" && tag !== "BUTTON" && tag !== "A") e.preventDefault();
        }}
      >
        {/* Video — src only for non-HLS; HLS.js attaches via useEffect */}
        <video
          ref={videoRef}
          src={/\.m3u8(\?|$)/i.test(url) ? undefined : url}
          playsInline
          className="w-full h-full object-contain"
          onClick={handleVideoClick}
          onPlay={() => { setPlaying(true); setEnded(false); notifySync(videoRef.current?.currentTime ?? 0, true); }}
          onPause={() => { setPlaying(false); notifySync(videoRef.current?.currentTime ?? 0, false); }}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
          onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
          onVolumeChange={() => {
            if (videoRef.current) { setVolume(videoRef.current.volume); setMuted(videoRef.current.muted); }
          }}
          onEnded={() => { setPlaying(false); setEnded(true); notifySync(videoRef.current?.currentTime ?? duration, false); }}
        />

        {/* ── DOUBLE-TAP SEEK FLASH ─────────────────────────────────────── */}
        {seekFlash && (
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 z-30 flex items-center gap-1 px-5 py-2.5 rounded-full text-white text-base font-bold pointer-events-none select-none",
              seekFlash === "back" ? "left-6" : "right-6"
            )}
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            {seekFlash === "back" ? "« 10s" : "10s »"}
          </div>
        )}

        {/* ── SUGGESTIONS OVERLAY (video ended) ─────────────────────────── */}
        {ended && suggestions.length > 0 && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4 py-6"
            style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}
          >
            <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-4">Up next</p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {suggestions.slice(0, 4).map(s => (
                <button
                  key={s.id}
                  onClick={() => onSuggestionClick?.(s.id)}
                  className="group flex flex-col rounded-xl overflow-hidden text-left transition-all hover:scale-[1.03] active:scale-[0.98] focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  <div className="relative w-full" style={{ aspectRatio: "16/9", background: "linear-gradient(135deg,#1a0033,#001a22)" }}>
                    {s.thumbnailUrl ? (
                      <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(139,92,246,0.25)" }}>
                          <Play size={14} className="text-violet-300 ml-0.5" />
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="text-white text-[11px] font-semibold leading-snug line-clamp-2">{s.title}</p>
                    <p className="text-zinc-500 text-[10px] mt-0.5">{s.hostDisplayName}</p>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={replay}
              className="mt-5 flex items-center gap-2 px-5 py-2 rounded-full text-zinc-400 hover:text-white text-xs font-semibold transition-colors hover:bg-white/8"
            >
              <RotateCcw size={13} /> Replay
            </button>
          </div>
        )}

        {/* ── CUSTOM CONTROLS ──────────────────────────────────────────── */}
        <div
          data-controls
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300 pointer-events-none",
            showControls && !ended ? "opacity-100" : "opacity-0"
          )}
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.18) 70%, transparent 100%)", paddingTop: "52px" }}
        >
          {/* Sync dot — viewers only */}
          {!isHost && (
            <div className="absolute top-2 right-3 flex items-center gap-1 pointer-events-none select-none">
              <div className={cn("w-1.5 h-1.5 rounded-full", syncState === "in-sync" ? "bg-green-400" : "bg-yellow-400 animate-pulse")} />
              <span className="text-[9px] font-semibold text-zinc-400">{syncState === "in-sync" ? "In sync" : "Syncing…"}</span>
            </div>
          )}

          {/* Seek bar */}
          <div className="px-3 mb-1.5 pointer-events-auto" style={{ touchAction: "auto" }}>
            <input
              type="range" min="0" max={duration || 100} step="0.5" value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 cursor-pointer rounded-full appearance-none"
              style={{ accentColor: "#7c3aed", background: `linear-gradient(to right, #7c3aed ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.18) 0%)`, touchAction: "auto" }}
            />
          </div>

          {/* Bottom row */}
          <div className="flex items-center px-3 pb-3 gap-3 pointer-events-auto">
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/15 transition-all flex-shrink-0"
            >
              {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>

            <span className="text-[11px] text-zinc-300 select-none tabular-nums flex-shrink-0">
              {fmt(currentTime)} <span className="text-zinc-600">/</span> {fmt(duration)}
            </span>

            <div className="flex-1" />

            <div className="flex items-center gap-1.5">
              <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors flex-shrink-0">
                {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <input
                type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 cursor-pointer rounded-full appearance-none hidden sm:block"
                style={{ accentColor: "#7c3aed", touchAction: "auto" }}
              />
            </div>

            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors flex-shrink-0">
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── IFRAME EMBED ────────────────────────────────────────────────────────────
  const embedSrc = resolveWatchPartyEmbed(url);
  return (
    <div
      ref={containerRef}
      className="relative bg-black select-none"
      style={{ height: "100%", aspectRatio: "16/9", maxWidth: "100%", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <iframe
        ref={iframeRef}
        key={embedSrc}
        src={embedSrc}
        className={cn("absolute inset-0 w-full h-full", interactMode ? "pointer-events-auto" : "pointer-events-none")}
        style={{ border: "none", display: "block" }}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
      />

      {/* ── NON-INTERACT: click anywhere to enable controls, bottom bar ─── */}
      {!interactMode && (
        <div
          className="absolute inset-0 z-10 flex flex-col justify-end cursor-pointer"
          onClick={startInteract}
        >
          <div
            className="flex items-center justify-between px-3 pb-3 pt-12 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)" }}
          >
            {/* Left group: interact + open-in-new-tab */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-2xl text-white text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
                onClick={(e) => { e.stopPropagation(); startInteract(); }}
              >
                <MousePointer2 size={15} />
                Tap to control player
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open video in new tab"
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all hover:scale-110 active:scale-95"
                style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.18)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={15} />
              </a>
            </div>

            {/* Fullscreen toggle */}
            <button
              className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all hover:scale-110 active:scale-95"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.18)" }}
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── INTERACT MODE: badge + fullscreen at top-right (doesn't block native seek bar) ─ */}
      {interactMode && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold select-none"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", border: "1px solid rgba(139,92,246,0.45)" }}
          >
            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
            Controls active · {interactSecs}s
            <button onClick={stopInteract} className="ml-1 text-zinc-400 hover:text-white leading-none">×</button>
          </div>
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all hover:scale-110 active:scale-95"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.18)" }}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      )}
    </div>
  );
}
