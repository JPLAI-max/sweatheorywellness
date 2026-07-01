import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface CropModalProps {
  src: string;
  onDone: (croppedFile: File) => void;
  onCancel: () => void;
}

type AspectOption = { label: string; value: number | null };

const ASPECTS: AspectOption[] = [
  { label: "1:1",  value: 1 },
  { label: "4:5",  value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
  { label: "Free", value: null },
];

const MAX_OUTPUT_PX = 1200;

async function getCroppedImg(src: string, pixelCrop: Area): Promise<File> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const image = new Image();
    image.onload = () => res(image);
    image.onerror = rej;
    image.src = src;
  });

  // Cap output at MAX_OUTPUT_PX on the longest side to keep file sizes sane
  const scale = Math.min(1, MAX_OUTPUT_PX / Math.max(pixelCrop.width, pixelCrop.height));
  const outW = Math.round(pixelCrop.width * scale);
  const outH = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(
    img,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH,
  );

  return new Promise<File>((res, rej) => {
    canvas.toBlob(
      blob => {
        if (!blob) { rej(new Error("Canvas toBlob failed")); return; }
        res(new File([blob], "cropped.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  });
}

export function CropModal({ src, onDone, onCancel }: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspectIdx, setAspectIdx] = useState(0); // default 1:1
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);
  const [rotation, setRotation] = useState(0);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  async function handleApply() {
    if (!croppedArea) return;
    setApplying(true);
    try {
      const file = await getCroppedImg(src, croppedArea);
      onDone(file);
    } catch {
      setApplying(false);
    }
  }

  function handleReset() {
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setRotation(0);
  }

  const aspect = ASPECTS[aspectIdx]?.value ?? undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <button
          onClick={onCancel}
          className="p-2 rounded-full hover:bg-white/10 transition-colors text-white"
        >
          <X size={20} />
        </button>
        <span className="text-white font-semibold text-sm">Crop Photo</span>
        <button
          onClick={handleApply}
          disabled={applying || !croppedArea}
          className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-primary/90"
        >
          {applying ? "Saving…" : "Done"}
        </button>
      </div>

      {/* Cropper canvas */}
      <div className="relative flex-1 min-h-0">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { background: "#000" },
            cropAreaStyle: { border: "2px solid hsl(var(--primary))", borderRadius: 4 },
            mediaStyle: {},
          }}
        />
      </div>

      {/* Controls */}
      <div className="shrink-0 bg-black/95 border-t border-white/10 px-4 pt-3 pb-5 space-y-3">
        {/* Aspect ratio pills */}
        <div className="flex gap-2 justify-center flex-wrap">
          {ASPECTS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => setAspectIdx(i)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                i === aspectIdx
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/10 text-white hover:bg-white/20",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Zoom row */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setZoom(z => Math.max(1, z - 0.1))}
            className="text-white/70 hover:text-white transition-colors shrink-0"
          >
            <ZoomOut size={18} />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.1))}
            className="text-white/70 hover:text-white transition-colors shrink-0"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={handleReset}
            className="text-white/50 hover:text-white transition-colors shrink-0 ml-1"
            title="Reset"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
