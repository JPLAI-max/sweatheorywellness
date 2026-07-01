import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useCreatePost } from "@workspace/api-client-react";
import { uploadToR2Media } from "@/lib/r2Upload";
import { isLoggedIn } from "@/lib/auth";
import { Loader2, ImageIcon, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SHARE_CACHE = "sweatheory-share-v1";
const META_KEY = "share-meta";

interface SharedFile {
  file: File;
  preview: string;
}

export default function ShareTarget() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "ready" | "uploading" | "done" | "error">("loading");
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const xhrRefs = useRef<Array<{ current: XMLHttpRequest | null }>>([]);

  const createPost = useCreatePost({
    mutation: {
      onSuccess: () => {
        setStatus("done");
        setTimeout(() => setLocation("/feed"), 1200);
      },
      onError: () => {
        setErrorMsg("Failed to create post. Try again.");
        setStatus("error");
      },
    },
  });

  useEffect(() => {
    if (!isLoggedIn()) {
      setLocation("/login");
      return;
    }
    loadSharedFiles();
  }, []);

  async function loadSharedFiles() {
    try {
      if (!("caches" in window)) {
        setErrorMsg("Your browser doesn't support this feature.");
        setStatus("error");
        return;
      }

      const cache = await caches.open(SHARE_CACHE);
      const metaRes = await cache.match(META_KEY);
      if (!metaRes) {
        // No share data — redirect to feed
        setLocation("/feed");
        return;
      }

      const meta: { fileKeys: string[]; title: string; text: string } = await metaRes.json();

      // Pre-fill caption from shared text/title
      const prefill = [meta.title, meta.text].filter(Boolean).join(" ").trim();
      if (prefill) setCaption(prefill);

      const files: SharedFile[] = [];
      for (const key of meta.fileKeys) {
        const res = await cache.match(key);
        if (!res) continue;
        const blob = await res.blob();
        const name = decodeURIComponent(res.headers.get("X-File-Name") || "image.jpg");
        const type = res.headers.get("Content-Type") || blob.type || "image/jpeg";
        const file = new File([blob], name, { type });
        files.push({ file, preview: URL.createObjectURL(blob) });
      }

      if (files.length === 0) {
        setLocation("/feed");
        return;
      }

      setSharedFiles(files);
      xhrRefs.current = files.map(() => ({ current: null }));
      setStatus("ready");
    } catch (err) {
      console.error("[ShareTarget] load error", err);
      setErrorMsg("Couldn't read shared images. Try again.");
      setStatus("error");
    }
  }

  function removeFile(idx: number) {
    setSharedFiles((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
    if (sharedFiles.length <= 1) setLocation("/feed");
  }

  async function handlePost() {
    if (sharedFiles.length === 0) return;
    setStatus("uploading");
    setProgress(0);

    try {
      const urls: string[] = [];
      const step = 100 / sharedFiles.length;

      for (let i = 0; i < sharedFiles.length; i++) {
        const { file } = sharedFiles[i];
        const xhrRef = xhrRefs.current[i] ?? { current: null };
        const { key } = await uploadToR2Media(
          file,
          "posts",
          (pct) => setProgress(Math.round(i * step + pct * (step / 100))),
          xhrRef
        );
        urls.push(key);
      }

      await createPost.mutateAsync({
        data: {
          caption: caption.trim() || " ",
          type: "photo",
          mediaItems: urls,
        },
      });
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Upload failed. Try again.");
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading shared images…</p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <Send size={24} className="text-green-400" />
        </div>
        <p className="text-sm text-muted-foreground">Posted! Taking you to your feed…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-destructive text-sm text-center">{errorMsg}</p>
        <Button variant="outline" onClick={() => setLocation("/feed")}>
          Go to Feed
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setLocation("/feed")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-primary" />
          <span className="text-sm font-semibold">Post to Sweatheory</span>
        </div>
        <Button
          size="sm"
          onClick={handlePost}
          disabled={status === "uploading" || sharedFiles.length === 0}
          className="h-8 px-4"
        >
          {status === "uploading" ? (
            <>
              <Loader2 size={13} className="animate-spin mr-1.5" />
              {progress}%
            </>
          ) : (
            "Post"
          )}
        </Button>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-4 max-w-lg mx-auto w-full">
        {/* Photo grid */}
        <div className={`grid gap-2 ${sharedFiles.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {sharedFiles.map((sf, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
              <img
                src={sf.preview}
                alt=""
                className="w-full h-full object-cover"
              />
              {status !== "uploading" && (
                <button
                  onClick={() => removeFile(i)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X size={14} className="text-white" />
                </button>
              )}
              {status === "uploading" && i === 0 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-white" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Caption */}
        <Textarea
          placeholder="Write a caption…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="min-h-[100px] resize-none bg-muted/50 border-border"
          disabled={status === "uploading"}
          maxLength={2000}
        />

        <p className="text-xs text-muted-foreground text-center">
          {sharedFiles.length} photo{sharedFiles.length !== 1 ? "s" : ""} ready to post
        </p>
      </div>
    </div>
  );
}
