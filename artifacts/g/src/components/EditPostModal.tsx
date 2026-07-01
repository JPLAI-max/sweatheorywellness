import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Image, Upload, Loader2, CheckCircle, AlertCircle, Film, Video } from "lucide-react";
import { useUpdatePost, getListPostsQueryKey, getGetFeedQueryKey, getGetTrendingPostsQueryKey } from "@workspace/api-client-react";
import { createMuxUploadUrl, getMuxUploadStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadToR2Media } from "@/lib/r2Upload";
import { cn } from "@/lib/utils";

interface EditablePost {
  id: number;
  type: string;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
}

interface EditPostModalProps {
  post: EditablePost;
  onClose: () => void;
}

type UploadState = "idle" | "uploading" | "processing" | "ready" | "error";

export function EditPostModal({ post, onClose }: EditPostModalProps) {
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState(post.caption ?? "");

  // New media (photo posts)
  const [newMediaFile, setNewMediaFile] = useState<File | null>(null);
  const [newMediaPreview, setNewMediaPreview] = useState<string | null>(null);
  const [newMediaUrl, setNewMediaUrl] = useState<string | null>(null);
  const [mediaUploadState, setMediaUploadState] = useState<UploadState>("idle");
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);

  // New thumbnail (video posts)
  const [newThumbFile, setNewThumbFile] = useState<File | null>(null);
  const [newThumbPreview, setNewThumbPreview] = useState<string | null>(null);
  const [newThumbUrl, setNewThumbUrl] = useState<string | null>(null);
  const [thumbUploadState, setThumbUploadState] = useState<UploadState>("idle");
  const [thumbUploadProgress, setThumbUploadProgress] = useState(0);
  const [thumbUploadError, setThumbUploadError] = useState<string | null>(null);

  // New video replacement (video posts — Mux upload flow)
  const [newVideoPreview, setNewVideoPreview] = useState<string | null>(null);
  const [videoUploadState, setVideoUploadState] = useState<UploadState>("idle");
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [newMuxUploadId, setNewMuxUploadId] = useState<string>("");
  const [newMuxAssetId, setNewMuxAssetId] = useState<string>("");
  const [newMuxPlaybackId, setNewMuxPlaybackId] = useState<string>("");
  const videoXhrRef = useRef<XMLHttpRequest | null>(null);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const isPhoto = post.type === "photo" || post.type === "image";
  const isVideo = post.type === "video";

  const updatePost = useUpdatePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTrendingPostsQueryKey() });
        onClose();
      },
    },
  });

  async function handleMediaFileChange(file: File) {
    setNewMediaFile(file);
    setNewMediaPreview(URL.createObjectURL(file));
    setNewMediaUrl(null);
    setMediaUploadState("uploading");
    setMediaUploadProgress(0);
    setMediaUploadError(null);
    try {
      const result = await uploadToR2Media(file, "media", (pct) => setMediaUploadProgress(pct));
      setNewMediaUrl(result.key);
      setMediaUploadState("ready");
    } catch (err: any) {
      setMediaUploadState("error");
      setMediaUploadError(err.message ?? "Upload failed");
      setNewMediaFile(null);
      setNewMediaPreview(null);
    }
  }

  async function handleThumbFileChange(file: File) {
    setNewThumbFile(file);
    setNewThumbPreview(URL.createObjectURL(file));
    setNewThumbUrl(null);
    setThumbUploadState("uploading");
    setThumbUploadProgress(0);
    setThumbUploadError(null);
    try {
      const result = await uploadToR2Media(file, "thumbnails", (pct) => setThumbUploadProgress(pct));
      setNewThumbUrl(result.key);
      setThumbUploadState("ready");
    } catch (err: any) {
      setThumbUploadState("error");
      setThumbUploadError(err.message ?? "Upload failed");
      setNewThumbFile(null);
      setNewThumbPreview(null);
    }
  }

  async function handleVideoFileChange(file: File) {
    if (file.size > 500 * 1024 * 1024) {
      alert("File too large. Max 500MB for video.");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setNewVideoPreview(previewUrl);
    setVideoUploadState("uploading");
    setVideoUploadProgress(0);
    setVideoUploadError(null);
    setNewMuxUploadId("");
    setNewMuxAssetId("");
    setNewMuxPlaybackId("");

    try {
      const { uploadUrl, uploadId } = await createMuxUploadUrl({ fileSize: file.size });
      setNewMuxUploadId(uploadId);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        videoXhrRef.current = xhr;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setVideoUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "video/*");
        xhr.send(file);
      });
      videoXhrRef.current = null;
      setVideoUploadState("processing");

      // Poll until Mux reports the asset as ready
      let attempts = 0;
      while (attempts < 60) {
        await new Promise((r) => setTimeout(r, 3000));
        const status = await getMuxUploadStatus(uploadId);
        if (status.status === "asset_created" && status.playbackId && status.assetId) {
          setNewMuxPlaybackId(status.playbackId);
          setNewMuxAssetId(status.assetId);
          setVideoUploadState("ready");
          return;
        }
        if (status.status === "errored" || status.status === "cancelled") {
          throw new Error("Mux processing failed");
        }
        attempts++;
      }
      throw new Error("Timed out waiting for video to process");
    } catch (err: any) {
      videoXhrRef.current = null;
      setVideoUploadState("error");
      setVideoUploadError(err.message ?? "Upload failed");
      setNewVideoPreview(null);
    }
  }

  const isUploading =
    mediaUploadState === "uploading" ||
    thumbUploadState === "uploading" ||
    videoUploadState === "uploading" ||
    videoUploadState === "processing";

  const hasChanges =
    caption !== (post.caption ?? "") ||
    newMediaUrl !== null ||
    newThumbUrl !== null ||
    videoUploadState === "ready";

  function handleSave() {
    if (!hasChanges || isUploading || updatePost.isPending) return;
    const data: Record<string, unknown> = { caption };
    if (newMediaUrl !== null) data.mediaUrl = newMediaUrl;
    if (newThumbUrl !== null) data.thumbnailUrl = newThumbUrl;
    if (videoUploadState === "ready" && newMuxAssetId && newMuxPlaybackId) {
      data.muxPlaybackId = newMuxPlaybackId;
      data.muxAssetId = newMuxAssetId;
      data.muxUploadId = newMuxUploadId || undefined;
    }
    updatePost.mutate({ postId: post.id, data: data as any });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-base font-semibold">Edit post</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Caption */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Caption
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors"
                placeholder="What's on your mind?"
              />
            </div>

            {/* Replace photo */}
            {isPhoto && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Replace photo
                </label>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaFileChange(file);
                    e.target.value = "";
                  }}
                />
                {newMediaPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img
                      src={newMediaPreview}
                      alt="New media preview"
                      className="w-full max-h-48 object-cover"
                    />
                    <div className="absolute inset-0 flex items-end p-2">
                      <UploadStatusBadge
                        state={mediaUploadState}
                        progress={mediaUploadProgress}
                        error={mediaUploadError}
                      />
                    </div>
                    {mediaUploadState !== "uploading" && (
                      <button
                        onClick={() => mediaInputRef.current?.click()}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white hover:bg-black/80 transition-colors"
                        title="Replace again"
                      >
                        <Image size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 h-24 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    <Upload size={18} />
                    <span className="text-xs">Choose new photo</span>
                  </button>
                )}
                {/* Current photo preview */}
                {!newMediaPreview && post.mediaUrl && (
                  <div className="mt-2">
                    <p className="text-[11px] text-muted-foreground mb-1">Current photo</p>
                    <img
                      src={post.mediaUrl}
                      alt="Current"
                      className="w-full max-h-32 object-cover rounded-lg opacity-60"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Replace video (video posts) */}
            {isVideo && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Replace video
                </label>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleVideoFileChange(file);
                    e.target.value = "";
                  }}
                />
                {newVideoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-border bg-black">
                    <video
                      src={newVideoPreview}
                      className="w-full max-h-48 object-cover"
                      muted
                      playsInline
                    />
                    <div className="absolute inset-0 flex items-end p-2">
                      <VideoUploadStatusBadge
                        state={videoUploadState}
                        progress={videoUploadProgress}
                        error={videoUploadError}
                      />
                    </div>
                    {(videoUploadState === "ready" || videoUploadState === "error") && (
                      <button
                        onClick={() => videoInputRef.current?.click()}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white hover:bg-black/80 transition-colors"
                        title="Choose a different video"
                      >
                        <Video size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 h-24 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    <Upload size={18} />
                    <span className="text-xs">Choose new video</span>
                  </button>
                )}
              </div>
            )}

            {/* Replace thumbnail (video posts) */}
            {isVideo && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Replace thumbnail
                </label>
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleThumbFileChange(file);
                    e.target.value = "";
                  }}
                />
                {newThumbPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img
                      src={newThumbPreview}
                      alt="New thumbnail preview"
                      className="w-full max-h-48 object-cover"
                    />
                    <div className="absolute inset-0 flex items-end p-2">
                      <UploadStatusBadge
                        state={thumbUploadState}
                        progress={thumbUploadProgress}
                        error={thumbUploadError}
                      />
                    </div>
                    {thumbUploadState !== "uploading" && (
                      <button
                        onClick={() => thumbInputRef.current?.click()}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white hover:bg-black/80 transition-colors"
                        title="Replace again"
                      >
                        <Film size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => thumbInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 h-24 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    <Upload size={18} />
                    <span className="text-xs">Choose new thumbnail</span>
                  </button>
                )}
                {/* Current thumbnail preview */}
                {!newThumbPreview && post.thumbnailUrl && (
                  <div className="mt-2">
                    <p className="text-[11px] text-muted-foreground mb-1">Current thumbnail</p>
                    <img
                      src={post.thumbnailUrl}
                      alt="Current thumbnail"
                      className="w-full max-h-32 object-cover rounded-lg opacity-60"
                    />
                  </div>
                )}
              </div>
            )}

            {updatePost.isError && (
              <p className="text-xs text-red-400 font-medium flex items-center gap-1.5">
                <AlertCircle size={13} />
                Failed to save changes. Please try again.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/60"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isUploading || updatePost.isPending}
              className={cn(
                "px-5 py-2 text-sm font-semibold rounded-xl transition-colors",
                hasChanges && !isUploading && !updatePost.isPending
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              )}
            >
              {updatePost.isPending ? (
                <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Saving…</span>
              ) : isUploading ? (
                <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Uploading…</span>
              ) : (
                "Save changes"
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function UploadStatusBadge({
  state,
  progress,
  error,
}: {
  state: UploadState;
  progress: number;
  error: string | null;
}) {
  if (state === "idle") return null;
  if (state === "uploading") {
    return (
      <span className="flex items-center gap-1 bg-black/70 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
        <Loader2 size={11} className="animate-spin" />
        {progress}%
      </span>
    );
  }
  if (state === "ready") {
    return (
      <span className="flex items-center gap-1 bg-green-500/80 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
        <CheckCircle size={11} />
        Ready
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 bg-red-500/80 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
        <AlertCircle size={11} />
        {error ?? "Failed"}
      </span>
    );
  }
  return null;
}

function VideoUploadStatusBadge({
  state,
  progress,
  error,
}: {
  state: UploadState;
  progress: number;
  error: string | null;
}) {
  if (state === "idle") return null;
  if (state === "uploading") {
    return (
      <span className="flex items-center gap-1 bg-black/70 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
        <Loader2 size={11} className="animate-spin" />
        Uploading {progress}%
      </span>
    );
  }
  if (state === "processing") {
    return (
      <span className="flex items-center gap-1 bg-black/70 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
        <Loader2 size={11} className="animate-spin" />
        Processing…
      </span>
    );
  }
  if (state === "ready") {
    return (
      <span className="flex items-center gap-1 bg-green-500/80 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
        <CheckCircle size={11} />
        Ready
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 bg-red-500/80 text-white text-[11px] font-medium px-2 py-1 rounded-lg">
        <AlertCircle size={11} />
        {error ?? "Failed"}
      </span>
    );
  }
  return null;
}
