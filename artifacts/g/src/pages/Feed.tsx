import { useState, useRef, useEffect } from "react";
import { useSearch, Link } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useUpload } from "@/contexts/UploadContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetFeed, useCreatePost,
  getGetFeedQueryKey,
  createMuxUploadUrl, getMuxUploadStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PostCard } from "@/components/PostCard";
import { PostSkeleton } from "@/components/SkeletonLoader";
import { Avatar } from "@/components/Avatar";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { uploadToR2Media } from "@/lib/r2Upload";
import { CropModal } from "@/components/CropModal";
import { VideoEditModal } from "@/components/VideoEditModal";
import {
  Image, Video, Radio, BarChart2, Smile, Send, Compass,
  X, Plus, Camera, Upload, Globe, Lock, Users, Zap, DollarSign, Download,
  Search, Loader2, Film, CheckCircle2, AlertCircle, Link2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 10;

type Tab = "new" | "hot" | "following";
type ComposerMode = "text" | "photo" | "video" | "poll" | "feeling" | "gif" | "link";

const EMOJI_CATEGORIES = [
  { label: "😊 Smileys", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","😐","😑","😶","😏","😒","🙄","😬","🤥","😔","😪","😴","😷","🤒","🤕","🤢","🤧","🥵","🥶","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","🙁","☹️","😮","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿"] },
  { label: "👋 Gestures", emojis: ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","💪","🦾","💋","👁️","👀","👅","👄","🫀","🧠","🦷","🦴"] },
  { label: "❤️ Hearts", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","✨","⭐","🌟","💫","⚡","🔥","🌈","☀️","⛅","🌧️","❄️","💧","💦","🌊","🌀","☮️","🙏"] },
  { label: "🎉 Party", emojis: ["🎉","🎊","🎈","🎁","🎀","🎗️","🏆","🥇","🥈","🥉","🏅","🎯","🎮","🎲","🎭","🎨","🎬","🎤","🎧","🎸","🎹","🎷","🎵","🎶","🥁","🪘","🎃","🎄","🎆","🎇","✨","🧨","🪄","🎪"] },
  { label: "🍕 Food", emojis: ["🍕","🍔","🍟","🌭","🍿","🥓","🥚","🍳","🥞","🧇","🥐","🍞","🧀","🥗","🌮","🌯","🍝","🍜","🍣","🍱","🧁","🎂","🍰","🍩","🍪","🍫","🍬","🍭","☕","🍵","🧋","🍺","🍻","🥂","🍷","🥤"] },
  { label: "🐶 Animals", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦆","🦅","🦉","🦋","🐝","🐌","🐞","🐢","🦎","🐍","🐙","🦑","🐬","🐋","🦈","🦁","🦓","🦒","🐘","🦏","🦛"] },
  { label: "🌸 Nature", emojis: ["🌸","🌺","🌻","🌹","🌷","🌼","💐","🍀","🌿","🌱","🪴","🍁","🍂","🍃","🌾","🍄","🌲","🌳","🌴","🌵","🎋","🌊","🌋","⛰️","🏔️","🏝️","🌅","🌄","🌠","🌌","🌃","🌆","🌇","🏙️","🌉"] },
  { label: "🚀 Things", emojis: ["🚀","✈️","🚗","🏎️","🛵","🚲","🚁","🛸","⛵","🚢","💡","🔦","💎","🔑","📱","💻","📷","📸","📹","🎥","🔬","🔭","📡","💰","💳","🎓","📚","📖","✏️","🖊️","📌","📎","🔧","🔨","🗑️","📦","🎒","👑","💍","👓","🕶️","🎭"] },
];

export default function Feed() {
  const isAuthed = useRequireAuth();

  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { registerVideoUpload, clearVideoUpload, registerPhotoUpload, clearPhotoUpload, videoXhrRef, photoXhrRef } = useUpload();
  const [localMuxUploadId, setLocalMuxUploadId] = useState<string>("");

  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<"public" | "followers" | "subscribers_only">("public");
  const [postPrice, setPostPrice] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("text");
  const [activeTab, setActiveTab] = useState<Tab>("new");
  const [isDragOver, setIsDragOver] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // Multi-photo state
  const [photoItems, setPhotoItems] = useState<Array<{ url: string; preview: string }>>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  // Queue of files waiting to be cropped (processed one at a time)
  const cropQueueRef = useRef<File[]>([]);

  const [muxPlaybackId, setMuxPlaybackId] = useState<string>("");
  const [muxAssetId, setMuxAssetId] = useState<string>("");
  const [videoUploadState, setVideoUploadState] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoUploadError, setVideoUploadError] = useState<"storage" | "generic" | null>(null);
  const [videoEditOpen, setVideoEditOpen] = useState(false);
  const [localVideoPreviewUrl, setLocalVideoPreviewUrl] = useState<string>("");
  const [videoDisplayAspect, setVideoDisplayAspect] = useState<string>("auto");
  const [videoTrimStart, setVideoTrimStart] = useState<number>(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoLibraryRef = useRef<HTMLInputElement>(null);
  const videoLibraryRef = useRef<HTMLInputElement>(null);

  // Poll
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  // Feeling
  const [emojiCategory, setEmojiCategory] = useState(0);

  // RedGifs GIF picker
  const [gifSearchOpen, setGifSearchOpen] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifSearchResults, setGifSearchResults] = useState<any[]>([]);
  const [gifSearchLoading, setGifSearchLoading] = useState(false);
  const [gifSearchError, setGifSearchError] = useState<string | null>(null);
  const [gifEmbedUrl, setGifEmbedUrl] = useState<string | null>(null);
  const [gifThumbnailUrl, setGifThumbnailUrl] = useState<string | null>(null);
  const gifSearchInputRef = useRef<HTMLInputElement>(null);
  const gifSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gifSearchAbortRef = useRef<AbortController | null>(null);

  // Link post state
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPreview, setLinkPreview] = useState<{ title: string; description: string | null; image: string | null; domain: string; url: string } | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const [linkPreviewError, setLinkPreviewError] = useState<string | null>(null);
  const linkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const feedParams = { limit: 20, offset: 0, tab: activeTab } as const;

  const { data, isLoading } = useGetFeed(feedParams, {
    query: { queryKey: getGetFeedQueryKey(feedParams), staleTime: 30000 }
  });

  const [postSubmitError, setPostSubmitError] = useState<string | null>(null);
  const [postSuccessMsg, setPostSuccessMsg] = useState<string | null>(null);

  const createPost = useCreatePost({
    mutation: {
      onSuccess: () => {
        setPostSubmitError(null);
        setCaption("");
        setPhotoItems([]);
        setPhotoUploading(false);
        setPhotoUploadProgress(0);
        setPhotoUploadError(null);
        cropQueueRef.current = [];
        setCropSrc(null);
        setMuxPlaybackId("");
        setMuxAssetId("");
        setLocalMuxUploadId("");
        setVideoUploadState("idle");
        setVideoUploadProgress(0);
        setVideoUploadError(null);
        setVideoEditOpen(false);
        setLocalVideoPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return ""; });
        setVideoDisplayAspect("auto");
        setVideoTrimStart(0);
        setVideoTrimEnd(null);
        setGifEmbedUrl(null);
        setGifThumbnailUrl(null);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setComposerOpen(false);
        setComposerMode("text");
        setPostSuccessMsg("Post submitted! It may take a moment to appear while it's being reviewed.");
        setTimeout(() => setPostSuccessMsg(null), 5000);
        setPostPrice("");
        setAllowDownload(false);
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
      },
      onError: (err: unknown) => {
        const msg = (err as any)?.response?.data?.error ?? (err as any)?.message ?? "Failed to post. Please try again.";
        setPostSubmitError(String(msg));
      },
    },
  });

  const displayPosts = data?.posts ?? [];
  const loading = isLoading;
  const isEmpty = !loading && displayPosts.length === 0;

  function extractHashtags(text: string) {
    return [...text.matchAll(/#(\w+)/g)].map(m => m[1]);
  }

  async function searchRedGifs(query: string) {
    if (!query.trim()) { setGifSearchResults([]); setGifSearchError(null); return; }

    // Cancel any previous in-flight request
    if (gifSearchAbortRef.current) gifSearchAbortRef.current.abort();
    const ctrl = new AbortController();
    gifSearchAbortRef.current = ctrl;

    setGifSearchLoading(true);
    setGifSearchResults([]);
    setGifSearchError(null);

    try {
      const res = await fetch(`/api/gifs/search?q=${encodeURIComponent(query)}`, {
        credentials: "include",
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      const data = await res.json();
      if (ctrl.signal.aborted) return;
      if (res.status === 429) {
        setGifSearchError("Too many searches. Wait a moment and try again.");
      } else if (!res.ok) {
        setGifSearchError(data.error ?? "GIF search temporarily unavailable. Try again in a moment.");
      } else {
        setGifSearchResults(data.gifs ?? []);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setGifSearchError("Search failed — check your connection and try again.");
    }
    setGifSearchLoading(false);
  }

  // Debounced input handler — waits 420ms after typing stops before searching
  function handleGifInput(value: string) {
    setGifSearchQuery(value);
    if (gifSearchTimerRef.current) clearTimeout(gifSearchTimerRef.current);
    gifSearchTimerRef.current = setTimeout(() => searchRedGifs(value), 420);
  }

  function selectGif(gif: any) {
    const embedUrl = `https://www.redgifs.com/ifr/${gif.id}`;
    const rawThumb = gif.urls?.thumbnail ?? gif.urls?.poster ?? "";
    const thumbnail = rawThumb ? `/api/gifs/thumb?url=${encodeURIComponent(rawThumb)}` : "";
    setGifEmbedUrl(embedUrl);
    setGifThumbnailUrl(thumbnail);
    setGifSearchOpen(false);
    setComposerOpen(true);
    setComposerMode("gif");
  }

  async function uploadVideoToMux(file: File) {
    setVideoUploadState("uploading");
    setVideoUploadProgress(0);
    setMuxPlaybackId("");
    setMuxAssetId("");
    setLocalMuxUploadId("");
    try {
      const { uploadUrl, uploadId } = await createMuxUploadUrl({ fileSize: file.size });
      registerVideoUpload(uploadId);
      setLocalMuxUploadId(uploadId);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        videoXhrRef.current = xhr;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setVideoUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed"));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "video/*");
        xhr.send(file);
      });
      videoXhrRef.current = null;
      setVideoUploadState("processing");
      // Poll for asset ready
      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 3000));
        const status = await getMuxUploadStatus(uploadId);
        if (status.status === "asset_created" && status.playbackId && status.assetId) {
          setMuxPlaybackId(status.playbackId);
          setMuxAssetId(status.assetId);
          setVideoUploadState("ready");
          clearVideoUpload();
          return;
        }
        if (status.status === "errored" || status.status === "cancelled") {
          throw new Error("Mux processing failed");
        }
        attempts++;
      }
      throw new Error("Timed out waiting for video");
    } catch (err: any) {
      videoXhrRef.current = null;
      clearVideoUpload();
      setVideoUploadState("error");
      setVideoUploadError((err as any)?.data?.storageExceeded ? "storage" : "generic");
    }
  }

  async function uploadPhotoItemToR2(file: File, previewUrl: string) {
    setPhotoUploading(true);
    setPhotoUploadProgress(0);
    setPhotoUploadError(null);
    registerPhotoUpload();
    try {
      const { key } = await uploadToR2Media(file, "posts", (pct) => setPhotoUploadProgress(pct), photoXhrRef);
      setPhotoItems(prev => [...prev, { url: key, preview: previewUrl }]);
    } catch (err: any) {
      setPhotoUploadError(
        (err as any)?.data?.storageExceeded
          ? "storage"
          : (err?.message ?? "Upload failed — try again")
      );
    } finally {
      clearPhotoUpload();
      setPhotoUploading(false);
      // Process next item in the crop queue
      const queue = cropQueueRef.current;
      if (queue.length > 0) {
        const [next, ...rest] = queue;
        cropQueueRef.current = rest;
        setCropSrc(URL.createObjectURL(next));
      }
    }
  }

  // Prevent the browser from navigating when a file is dropped anywhere on the page.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", stop);
    document.addEventListener("drop", stop);
    return () => {
      document.removeEventListener("dragover", stop);
      document.removeEventListener("drop", stop);
    };
  }, []);

  function queuePhotos(files: FileList | File[]) {
    const arr = Array.from(files);
    const slots = MAX_PHOTOS - photoItems.length - (cropQueueRef.current.length + (cropSrc ? 1 : 0) + (photoUploading ? 1 : 0));
    const valid = arr
      .filter(f => f.type.startsWith("image/") && f.size <= 50 * 1024 * 1024)
      .slice(0, Math.max(0, slots));
    if (valid.length === 0) return;
    const [first, ...rest] = valid;
    if (!cropSrc && !photoUploading) {
      // Nothing in progress — start immediately
      cropQueueRef.current = rest;
      setCropSrc(URL.createObjectURL(first));
    } else {
      // Something in progress — append all to queue
      cropQueueRef.current = [...cropQueueRef.current, first, ...rest];
    }
    setComposerMode("photo");
    setComposerOpen(true);
  }

  // Warn the user before leaving the page while an upload is in progress.
  const isUploadInProgress =
    videoUploadState === "uploading" ||
    videoUploadState === "processing" ||
    photoUploading;

  // True when the composer is open and has any unsaved content.
  const hasComposerContent =
    composerOpen && (
      caption.trim().length > 0 ||
      photoItems.length > 0 ||
      videoUploadState !== "idle" ||
      !!gifEmbedUrl ||
      pollQuestion.trim().length > 0 ||
      pollOptions.some(o => o.trim().length > 0) ||
      !!linkUrl
    );

  const shouldWarnBeforeLeave = isUploadInProgress || hasComposerContent;

  useEffect(() => {
    if (!shouldWarnBeforeLeave) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = isUploadInProgress
        ? "Your upload is still in progress. If you leave now, the upload will be lost."
        : "You have an unsaved post draft. If you leave now, your draft will be lost.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldWarnBeforeLeave, isUploadInProgress]);

  function handleFileFromDisk(file: File) {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) return;
    if (isImage) {
      if (file.size > 50 * 1024 * 1024) { alert("File too large. Max 50MB for photos."); return; }
      queuePhotos([file]);
    } else {
      if (file.size > 500 * 1024 * 1024) { alert("File too large. Max 500MB for video."); return; }
      const objectUrl = URL.createObjectURL(file);
      setLocalVideoPreviewUrl(objectUrl);
      setComposerMode("video");
      setComposerOpen(true);
      setVideoEditOpen(true);
      uploadVideoToMux(file);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, type: "photo" | "video") {
    if (type === "photo") {
      const files = e.target.files;
      if (files && files.length > 0) queuePhotos(files);
    } else {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 500 * 1024 * 1024) { alert("File too large. Max 500MB for video."); return; }
      const objectUrl = URL.createObjectURL(file);
      setLocalVideoPreviewUrl(objectUrl);
      setComposerMode("video");
      setComposerOpen(true);
      setVideoEditOpen(true);
      uploadVideoToMux(file);
    }
    e.target.value = "";
  }

  function handlePaste(e: ClipboardEvent | React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;
    e.preventDefault();
    queuePhotos(imageFiles);
  }

  // Global paste listener — lets users paste images anywhere on the page
  // (including when the caption textarea is focused).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => handlePaste(e);
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoItems.length, cropSrc, photoUploading]);

  // Focus the search input after the modal open animation settles,
  // and clean up pending timers/requests when the modal closes.
  useEffect(() => {
    if (!gifSearchOpen) {
      // Cancel debounce timer and abort any in-flight fetch
      if (gifSearchTimerRef.current) clearTimeout(gifSearchTimerRef.current);
      if (gifSearchAbortRef.current) gifSearchAbortRef.current.abort();
      // Reset state for next open
      setGifSearchQuery("");
      setGifSearchResults([]);
      setGifSearchError(null);
      return;
    }
    // 300ms lets the Framer Motion enter animation finish before focusing
    const t = setTimeout(() => gifSearchInputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [gifSearchOpen]);

  // Debounced link preview fetch
  function fetchLinkPreview(url: string) {
    setLinkPreview(null);
    setLinkPreviewError(null);
    if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current);
    let parsedUrl: URL | null = null;
    try { parsedUrl = new URL(url); } catch { return; }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return;
    linkDebounceRef.current = setTimeout(async () => {
      setLinkPreviewLoading(true);
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setLinkPreview(data);
        } else {
          const body = await res.json().catch(() => ({}));
          setLinkPreviewError(body.error ?? "Could not load preview");
        }
      } catch {
        setLinkPreviewError("Could not load preview");
      } finally {
        setLinkPreviewLoading(false);
      }
    }, 700);
  }

  // Read ?mode=photo / ?mode=video from URL (set by the CREATE modal nav buttons)
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const mode = params.get("mode");
    if (mode && (["photo", "video", "poll", "feeling", "gif"] as string[]).includes(mode)) {
      setComposerMode(mode as ComposerMode);
      setComposerOpen(true);
    }
  }, [search]);

  function openMode(mode: ComposerMode) {
    if (mode === "gif") {
      setGifSearchOpen(true);
      return;
    }
    if (composerMode === mode && composerOpen) {
      setComposerOpen(false);
      setComposerMode("text");
    } else {
      setComposerMode(mode);
      setComposerOpen(true);
      if (mode !== "link") {
        setLinkUrl("");
        setLinkPreview(null);
        setLinkPreviewError(null);
      }
      // Note: programmatic .click() on file inputs is blocked on iOS Safari.
      // File selection is handled by the Camera / Library label buttons in the composer.
    }
  }

  function appendEmoji(emoji: string) {
    setCaption(c => c + emoji);
  }

  function submitPost(e: React.FormEvent) {
    e.preventDefault();
    const priceVal = postPrice.trim() ? parseFloat(postPrice) : undefined;
    const pricingFields = {
      ...(priceVal !== undefined && priceVal > 0 ? { price: priceVal } : {}),
      ...(allowDownload ? { allowDownload: true } : {}),
    };
    if (composerMode === "link") {
      if (!linkPreview) return;
      createPost.mutate({ data: { type: "link" as any, caption: caption || linkPreview.title, linkPreview: linkPreview as any, hashtags: extractHashtags(caption), contentRating: "safe" as any, visibility: visibility as any } as any });
      return;
    }
    if (composerMode === "gif") {
      if (!gifEmbedUrl) return;
      createPost.mutate({ data: { type: "gif" as any, caption, embedUrl: gifEmbedUrl, hashtags: extractHashtags(caption), contentRating: "safe" as any, visibility: visibility as any } as any });
      return;
    }
    if (composerMode === "poll") {
      const filledOptions = pollOptions.filter(o => o.trim());
      if (!pollQuestion.trim() || filledOptions.length < 2) return;
      const pollCaption = `[POLL]${pollQuestion}\n[OPTIONS]${filledOptions.join("|")}`;
      createPost.mutate({ data: { type: "text", caption: pollCaption, hashtags: [], contentRating: "safe" as any, visibility: visibility as any } as any });
      return;
    }
    const type = composerMode === "photo" ? "photo" : composerMode === "video" ? "video" : "text";
    if (type === "video") {
      if (!muxPlaybackId || !muxAssetId) return;
      createPost.mutate({ data: {
        type, caption, muxPlaybackId, muxAssetId,
        ...(localMuxUploadId ? { muxUploadId: localMuxUploadId } : {}),
        hashtags: extractHashtags(caption),
        contentRating: "safe" as any,
        visibility: visibility as any,
        ...pricingFields,
        displayAspect: videoDisplayAspect !== "auto" ? videoDisplayAspect : undefined,
        trimStart: videoTrimStart > 0 ? videoTrimStart : undefined,
        trimEnd: videoTrimEnd !== null ? videoTrimEnd : undefined,
      } as any });
      return;
    }
    if (type === "photo") {
      if (photoItems.length === 0) return;
      const urls = photoItems.map(i => i.url);
      createPost.mutate({ data: {
        type: "photo",
        caption,
        mediaUrl: urls[0],
        mediaItems: urls,
        hashtags: extractHashtags(caption),
        contentRating: "safe" as any,
        visibility: visibility as any,
        ...pricingFields,
      } as any });
      return;
    }
    if (!caption.trim()) return;
    createPost.mutate({ data: { type: "text", caption, hashtags: extractHashtags(caption), contentRating: "safe" as any, visibility: visibility as any } as any });
  }

  const canSubmit = composerMode === "link"
    ? !!linkPreview && !linkPreviewLoading
    : composerMode === "gif"
    ? !!gifEmbedUrl
    : composerMode === "poll"
      ? pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2
      : composerMode === "video"
        ? videoUploadState === "ready" && !!muxAssetId && (caption.trim().length > 0 || !!muxPlaybackId)
        : composerMode === "photo"
          // cropSrc being set means a crop modal is open for a pending photo.
          // If cropSrc is null and photoUploading is false, the queue is also
          // empty (invariant maintained by uploadPhotoItemToR2's finally block),
          // so it is safe to allow posting.
          ? photoItems.length > 0 && !photoUploading && !cropSrc
          : caption.trim().length > 0;

  const currentTier = (user as any)?.accountTier ?? "free";

  if (!isAuthed) return null;
  return (
    <div className="px-4 py-5">

      {/* ── CROP MODAL ──────────────────────────────────────────────────── */}
      {cropSrc && (
        <CropModal
          src={cropSrc}
          onDone={croppedFile => {
            const previewUrl = URL.createObjectURL(croppedFile);
            setCropSrc(null);
            uploadPhotoItemToR2(croppedFile, previewUrl);
          }}
          onCancel={() => {
            // Cancel current crop and flush the queue
            setCropSrc(null);
            cropQueueRef.current = [];
          }}
        />
      )}

      {/* ── VIDEO EDIT MODAL ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {videoEditOpen && localVideoPreviewUrl && (
          <VideoEditModal
            muxPlaybackId={muxPlaybackId || undefined}
            localPreviewUrl={localVideoPreviewUrl}
            onDone={({ displayAspect, trimStart, trimEnd }) => {
              setVideoDisplayAspect(displayAspect);
              setVideoTrimStart(trimStart);
              setVideoTrimEnd(trimEnd);
              setVideoEditOpen(false);
            }}
            onCancel={() => setVideoEditOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── POST SUCCESS TOAST ──────────────────────────────────────────── */}
      <AnimatePresence>
        {postSuccessMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-green-500/10 border border-green-500/25 rounded-2xl px-4 py-3 mb-4"
          >
            <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-400 font-medium flex-1">{postSuccessMsg}</p>
            <button onClick={() => setPostSuccessMsg(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TABS ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 border-b border-border/60 pb-0">
        <div className="flex gap-1">
          {([
            { id: "new", label: "New" },
            { id: "hot", label: "🔥 Hot" },
            { id: "following", label: "Following" },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "px-3 py-2.5 text-sm font-semibold rounded-t-lg transition-colors relative whitespace-nowrap",
                activeTab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {activeTab === id && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>


      {/* ── COMPOSER ────────────────────────────────────────────────────── */}
      {/* Hidden file inputs — camera (with capture).
          IDs are used by <label htmlFor> so tapping the label directly opens the picker
          — this works on iOS Safari where programmatic .click() is blocked. */}
      <input
        id="feed-photo-camera"
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={e => handleFileSelect(e, "photo")}
      />
      <input
        id="feed-video-camera"
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={e => handleFileSelect(e, "video")}
      />
      {/* Hidden file inputs — library (no capture, opens photo/file picker) */}
      <input
        id="feed-photo-library"
        ref={photoLibraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => handleFileSelect(e, "photo")}
      />
      <input
        id="feed-video-library"
        ref={videoLibraryRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={e => handleFileSelect(e, "video")}
      />

      {user && (
        <div
          className={cn("relative z-10 bg-card border rounded-2xl mb-5 overflow-hidden transition-colors", isDragOver ? "border-primary ring-2 ring-primary/30" : "border-card-border")}
          onDragEnter={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer.files);
            const imageFiles = files.filter(f => f.type.startsWith("image/") && f.size <= 50 * 1024 * 1024);
            if (imageFiles.length > 0) {
              queuePhotos(imageFiles);
            } else {
              const videoFile = files.find(f => f.type.startsWith("video/"));
              if (videoFile) handleFileFromDisk(videoFile);
            }
          }}
        >
          {/* Prompt row */}
          <div
            className="flex items-center gap-3 p-4 cursor-pointer"
            onClick={() => { setComposerMode("text"); setComposerOpen(!composerOpen); }}
            data-testid="composer-toggle"
          >
            <Avatar user={user as any} size="sm" />
            <div className="flex-1 bg-muted/40 hover:bg-muted/60 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors select-none">
              What's on your mind, {(user as any).displayName?.split(" ")[0]}?
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-around sm:justify-start sm:gap-1 px-4 pb-3 border-t border-card-border pt-2.5">
            {/* Photo */}
            <button
              type="button"
              onClick={() => openMode("photo")}
              className={cn("flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors text-green-400",
                composerMode === "photo" && composerOpen ? "bg-green-400/15" : "hover:bg-muted/60")}
            >
              <Image size={14} /> <span className="hidden sm:inline">Photo</span>
            </button>
            {/* Video */}
            <button
              type="button"
              onClick={() => openMode("video")}
              className={cn("flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors text-blue-400",
                composerMode === "video" && composerOpen ? "bg-blue-400/15" : "hover:bg-muted/60")}
            >
              <Video size={14} /> <span className="hidden sm:inline">Video</span>
            </button>
            {/* Live */}
            <Link href="/go-live">
              <button type="button" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors text-red-400 hover:bg-muted/60">
                <Radio size={14} /> <span className="hidden sm:inline">Live</span>
              </button>
            </Link>
            {/* Poll */}
            <button
              type="button"
              onClick={() => openMode("poll")}
              className={cn("flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors text-purple-400",
                composerMode === "poll" && composerOpen ? "bg-purple-400/15" : "hover:bg-muted/60")}
            >
              <BarChart2 size={14} /> <span className="hidden sm:inline">Poll</span>
            </button>
            {/* Feeling */}
            <button
              type="button"
              onClick={() => openMode("feeling")}
              className={cn("flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors text-yellow-400",
                composerMode === "feeling" && composerOpen ? "bg-yellow-400/15" : "hover:bg-muted/60")}
            >
              <Smile size={14} /> <span className="hidden sm:inline">Feeling</span>
            </button>
            {/* GIF */}
            <button
              type="button"
              onClick={() => openMode("gif")}
              className={cn("flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors text-pink-400",
                composerMode === "gif" && composerOpen ? "bg-pink-400/15" : "hover:bg-muted/60")}
            >
              <Film size={14} /> <span className="hidden sm:inline">GIF</span>
            </button>
            {/* Link */}
            <button
              type="button"
              onClick={() => openMode("link")}
              className={cn("flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors text-cyan-400",
                composerMode === "link" && composerOpen ? "bg-cyan-400/15" : "hover:bg-muted/60")}
            >
              <Link2 size={14} /> <span className="hidden sm:inline">Link</span>
            </button>
          </div>

          {/* Expanded composer */}
          <AnimatePresence>
            {composerOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <form onSubmit={submitPost} className="px-4 pb-4 border-t border-card-border pt-3 space-y-3">

                  {/* ── POLL COMPOSER ── */}
                  {composerMode === "poll" ? (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={pollQuestion}
                        onChange={e => setPollQuestion(e.target.value)}
                        placeholder="Ask a question..."
                        autoFocus
                        maxLength={200}
                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <div className="space-y-2">
                        {pollOptions.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full border-2 border-purple-400/50 flex-shrink-0" />
                            <input
                              type="text"
                              value={opt}
                              onChange={e => {
                                const next = [...pollOptions];
                                next[i] = e.target.value;
                                setPollOptions(next);
                              }}
                              placeholder={`Option ${i + 1}`}
                              maxLength={100}
                              className="flex-1 bg-input border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40"
                            />
                            {pollOptions.length > 2 && (
                              <button type="button" onClick={() => setPollOptions(o => o.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive transition-colors">
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        {pollOptions.length < 4 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions(o => [...o, ""])}
                            className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors px-2"
                          >
                            <Plus size={13} /> Add option
                          </button>
                        )}
                      </div>
                    </div>

                  ) : composerMode === "feeling" ? (
                    /* ── EMOJI PICKER ── */
                    <div className="space-y-2">
                      {/* Current caption / emoji display */}
                      {caption.length > 0 ? (
                        <div className="flex items-start gap-2 bg-muted/30 border border-border/40 rounded-xl px-3 py-2">
                          <span className="text-xl leading-snug flex-1 break-all">{caption}</span>
                          <button
                            type="button"
                            onClick={() => setCaption("")}
                            className="text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0 mt-0.5"
                            title="Clear"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/60 px-1">Tap emojis below to build your post</p>
                      )}
                      {/* Category tabs */}
                      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {EMOJI_CATEGORIES.map((cat, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setEmojiCategory(i)}
                            className={cn("flex-shrink-0 px-2.5 py-1 rounded-lg text-xs transition-colors",
                              emojiCategory === i ? "bg-yellow-400/20 text-yellow-300" : "text-muted-foreground hover:bg-muted/60")}
                          >
                            {cat.label.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                      {/* Emoji grid */}
                      <div className="grid grid-cols-8 sm:grid-cols-10 gap-0.5 max-h-44 overflow-y-auto">
                        {EMOJI_CATEGORIES[emojiCategory].emojis.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            style={{ touchAction: "manipulation" }}
                            onClick={() => appendEmoji(emoji)}
                            className="text-xl aspect-square flex items-center justify-center rounded-lg hover:bg-muted/60 active:scale-90 transition-all"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      {/* Optional text caption */}
                      <textarea
                        value={caption}
                        onChange={e => { setCaption(e.target.value); setPostSubmitError(null); }}
                        placeholder="Or type your message here (emoji appear above as you type)"
                        rows={2}
                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
                      />
                    </div>

                  ) : composerMode === "gif" ? (
                    /* ── GIF COMPOSER ── */
                    <div className="space-y-3">
                      {gifEmbedUrl ? (
                        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                          <iframe
                            src={gifEmbedUrl}
                            className="w-full h-full border-0"
                            allowFullScreen
                            scrolling="no"
                            allow="autoplay; fullscreen"
                          />
                          <button
                            type="button"
                            onClick={() => { setGifEmbedUrl(null); setGifThumbnailUrl(null); setGifSearchOpen(true); }}
                            className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-black transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setGifSearchOpen(true)}
                          className="w-full flex items-center justify-center gap-2 py-10 border-2 border-dashed border-pink-400/40 rounded-xl text-pink-400 hover:border-pink-400/70 hover:bg-pink-400/5 transition-colors"
                        >
                          <Film size={20} />
                          <span className="text-sm font-medium">Choose a GIF</span>
                        </button>
                      )}
                    </div>

                  ) : composerMode === "link" ? (
                    /* ── LINK COMPOSER ── */
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 flex-shrink-0">
                          <Link2 size={14} />
                        </div>
                        <input
                          type="url"
                          autoFocus
                          value={linkUrl}
                          onChange={e => {
                            setLinkUrl(e.target.value);
                            fetchLinkPreview(e.target.value);
                          }}
                          placeholder="Paste a URL — Reddit, YouTube, any website…"
                          className="w-full bg-input border border-border rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/40 placeholder:text-muted-foreground/50"
                        />
                      </div>

                      {linkPreviewLoading && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                          <Loader2 size={13} className="animate-spin" />
                          Loading preview…
                        </div>
                      )}

                      {linkPreviewError && !linkPreviewLoading && (
                        <div className="flex items-center gap-2 text-xs text-red-400 px-1">
                          <AlertCircle size={13} />
                          {linkPreviewError}
                        </div>
                      )}

                      {linkPreview && !linkPreviewLoading && (
                        <div className="rounded-xl overflow-hidden border border-cyan-400/30 bg-muted/30">
                          {linkPreview.image && (
                            <div className="w-full aspect-[1.91/1] overflow-hidden bg-muted">
                              <img
                                src={linkPreview.image}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            </div>
                          )}
                          <div className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <ExternalLink size={10} className="text-muted-foreground flex-shrink-0" />
                              <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium truncate">{linkPreview.domain}</span>
                            </div>
                            <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{linkPreview.title}</p>
                            {linkPreview.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{linkPreview.description}</p>
                            )}
                          </div>
                        </div>
                      )}

                      <textarea
                        value={caption}
                        onChange={e => { setCaption(e.target.value); setPostSubmitError(null); }}
                        placeholder="Add a comment (optional)"
                        rows={2}
                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                      />
                    </div>

                  ) : (
                    /* ── PHOTO / VIDEO / TEXT COMPOSER ── */
                    <>
                      {/* Photo picker area */}
                      {composerMode === "photo" && (
                        <div className="space-y-2">
                          {/* Thumbnails grid */}
                          {photoItems.length > 0 && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                              {photoItems.map((item, idx) => (
                                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-black group">
                                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => setPhotoItems(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                                  >
                                    <X size={11} />
                                  </button>
                                  {idx === 0 && photoItems.length > 1 && (
                                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Cover</div>
                                  )}
                                </div>
                              ))}

                              {/* Uploading placeholder */}
                              {photoUploading && (
                                <div className="relative aspect-square rounded-lg bg-muted/60 border border-border/40 flex flex-col items-center justify-center gap-1">
                                  <Loader2 size={18} className="animate-spin text-primary" />
                                  <span className="text-[10px] text-muted-foreground">{photoUploadProgress}%</span>
                                </div>
                              )}

                              {/* Add more tile */}
                              {!photoUploading && photoItems.length < MAX_PHOTOS && (
                                <label
                                  htmlFor="feed-photo-library"
                                  className="relative aspect-square rounded-lg border-2 border-dashed border-border/60 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                                >
                                  <Plus size={18} className="text-muted-foreground" />
                                  <span className="text-[10px] text-muted-foreground">Add</span>
                                </label>
                              )}
                            </div>
                          )}

                          {/* Upload progress bar (full width, shown while uploading) */}
                          {photoUploading && (
                            <div className="w-full h-1 bg-muted/60 rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${photoUploadProgress}%` }} />
                            </div>
                          )}

                          {/* Error message */}
                          {photoUploadError && (
                            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                              <AlertCircle size={13} className="flex-shrink-0" />
                              {photoUploadError === "storage"
                                ? <span>Storage full — <Link href="/pricing"><span className="underline cursor-pointer">upgrade your plan</span></Link> to upload more</span>
                                : <span>{photoUploadError}</span>
                              }
                            </div>
                          )}

                          {/* Empty state: show picker */}
                          {photoItems.length === 0 && !photoUploading && (
                            <div className="w-full flex flex-col items-center gap-2 py-7 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                              <Camera size={24} />
                              <span className="text-sm font-medium">Add photos or GIFs</span>
                              <span className="text-xs opacity-60">Up to {MAX_PHOTOS} items · JPG, PNG, GIF, WebP</span>
                              <div className="flex items-center gap-3 mt-1">
                                <label
                                  htmlFor="feed-photo-camera"
                                  className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Camera size={12} /> Camera
                                </label>
                                <label
                                  htmlFor="feed-photo-library"
                                  className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 hover:bg-muted px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Upload size={12} /> Library
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Status row: count + queue info */}
                          {(photoItems.length > 0 || photoUploading) && (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
                              <span>
                                {photoItems.length} / {MAX_PHOTOS} photo{photoItems.length !== 1 ? "s" : ""}
                                {cropQueueRef.current.length > 0 && ` · ${cropQueueRef.current.length} queued`}
                              </span>
                              {photoItems.length > 0 && (
                                <div className="flex items-center gap-1 text-green-400">
                                  <CheckCircle2 size={11} />
                                  Ready to post
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Video file picker area */}
                      {composerMode === "video" && (
                        <div>
                          {videoUploadState !== "idle" ? (
                            <div className="relative rounded-xl overflow-hidden bg-black/60 border border-border/40 flex flex-col items-center justify-center gap-3 py-10">
                              {videoUploadState === "error" ? (
                                videoUploadError === "storage" ? (
                                  <p className="text-sm text-red-400 font-medium text-center px-4">
                                    Storage full —{" "}
                                    <Link href="/pricing"><span className="underline cursor-pointer">upgrade your plan</span></Link>
                                    {" "}to upload more
                                  </p>
                                ) : (
                                  <p className="text-sm text-red-400 font-medium">Upload failed — try again</p>
                                )
                              ) : videoUploadState === "uploading" ? (
                                <>
                                  <Loader2 size={22} className="animate-spin text-primary" />
                                  <p className="text-sm text-white font-medium">Uploading to Mux… {videoUploadProgress}%</p>
                                  <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${videoUploadProgress}%` }} />
                                  </div>
                                </>
                              ) : videoUploadState === "ready" ? (
                                <div className="flex items-center gap-2 text-green-400">
                                  <CheckCircle2 size={18} />
                                  <span className="text-sm font-semibold">Video ready</span>
                                </div>
                              ) : (
                                <p className="text-sm text-white font-medium animate-pulse">Processing video…</p>
                              )}
                              {(videoUploadState === "error" || videoUploadState === "ready") && (
                                <button
                                  type="button"
                                  onClick={() => { setMuxPlaybackId(""); setMuxAssetId(""); setVideoUploadState("idle"); }}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="w-full flex flex-col items-center gap-2 py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                              <Video size={24} />
                              <span className="text-sm font-medium">Record video or choose from library</span>
                              <span className="text-xs opacity-60">Supports MP4, MOV, WebM — max 500 MB</span>
                              <div className="flex items-center gap-3 mt-1">
                                <label
                                  htmlFor="feed-video-camera"
                                  className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Camera size={12} /> Camera
                                </label>
                                <label
                                  htmlFor="feed-video-library"
                                  className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 hover:bg-muted px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Upload size={12} /> Library
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <textarea
                        value={caption}
                        onChange={e => { setCaption(e.target.value); setPostSubmitError(null); }}
                        placeholder={
                          composerMode === "photo" ? "Add a caption..." :
                          composerMode === "video" ? "Describe your video..." :
                          "Share your thoughts... use #hashtags to reach more people"
                        }
                        data-testid="post-caption-input"
                        rows={3}
                        autoFocus={composerMode === "text"}
                        className="w-full bg-input border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </>
                  )}

                  {/* Visibility + Content rating row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                      { value: "public",           label: "Public",      icon: <Globe size={11} />,  cls: "border-blue-500/30 text-blue-400 bg-blue-500/10" },
                      { value: "followers",        label: "Followers",   icon: <Users size={11} />,  cls: "border-purple-500/30 text-purple-400 bg-purple-500/10" },
                      { value: "subscribers_only", label: "Subscribers", icon: <Lock size={11} />,   cls: "border-amber-500/30 text-amber-400 bg-amber-500/10" },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setVisibility(opt.value)}
                        className={cn(
                          "flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors",
                          visibility === opt.value
                            ? opt.cls
                            : "border-border/40 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
                        )}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Monetization options (photo/video only) */}
                  {(composerMode === "photo" || composerMode === "video") && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground font-medium flex-shrink-0">Monetize:</span>
                      <button
                        type="button"
                        onClick={() => { setPostPrice(p => p ? "" : "5.00"); if (postPrice) setAllowDownload(false); }}
                        className={cn(
                          "flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors",
                          postPrice
                            ? "border-rose-500/30 text-rose-400 bg-rose-500/10"
                            : "border-border/40 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
                        )}
                      >
                        <DollarSign size={10} />
                        {postPrice ? `$${postPrice}` : "Free"}
                      </button>
                      {postPrice && (
                        <>
                          <input
                            type="number"
                            min="0.99"
                            max="999"
                            step="0.01"
                            value={postPrice}
                            onChange={e => setPostPrice(e.target.value)}
                            className="w-16 bg-input border border-border rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                          <button
                            type="button"
                            onClick={() => setAllowDownload(d => !d)}
                            className={cn(
                              "flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors",
                              allowDownload
                                ? "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
                                : "border-border/40 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
                            )}
                          >
                            <Download size={10} />
                            {allowDownload ? "Download ✓" : "+Download"}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Upload-in-progress status strip */}
                  {isUploadInProgress && (
                    <div className="flex flex-col gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />
                        <span className="text-xs font-semibold text-amber-300">
                          {videoUploadState === "uploading"
                            ? `Uploading video… ${videoUploadProgress}%`
                            : videoUploadState === "processing"
                            ? "Processing video — almost done…"
                            : `Uploading photo… ${photoUploadProgress}%`}
                        </span>
                        <span className="ml-auto text-[10px] text-amber-400/70 whitespace-nowrap">Don't close this tab</span>
                      </div>
                      {(videoUploadState === "uploading" || photoUploading) && (
                        <div className="h-1 bg-amber-500/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all duration-300"
                            style={{ width: `${videoUploadState === "uploading" ? videoUploadProgress : photoUploadProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submit row */}
                  <div className="flex items-center justify-between">
                    {composerMode !== "poll" && (
                      <p className="text-xs text-muted-foreground">{caption.length}/500</p>
                    )}
                    {composerMode === "poll" && (
                      <p className="text-xs text-muted-foreground">{pollOptions.filter(o => o.trim()).length} / 4 options</p>
                    )}
                    {postSubmitError && (
                      <p className="text-xs text-red-400 font-medium max-w-[200px] text-right">{postSubmitError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={createPost.isPending || !canSubmit}
                      data-testid="submit-post-button"
                      className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 ml-auto"
                    >
                      <Send size={14} />
                      {createPost.isPending ? "Posting..." : "Post"}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── REDGIFS SEARCH MODAL ────────────────────────────────────────── */}
      <AnimatePresence>
        {gifSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setGifSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
              className="bg-popover border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col"
              style={{ maxHeight: "85vh" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/60 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Film size={16} className="text-pink-400" />
                  <h3 className="font-bold text-sm">Search RedGifs</h3>
                </div>
                <button onClick={() => setGifSearchOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                  <X size={16} />
                </button>
              </div>

              {/* Search input */}
              <div className="px-4 py-3 flex-shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                  <input
                    ref={gifSearchInputRef}
                    type="search"
                    inputMode="search"
                    value={gifSearchQuery}
                    onChange={e => handleGifInput(e.target.value)}
                    placeholder="Search for GIFs..."
                    className="w-full pl-9 pr-4 py-2.5 bg-input border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-400/40"
                  />
                </div>
              </div>

              {/* Results grid */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
                {gifSearchLoading ? (
                  <div className="flex items-center justify-center py-14">
                    <Loader2 size={24} className="text-pink-400 animate-spin" />
                  </div>
                ) : gifSearchError ? (
                  <div className="flex flex-col items-center justify-center py-14 text-muted-foreground px-4 text-center">
                    <Film size={32} className="mb-3 opacity-40" />
                    <p className="text-sm font-medium text-red-400">{gifSearchError}</p>
                    <button
                      onClick={() => searchRedGifs(gifSearchQuery)}
                      className="mt-3 text-xs text-pink-400 hover:text-pink-300 underline"
                    >Retry</button>
                  </div>
                ) : gifSearchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                    <Film size={32} className="mb-3 opacity-40" />
                    <p className="text-sm font-medium">{gifSearchQuery ? "No GIFs found" : "Type to search for GIFs"}</p>
                    <p className="text-xs opacity-60 mt-1">Powered by RedGifs</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {gifSearchResults.map((gif: any) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => selectGif(gif)}
                        className="relative aspect-video rounded-xl overflow-hidden bg-muted/40 hover:ring-2 hover:ring-pink-400 transition-all group"
                      >
                        <img
                          src={gif.urls?.thumbnail ? `/api/gifs/thumb?url=${encodeURIComponent(gif.urls.thumbnail)}` : gif.urls?.poster ? `/api/gifs/thumb?url=${encodeURIComponent(gif.urls.poster)}` : ""}
                          alt={gif.title ?? ""}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── POSTS ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map(i => <PostSkeleton key={i} />)}
        </div>
      ) : isEmpty ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card border border-card-border rounded-2xl">
          <Compass size={36} className="text-primary mx-auto mb-3" />
          <p className="font-semibold mb-1">
            {activeTab === "following" ? "No posts from people you follow" : activeTab === "hot" ? "Nothing hot right now" : "No posts yet"}
          </p>
          <p className="text-sm text-muted-foreground mb-5">
            {activeTab === "following" ? "Follow some creators to see their posts here." : "Check back soon for new content."}
          </p>
          <Link href="/explore">
            <button className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
              Discover creators
            </button>
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {displayPosts.map((post: any) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
