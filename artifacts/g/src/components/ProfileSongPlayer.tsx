import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, Play, Pause, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileSongPlayerProps {
  songUrl: string;
  songTitle?: string | null;
  songArtist?: string | null;
}

export function ProfileSongPlayer({ songUrl, songTitle, songArtist }: ProfileSongPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const audio = new Audio(songUrl);
    audio.volume = volume;
    audio.loop = true;
    audioRef.current = audio;

    audio.addEventListener("canplay", () => setReady(true));
    audio.addEventListener("error", () => setError(true));

    audio.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [songUrl]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  function toggleMute() {
    setMuted(m => !m);
  }

  if (dismissed || error) return null;

  const displayTitle = songTitle || "Profile Song";
  const displayArtist = songArtist || null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mx-4 mb-5 relative"
      >
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/8 to-primary/4 backdrop-blur-sm",
          "shadow-lg shadow-primary/5"
        )}>
          {/* Animated music icon */}
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
            playing ? "bg-primary/20" : "bg-muted/60"
          )}>
            <Music2
              size={16}
              className={cn(
                "transition-colors",
                playing ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>

          {/* Song info + ticker */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="overflow-hidden">
              <motion.p
                key={displayTitle}
                className="text-sm font-semibold whitespace-nowrap"
                animate={playing ? { x: [0, -60, 0] } : { x: 0 }}
                transition={playing ? { duration: 8, repeat: Infinity, ease: "linear" } : {}}
              >
                {displayTitle}
              </motion.p>
            </div>
            {displayArtist && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{displayArtist}</p>
            )}
            {!displayArtist && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {playing ? "Now playing" : "Paused"}
              </p>
            )}
          </div>

          {/* Volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={e => {
              setVolume(Number(e.target.value));
              setMuted(Number(e.target.value) === 0);
            }}
            className="w-16 accent-primary h-1 cursor-pointer hidden sm:block"
            aria-label="Volume"
          />

          {/* Mute */}
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            disabled={!ready}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40"
            )}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>

          {/* Dismiss */}
          <button
            onClick={() => {
              audioRef.current?.pause();
              setDismissed(true);
            }}
            className="p-1 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            aria-label="Dismiss player"
          >
            <X size={13} />
          </button>
        </div>

        {/* Visualizer bars */}
        {playing && (
          <div className="absolute right-14 top-1/2 -translate-y-1/2 flex items-end gap-0.5 h-4 pointer-events-none">
            {[1, 2, 3, 4].map(i => (
              <motion.div
                key={i}
                className="w-0.5 bg-primary/60 rounded-full"
                animate={{ height: ["4px", `${8 + i * 3}px`, "4px"] }}
                transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
