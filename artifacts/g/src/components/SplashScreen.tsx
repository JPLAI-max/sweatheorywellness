/**
 * Sweatheory cinematic splash — "Individual journeys, one movement"
 *
 * Visual metaphor: warm glowing orbs (individual wellness journeys) drift in
 * from all directions and gradually coalesce into the Sweatheory droplet
 * silhouette.  The soft, blurred circles read as abstract light — never as
 * social-media cards — giving the sequence a premium, cinematic quality.
 *
 * Phases:
 *   0  pre-start  (dark screen)
 *   1  drift-in   (orbs fly in from edges, gather into droplet formation)
 *   2  glow-hold  (droplet silhouette visible; SVG outline traces in)
 *   3  dissolve   (orbs fade; clean golden icon crystallises)
 *   4  brand      ("sweatheory / Find What Works.")
 *   5  fade-out
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

// ─── Seeded LCG — all randomness is deterministic ───────────────────────────
function makeLCG(seed: number) {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0x100000000;
  };
}

// ─── Droplet interior grid ────────────────────────────────────────────────────
// Water-drop geometry in normalised coords:
//   Upper: linear taper — tip (0,−1.5) → circle-tangent (±1, 0.2)
//   Lower: semicircle centred (0, 0.2) radius 1 → bottom (0, 1.2)
//
// Viewport mapping — offsets FROM anchor (50 vw / 50 vh):
//   dx = nx × SX vw      dy = ny × SY vh
const SX = 18; // vw per normalised unit  → full droplet width  ≈ 36 vw
const SY = 22; // vh per normalised unit  → full droplet height ≈ 60 vh (tip at 17%, bottom at 76%)

function inDroplet(nx: number, ny: number): boolean {
  if (ny >= 0.2) return nx * nx + (ny - 0.2) ** 2 <= 1.01; // circle
  return Math.abs(nx) <= Math.max(0, 1 - (0.2 - ny) / 1.7); // linear taper
}

function buildFormation() {
  const pts: { dx: number; dy: number }[] = [];
  // 9 rows: ny −1.5 → +1.2   |   10 cols: nx −1 → +1
  for (let yi = 0; yi < 9; yi++) {
    const ny = -1.5 + yi * (2.7 / 8);
    for (let xi = 0; xi < 10; xi++) {
      const nx = -1 + xi * (2.0 / 9);
      if (inDroplet(nx, ny)) pts.push({ dx: nx * SX, dy: ny * SY });
    }
  }
  return pts;
}

const FORMATION = buildFormation();       // ≈ 46–50 slots
const COUNT = Math.min(FORMATION.length, 46);

// ─── Orb configs ──────────────────────────────────────────────────────────────
// Each orb is a blurred circle — not a photo card.
// Different warm amber shades and blur radii create natural depth variation.

const ORB_GRADS = [
  "radial-gradient(circle at 38% 38%, rgba(255,195,82,.78) 0%, rgba(215,130,40,.88) 32%, rgba(158,65,12,.94) 68%, rgba(65,18,2,.98) 100%)",
  "radial-gradient(circle at 62% 40%, rgba(248,182,72,.74) 0%, rgba(208,124,36,.86) 30%, rgba(152,60,10,.93) 66%, rgba(60,16,2,.98) 100%)",
  "radial-gradient(circle at 42% 60%, rgba(240,172,65,.72) 0%, rgba(200,115,30,.85) 30%, rgba(148,56,8,.93) 65%, rgba(56,14,1,.98) 100%)",
  "radial-gradient(circle at 55% 32%, rgba(255,202,88,.76) 0%, rgba(220,138,44,.88) 34%, rgba(164,72,14,.92) 70%, rgba(70,20,3,.98) 100%)",
  "radial-gradient(circle at 32% 52%, rgba(235,165,60,.70) 0%, rgba(196,110,28,.84) 30%, rgba(144,54,8,.93) 65%, rgba(54,14,1,.98) 100%)",
  "radial-gradient(circle at 65% 36%, rgba(252,188,76,.75) 0%, rgba(212,128,38,.86) 30%, rgba(158,64,10,.93) 66%, rgba(65,18,2,.98) 100%)",
  "radial-gradient(circle at 46% 56%, rgba(242,175,68,.73) 0%, rgba(202,118,32,.85) 30%, rgba(150,58,9,.93) 65%, rgba(58,15,1,.98) 100%)",
  "radial-gradient(circle at 58% 44%, rgba(250,192,80,.77) 0%, rgba(218,134,42,.87) 32%, rgba(162,70,13,.92) 68%, rgba(68,19,2,.98) 100%)",
];

interface Orb {
  grad:    string;
  blurPx:  number;  // CSS blur radius
  size:    number;  // vmin diameter
  rot:     number;  // deg (keeps movement feel organic; circle so visually irrelevant)
  startDx: number;  // vw offset from anchor (off-screen)
  startDy: number;  // vh offset from anchor
  formDx:  number;  // vw offset (formation)
  formDy:  number;  // vh offset
  dur:     number;
  del:     number;
}

function buildOrbs(): Orb[] {
  const rng = makeLCG(77);
  return Array.from({ length: COUNT }, (_, i) => {
    const size = 11 + rng() * 7;           // 11–18 vmin diameter

    const side = Math.floor(rng() * 4);
    const t    = rng();
    let sx: number, sy: number;
    if      (side === 0) { sx = t * 160 - 80; sy = -(55 + rng() * 35); }
    else if (side === 1) { sx = 70 + rng() * 35; sy = t * 160 - 80;    }
    else if (side === 2) { sx = t * 160 - 80; sy = 70 + rng() * 35;    }
    else                 { sx = -(70 + rng() * 35); sy = t * 160 - 80; }

    return {
      grad:    ORB_GRADS[i % ORB_GRADS.length],
      blurPx:  5 + rng() * 9,              // 5–14 px blur (depth variation)
      size,
      rot:     rng() * 360,
      startDx: sx,
      startDy: sy,
      formDx:  FORMATION[i].dx,
      formDy:  FORMATION[i].dy,
      dur:     1.4 + rng() * 1.4,          // 1.4–2.8 s
      del:     rng() * 2.2,                // 0–2.2 s stagger
    };
  });
}

const ORBS = buildOrbs();

// ─── Shared SVG path (water-drop, matches geometry) ──────────────────────────
const DROP =
  "M 0,-1.5 C 0.6,-1 1,-0.2 1,0.2 A 1,1 0 0 1 -1,0.2 C -1,-0.2 -0.6,-1 0,-1.5 Z";

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase = 0 | 1 | 2 | 3 | 4 | 5;

// ─── Root component ───────────────────────────────────────────────────────────
interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1),    55),   // orbs drift in
      setTimeout(() => setPhase(2),  4700),   // glow hold + outline
      setTimeout(() => setPhase(3),  6800),   // dissolve → icon
      setTimeout(() => setPhase(4),  8600),   // brand reveal
      setTimeout(() => setPhase(5), 11200),   // fade to platform
      setTimeout(onComplete,         12600),
    ];
    return () => t.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{ backgroundColor: "#0B0601" }}
      animate={{ opacity: phase === 5 ? 0 : 1 }}
      transition={{ duration: 1.7, ease: "easeInOut" }}
    >
      {/* ── Deep ambient warmth centred on droplet ──────────────────────── */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 46% 42% at 50% 50%, rgba(155,72,18,.30) 0%, rgba(90,36,6,.14) 52%, transparent 72%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 3.2 }}
      />

      {/* ── Warm light orbs (individual journeys) ───────────────────────── */}
      {ORBS.map((orb, i) => (
        <LightOrb key={i} orb={orb} phase={phase} />
      ))}

      {/* ── Droplet silhouette outline (phase 2) ────────────────────────── */}
      <AnimatePresence>
        {phase === 2 && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
          >
            <DropletGlow />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Clean icon + wordmark (phases 3–4) ──────────────────────────── */}
      <AnimatePresence>
        {phase >= 3 && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.6, delay: 0.3 }}
          >
            <motion.div
              initial={{ scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.3, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <DropletIcon />
            </motion.div>

            <AnimatePresence>
              {phase >= 4 && (
                <motion.div
                  className="flex flex-col items-center"
                  style={{ marginTop: 32 }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1.2 }}
                >
                  <span
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontSize:   42,
                      fontWeight: 700,
                      letterSpacing: "0.055em",
                      color:      "#CD9771",
                      lineHeight: 1,
                    }}
                  >
                    sweatheory
                  </span>
                  <span
                    style={{
                      fontSize:      11,
                      letterSpacing: "0.30em",
                      color:         "#7A5C38",
                      marginTop:     14,
                      textTransform: "uppercase",
                    }}
                  >
                    Find What Works.
                  </span>
                  <motion.div
                    style={{
                      width:        36,
                      height:       1.5,
                      background:   "#CD9771",
                      borderRadius: 2,
                      marginTop:    28,
                    }}
                    animate={{ scaleX: [0.28, 1, 0.28], opacity: [0.22, 0.48, 0.22] }}
                    transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Light orb ────────────────────────────────────────────────────────────────
// Blurred, circular — reads as a soft point of warm light, never as a UI card.
function LightOrb({ orb: o, phase }: { orb: Orb; phase: Phase }) {
  const half    = o.size / 2;
  const visible = phase === 1 || phase === 2;

  return (
    <motion.div
      style={{
        position:     "absolute",
        left:         "50%",
        top:          "50%",
        width:        `${o.size}vmin`,
        height:       `${o.size}vmin`,
        marginLeft:   `${-half}vmin`,
        marginTop:    `${-half}vmin`,
        borderRadius: "50%",
        background:   o.grad,
        filter:       `blur(${o.blurPx}px)`,
        willChange:   "transform, opacity",
      }}
      initial={{ x: `${o.startDx}vw`, y: `${o.startDy}vh`, opacity: 0, scale: 0.25 }}
      animate={{
        x:       phase >= 1 ? `${o.formDx}vw`  : `${o.startDx}vw`,
        y:       phase >= 1 ? `${o.formDy}vh`  : `${o.startDy}vh`,
        opacity: visible ? 0.90 : 0,
        scale:   visible ? 1    : 0.25,
      }}
      transition={{
        x:       { duration: o.dur, delay: phase === 1 ? o.del : 0, ease: [0.15, 0.85, 0.28, 1] },
        y:       { duration: o.dur, delay: phase === 1 ? o.del : 0, ease: [0.15, 0.85, 0.28, 1] },
        opacity: { duration: 1.1,   delay: phase === 1 ? o.del : 0 },
        scale:   { duration: o.dur, delay: phase === 1 ? o.del : 0, ease: [0.15, 0.85, 0.28, 1] },
      }}
    />
  );
}

// ─── Droplet SVG glow (phase 2) ───────────────────────────────────────────────
function DropletGlow() {
  return (
    <svg viewBox="-1.5 -1.7 3.0 3.1" style={{ width: "52vmin", height: "76vmin" }}>
      <defs>
        <filter id="gd" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="0.14" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Wide diffuse halo */}
      <path d={DROP} fill="rgba(188,115,38,.10)" stroke="#C88838"
            strokeWidth="0.22" filter="url(#gd)" />
      {/* Crisp defining line */}
      <path d={DROP} fill="none" stroke="#EDB860"
            strokeWidth="0.025" opacity="0.88" />
    </svg>
  );
}

// ─── Clean final icon ─────────────────────────────────────────────────────────
function DropletIcon() {
  return (
    <svg viewBox="-1.5 -1.7 3.0 3.1" style={{ width: "114px", height: "160px" }}>
      <defs>
        <linearGradient id="dg" x1="0" y1="-1.5" x2="0" y2="1.2"
                        gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#F2D298" />
          <stop offset="52%"  stopColor="#CD9771" />
          <stop offset="100%" stopColor="#9C5A22" />
        </linearGradient>
        <filter id="di" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="0.22" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Body with warm glow */}
      <path d={DROP} fill="url(#dg)" opacity="0.97" filter="url(#di)" />
      {/* Crisp outline */}
      <path d={DROP} fill="none" stroke="#E2A545" strokeWidth="0.040" opacity="0.50" />
      {/* Cross */}
      <line x1="0"    y1="-0.92" x2="0"    y2="0.85"
            stroke="#0B0601" strokeWidth="0.19" strokeLinecap="round" />
      <line x1="-0.56" y1="-0.04" x2="0.56" y2="-0.04"
            stroke="#0B0601" strokeWidth="0.19" strokeLinecap="round" />
    </svg>
  );
}
