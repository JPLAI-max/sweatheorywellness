import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateStream, useUpdateStream, useListStreams, useSearchUsers, useCreatePost, getSearchUsersQueryKey, getListStreamsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Radio, DollarSign, Users, Send, Mic, MicOff, Video, VideoOff, PhoneOff, Star, Film, MessageSquare, Smile, ChevronRight, BadgeCheck, Globe, Lock, UserX, Bell, X, Plus, Search, Copy, Eye, EyeOff, Monitor, Check, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VideoTile } from "@/components/VideoTile";
import { Avatar } from "@/components/Avatar";
import { useCategories } from "@/lib/categories";
import { WatchPartyPlayer } from "@/components/WatchPartyPlayer";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

const EVIL_EMOJIS = ["😈","👿","💀","🔥","🖤","🥵","💦","👅","🍆","🍑","😏","🤤","🫦","💋","🙊","😜","🤭","🫠","😤","🫀"];

function FloatingEmojiLayer() {
  const [emojis, setEmojis] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
  const counter = useRef(0);
  useEffect(() => {
    function spawn() {
      const id = counter.current++;
      const emoji = EVIL_EMOJIS[Math.floor(Math.random() * EVIL_EMOJIS.length)];
      const x = 4 + Math.random() * 58;
      setEmojis(prev => [...prev.slice(-25), { id, emoji, x }]);
      setTimeout(() => setEmojis(prev => prev.filter(e => e.id !== id)), 3600);
    }
    spawn();
    const iv = setInterval(spawn, 700 + Math.random() * 900);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <AnimatePresence>
        {emojis.map(e => (
          <motion.span
            key={e.id}
            className="absolute text-2xl select-none"
            style={{ left: `${e.x}%`, bottom: "130px" }}
            initial={{ y: 0, opacity: 1, scale: 0.7 }}
            animate={{ y: -300, opacity: 0, scale: 1.4 }}
            exit={{}}
            transition={{ duration: 3.2, ease: "easeOut" }}
          >
            {e.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ChatMsg { username: string; displayName: string; message: string; timestamp: number; }
interface VideoParticipant { id: string; username: string; displayName: string; stream: MediaStream | null; isMuted: boolean; }

function getWsUrl(streamId: number) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/api/ws/stream/${streamId}`;
  const devToken = typeof localStorage !== "undefined" ? localStorage.getItem("g_dev_token") : null;
  return devToken ? `${base}?token=${encodeURIComponent(devToken)}` : base;
}

/** Fetch wrapper that adds the Bearer token when a dev-preview token exists. */
function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const devToken = typeof localStorage !== "undefined" ? localStorage.getItem("g_dev_token") : null;
  const headers = new Headers(init.headers);
  if (devToken) headers.set("Authorization", `Bearer ${devToken}`);
  return fetch(url, { credentials: "include", ...init, headers });
}

export default function GoLive() {
  const [, setLocation] = useLocation();
  const { categories: CATEGORIES } = useCategories();
  const isAuthed = useRequireAuth();

  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<"setup" | "live">("setup");
  const [streamId, setStreamId] = useState<number | null>(null);
  const [activeWatchUrl, setActiveWatchUrl] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "", description: "", category: "", thumbnailUrl: "",
    isPaid: false, accessPrice: "",
    watchPartyUrl: "",
  });
  const [audienceType, setAudienceType] = useState<"public" | "girls_only" | "guys_only" | "private" | "invite_only">("public");
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [invitedUsers, setInvitedUsers] = useState<Array<{ id: number; displayName: string; username: string; avatarUrl?: string | null }>>([]);
  const [inviteSearch, setInviteSearch] = useState("");

  const [wpTab, setWpTab] = useState<"url" | "upload">("url");
  const [wpUploadState, setWpUploadState] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const [wpUploadProgress, setWpUploadProgress] = useState(0);
  const [wpUploadError, setWpUploadError] = useState("");
  const wpPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wpMuxPlaybackId, setWpMuxPlaybackId] = useState<string | null>(null);
  const [wpMuxAssetId, setWpMuxAssetId] = useState<string | null>(null);

  // Live watch party management panel
  const [showWpLivePanel, setShowWpLivePanel] = useState(false);
  const [newWpLiveUrl, setNewWpLiveUrl] = useState("");
  const [wpLivePanelError, setWpLivePanelError] = useState("");

  // Save-video modal (shown when ending stream after an upload)
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCaption, setSaveCaption] = useState("");
  const [savingPost, setSavingPost] = useState(false);

  // Live state
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [camError, setCamError] = useState("");
  const [videoParticipants, setVideoParticipants] = useState<VideoParticipant[]>([]);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [myId, setMyId] = useState("");
  const showChat = true;

  const localVideoRef = useRef<HTMLVideoElement>(null);   // main stage
  const tileVideoRef = useRef<HTMLVideoElement>(null);    // bottom tile
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const broadcastPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map()); // main stream → each viewer
  const tilePeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());      // receiving viewer cams
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: streamsData } = useListStreams({ limit: 20 });
  const searchParams = { q: inviteSearch, limit: 8 };
  const { data: searchData } = useSearchUsers(searchParams, { query: { queryKey: getSearchUsersQueryKey(searchParams), enabled: inviteSearch.length >= 2 } });
  const allStreams: any[] = (streamsData as any)?.streams ?? (Array.isArray(streamsData) ? streamsData : []);
  const liveStreams = allStreams.filter((s: any) => s.status === "live");

  const updateStream = useUpdateStream();
  const createStream = useCreateStream({
    mutation: {
      onSuccess: async (data: any) => {
        setStreamId(data.id);
        setActiveWatchUrl(form.watchPartyUrl);
        setPhase("live");
        localStorage.setItem("g_my_stream_id", String(data.id));
        if (form.watchPartyUrl) localStorage.setItem("g_watch_party_url", form.watchPartyUrl);
        else localStorage.removeItem("g_watch_party_url");
        queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
        // Fetch Mux RTMP credentials for OBS
        authedFetch(`/api/streams/${data.id}/stream-credentials`)
          .then(r => r.ok ? r.json() : null)
          .then((creds: any) => { if (creds) setMuxCreds(creds); })
          .catch(() => {});
      },
      onError: (err: any) => setError(err?.data?.error || "Failed to start stream"),
    }
  });

  const [muxCreds, setMuxCreds] = useState<{ rtmpUrl: string; streamKey: string; muxPlaybackId: string } | null>(null);
  const [showObs, setShowObs] = useState(true);
  const [streamKeyVisible, setStreamKeyVisible] = useState(false);
  const [copiedField, setCopiedField] = useState<"url" | "key" | null>(null);

  const [resumableStreamId, setResumableStreamId] = useState<number | null>(null);

  // Check for a saved stream — verify it's still live before offering resume
  useEffect(() => {
    if (phase !== "setup") return;
    const raw = localStorage.getItem("g_my_stream_id");
    const savedId = parseInt(raw ?? "");
    if (isNaN(savedId) || savedId <= 0) return;

    fetch(`/api/streams/${savedId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.status === "live") {
          setResumableStreamId(savedId);
        } else {
          localStorage.removeItem("g_my_stream_id");
          localStorage.removeItem("g_watch_party_url");
        }
      })
      .catch(() => {
        localStorage.removeItem("g_my_stream_id");
        localStorage.removeItem("g_watch_party_url");
      });
  }, []);

  function resumeStream() {
    const savedId = resumableStreamId!;
    setActiveWatchUrl(localStorage.getItem("g_watch_party_url") ?? "");
    setStreamId(savedId);
    setResumableStreamId(null);
    setPhase("live");
  }

  function dismissResume() {
    localStorage.removeItem("g_my_stream_id");
    localStorage.removeItem("g_watch_party_url");
    setResumableStreamId(null);
  }

  async function handleWpFileUpload(file: File) {
    setWpUploadState("uploading");
    setWpUploadProgress(0);
    setWpUploadError("");
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("g_dev_token") : null;
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (token) hdrs["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/mux/upload-url", {
        method: "POST", credentials: "include", headers: hdrs,
        body: JSON.stringify({ fileSize: file.size }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as any;
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const { uploadId, uploadUrl } = await res.json() as { uploadId: string; uploadUrl: string };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setWpUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("Upload to Mux failed")));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", uploadUrl);
        xhr.send(file);
      });

      setWpUploadState("processing");

      const pollHdrs: Record<string, string> = {};
      if (token) pollHdrs["Authorization"] = `Bearer ${token}`;
      if (wpPollRef.current) clearInterval(wpPollRef.current);
      wpPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/mux/upload/${uploadId}`, { credentials: "include", headers: pollHdrs });
          const s = await statusRes.json() as { status: string; playbackId?: string; assetId?: string };
          if (s.status === "asset_created" && s.playbackId) {
            if (wpPollRef.current) clearInterval(wpPollRef.current);
            const muxUrl = `https://stream.mux.com/${s.playbackId}.m3u8`;
            setForm(f => ({ ...f, watchPartyUrl: muxUrl }));
            setWpMuxPlaybackId(s.playbackId);
            if (s.assetId) setWpMuxAssetId(s.assetId);
            setWpUploadState("ready");
            setWpTab("url");
            // If we're already live, push the URL to the server immediately
            if (phase === "live") handleUpdateWatchPartyLive(muxUrl);
          } else if (s.status === "errored") {
            if (wpPollRef.current) clearInterval(wpPollRef.current);
            setWpUploadState("error");
            setWpUploadError("Video processing failed. Please try again.");
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (err: any) {
      setWpUploadState("error");
      setWpUploadError(err.message ?? "Upload failed");
    }
  }

  useEffect(() => { return () => { if (wpPollRef.current) clearInterval(wpPollRef.current); }; }, []);

  useEffect(() => {
    if (phase !== "live" || !streamId) return;
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        if (tileVideoRef.current) {
          tileVideoRef.current.srcObject = stream;
          tileVideoRef.current.play().catch(() => {});
        }
        connectSignaling(streamId!);
      } catch {
        if (!cancelled) setCamError("Camera access denied. Check your browser permissions.");
      }
    }
    start();
    return () => { cancelled = true; cleanup(); };
  }, [phase, streamId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── HEARTBEAT — keeps the stream marked live while the host is on the page ─
  useEffect(() => {
    if (phase !== "live" || !streamId) return;
    function sendHeartbeat() {
      authedFetch(`/api/streams/${streamId}/heartbeat`, { method: "POST" }).catch(() => {});
    }
    sendHeartbeat(); // immediate first beat
    const iv = setInterval(sendHeartbeat, 30_000);
    return () => clearInterval(iv);
  }, [phase, streamId]);

  // ── END STREAM on page close / navigation ──────────────────────────────────
  useEffect(() => {
    if (phase !== "live" || !streamId) return;
    function handleUnload() {
      // Use sendBeacon so the request fires even as the page unloads
      navigator.sendBeacon(`/api/streams/${streamId}`, JSON.stringify({ status: "ended" }));
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [phase, streamId]);


  // ── IDLE DETECTION ──────────────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const CHAT_EMOJIS = ["😈","👿","💀","🔥","🖤","🥵","💦","👅","🍆","🍑","😏","🤤","🫦","💋","😜","🤭","🫠","❤️","🥺","😭","😂","💯","🙌","👀","✨","🍒","🌹","💅","🦋","🌙","⚡","🎭","🎪","🍓","🍀"];

  const [idleWarning, setIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(60);
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetIdle = () => {
    lastActivityRef.current = Date.now();
    setIdleWarning(false);
    setIdleCountdown(60);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (phase === "live") {
      idleTimerRef.current = setTimeout(() => {
        setIdleWarning(true);
        setIdleCountdown(60);
        countdownRef.current = setInterval(() => {
          setIdleCountdown(n => {
            if (n <= 1) { endStream(); return 0; }
            return n - 1;
          });
        }, 1000);
      }, 5 * 60 * 1000);
    }
  };

  useEffect(() => {
    if (phase !== "live") return;
    const events = ["mousemove", "keydown", "touchstart", "click", "scroll"] as const;
    const handler = () => resetIdle();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetIdle();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [phase]);

  function connectSignaling(sid: number) {
    const ws = new WebSocket(getWsUrl(sid));
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "join", role: "broadcaster", streamId: sid,
        username: (user as any)?.username ?? "host",
        displayName: (user as any)?.displayName ?? "Host",
      }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "ready": setMyId(msg.id); break;
        case "viewer-joined": handleViewerJoined(msg); break;
        case "viewer-left": handleViewerLeft(msg.viewerId); break;
        case "answer": handleBroadcastAnswer(msg.viewerId, msg.sdp); break;
        case "ice-candidate": handleBroadcastIce(msg.viewerId, msg.candidate); break;
        case "new-video-participant": handleNewVideoParticipant(msg); break;
        case "video-participant-left": handleVideoParticipantLeft(msg.participantId); break;
        case "p2p-answer": handleTileAnswer(msg.fromId, msg.sdp); break;
        case "p2p-ice": handleTileIce(msg.fromId, msg.candidate); break;
        case "viewer-count":
          setViewerCount(msg.count);
          updateStream.mutate({ streamId: sid, data: { viewerCount: msg.count } });
          break;
        case "chat": setChatMessages(prev => [...prev.slice(-99), msg]); break;
      }
    };
    ws.onerror = () => setCamError("Connection error.");
  }

  // ── MAIN BROADCAST: send host stream to each viewer ────────────────────────

  async function handleViewerJoined(msg: any) {
    const { viewerId, username, displayName, hasVideo } = msg;
    await startBroadcastPeer(viewerId);
    if (hasVideo) {
      addVideoParticipant(viewerId, username, displayName);
      await connectToViewerCam(viewerId);
    }
  }

  async function startBroadcastPeer(viewerId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    broadcastPeersRef.current.set(viewerId, pc);
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: "ice-candidate", candidate: e.candidate, viewerId }));
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: "offer", sdp: offer, viewerId }));
    } catch {}
  }

  async function handleBroadcastAnswer(viewerId: string, sdp: RTCSessionDescriptionInit) {
    const pc = broadcastPeersRef.current.get(viewerId);
    try { if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch {}
  }

  async function handleBroadcastIce(viewerId: string, candidate: RTCIceCandidateInit) {
    const pc = broadcastPeersRef.current.get(viewerId);
    try { if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  function handleViewerLeft(viewerId: string) {
    const pc = broadcastPeersRef.current.get(viewerId);
    if (pc) { pc.close(); broadcastPeersRef.current.delete(viewerId); }
    handleVideoParticipantLeft(viewerId);
  }

  // ── TILE P2P: receive viewer cam streams ───────────────────────────────────

  function addVideoParticipant(id: string, username: string, displayName: string) {
    setVideoParticipants(prev => {
      if (prev.find(p => p.id === id)) return prev;
      return [...prev, { id, username, displayName, stream: null, isMuted: false }];
    });
  }

  async function connectToViewerCam(viewerId: string) {
    if (tilePeersRef.current.has(viewerId)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    tilePeersRef.current.set(viewerId, pc);
    // recvonly — we want to receive their cam
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setVideoParticipants(prev => prev.map(p => p.id === viewerId ? { ...p, stream: e.streams[0] } : p));
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: "p2p-ice", toId: viewerId, candidate: e.candidate }));
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: "p2p-offer", toId: viewerId, sdp: offer }));
    } catch {}
  }

  async function handleNewVideoParticipant(msg: any) {
    const { participantId, username, displayName } = msg;
    addVideoParticipant(participantId, username, displayName);
    await connectToViewerCam(participantId);
  }

  async function handleTileAnswer(fromId: string, sdp: RTCSessionDescriptionInit) {
    const pc = tilePeersRef.current.get(fromId);
    try { if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch {}
  }

  async function handleTileIce(fromId: string, candidate: RTCIceCandidateInit) {
    const pc = tilePeersRef.current.get(fromId);
    try { if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  function handleVideoParticipantLeft(participantId: string) {
    const pc = tilePeersRef.current.get(participantId);
    if (pc) { pc.close(); tilePeersRef.current.delete(participantId); }
    setVideoParticipants(prev => prev.filter(p => p.id !== participantId));
    if (spotlightId === participantId) setSpotlightId(null);
  }

  // ── HOST CONTROLS ──────────────────────────────────────────────────────────

  function muteParticipant(participantId: string) {
    wsRef.current?.send(JSON.stringify({ type: "mute-participant", targetId: participantId }));
    setVideoParticipants(prev => prev.map(p => p.id === participantId ? { ...p, isMuted: !p.isMuted } : p));
  }

  function removeParticipant(participantId: string) {
    wsRef.current?.send(JSON.stringify({ type: "remove-participant", targetId: participantId }));
    handleVideoParticipantLeft(participantId);
  }

  function toggleSpotlight(participantId: string) {
    const next = spotlightId === participantId ? null : participantId;
    setSpotlightId(next);
    wsRef.current?.send(JSON.stringify({ type: "spotlight-participant", targetId: next }));
  }

  // ── LOCAL CONTROLS ─────────────────────────────────────────────────────────

  function toggleAudio() {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setAudioOn(t.enabled); }
  }

  function toggleVideo() {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setVideoOn(t.enabled); }
  }

  const createPost = useCreatePost({
    mutation: { onSettled: () => setSavingPost(false) },
  });

  async function doEndStream() {
    cleanup();
    localStorage.removeItem("g_my_stream_id");
    localStorage.removeItem("g_watch_party_url");
    if (streamId) {
      await updateStream.mutateAsync({ streamId, data: { status: "ended" } });
      queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    }
    setLocation("/feed");
  }

  async function endStream() {
    // If a watch party video was uploaded, prompt to save it first
    if (wpMuxPlaybackId) {
      setShowSaveModal(true);
      return;
    }
    await doEndStream();
  }

  async function handleSaveVideo() {
    setSavingPost(true);
    try {
      await createPost.mutateAsync({
        data: {
          type: "video" as any,
          caption: saveCaption.trim() || `Watch party from my stream`,
          muxPlaybackId: wpMuxPlaybackId!,
          muxAssetId: wpMuxAssetId ?? undefined,
          hashtags: [],
        } as any,
      });
    } catch { /* ignore — navigate anyway */ }
    await doEndStream();
  }

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    // Optimistic: add to local chat immediately so the broadcaster sees their message
    setChatMessages(prev => [...prev.slice(-99), {
      username: (user as any)?.username ?? "host",
      displayName: (user as any)?.displayName ?? "Host",
      message: msg,
      timestamp: Date.now(),
    }]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "chat", message: msg }));
    }
    setChatInput("");
    setShowEmojiPicker(false);
  }

  function cleanup() {
    wsRef.current?.close();
    broadcastPeersRef.current.forEach(pc => pc.close());
    broadcastPeersRef.current.clear();
    tilePeersRef.current.forEach(pc => pc.close());
    tilePeersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
  }

  function field(name: keyof typeof form) {
    return {
      value: form[name] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(f => ({ ...f, [name]: e.target.value })),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    // End any previously active stream before creating a new one
    const prevId = parseInt(localStorage.getItem("g_my_stream_id") ?? "");
    if (!isNaN(prevId) && prevId > 0) {
      await authedFetch(`/api/streams/${prevId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
      }).catch(() => {});
      localStorage.removeItem("g_my_stream_id");
      localStorage.removeItem("g_watch_party_url");
    }
    createStream.mutate({
      data: {
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        thumbnailUrl: form.thumbnailUrl || undefined,
        isPrivate: audienceType === "private" || audienceType === "invite_only",
        isPaid: form.isPaid,
        accessPrice: form.isPaid && form.accessPrice ? parseFloat(form.accessPrice) : undefined,
        watchPartyUrl: form.watchPartyUrl || undefined,
        audienceType,
        inviteUserIds: audienceType === "invite_only" ? invitedUsers.map(u => u.id) : undefined,
        notifyFollowers,
      } as any
    });
  }

  const searchResults: any[] = (searchData as any)?.users ?? (Array.isArray(searchData) ? searchData : []);

  function addInvite(u: any) {
    if (!invitedUsers.find(x => x.id === u.id)) {
      setInvitedUsers(prev => [...prev, { id: u.id, displayName: u.displayName, username: u.username, avatarUrl: u.avatarUrl }]);
    }
    setInviteSearch("");
  }

  function removeInvite(id: number) {
    setInvitedUsers(prev => prev.filter(u => u.id !== id));
  }

  const handleWatchPartySync = useCallback((time: number, isPlaying: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: "watch-party-sync", currentTime: time, isPlaying }));
  }, []);

  const handleUpdateWatchPartyLive = useCallback(async (url: string | null) => {
    if (!streamId) return;
    setWpLivePanelError("");
    try {
      await updateStream.mutateAsync({ streamId, data: { watchPartyUrl: url ?? "" } });
      setActiveWatchUrl(url ?? "");
      if (url) localStorage.setItem("g_watch_party_url", url);
      else localStorage.removeItem("g_watch_party_url");
      setShowWpLivePanel(false);
      setNewWpLiveUrl("");
    } catch {
      setWpLivePanelError("Update failed — please try again.");
    }
  }, [streamId, updateStream]);

  // ══════════════════════════════════════════════════════════════════════════
  // LIVE PHASE
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === "live") {
    const totalOnStage = videoParticipants.length + 1;
    return (
      <div className="flex flex-col overflow-hidden h-[calc(100dvh-112px)] xl:h-[calc(100dvh-56px)]" style={{ background: "#000" }}>

        {/* ── FULL-BLEED VIDEO STAGE ────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0 overflow-hidden" style={{ background: "#000", touchAction: "manipulation" }}>

            {/* Watch party player OR camera feed */}
            {activeWatchUrl ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <WatchPartyPlayer url={activeWatchUrl} isHost={true} onSync={handleWatchPartySync} />
              </div>
            ) : camError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
                style={{ background: "linear-gradient(135deg, #1a0020 0%, #0a0a0a 100%)" }}>
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <VideoOff size={28} className="text-red-400" />
                </div>
                <p className="text-white font-semibold mb-1">Camera access denied</p>
                <p className="text-zinc-500 text-sm">{camError}</p>
              </div>
            ) : (
              <video ref={localVideoRef} autoPlay muted playsInline
                className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !videoOn && "opacity-0")} />
            )}

            {/* Dark gradient at top for overlays */}
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />

            {/* TOP-RIGHT: OBS / RTMP credentials panel */}
            {muxCreds && showObs && (
              <div className="absolute top-4 right-4 z-30 w-80 rounded-xl overflow-hidden"
                style={{ background: "rgba(10,10,20,0.92)", border: "1px solid rgba(0,212,255,0.25)", backdropFilter: "blur(12px)" }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                  <div className="flex items-center gap-2">
                    <Monitor size={14} className="text-cyan-400" />
                    <span className="text-white text-xs font-bold tracking-wide">OBS / RTMP Setup</span>
                  </div>
                  <button onClick={() => setShowObs(false)} className="text-zinc-500 hover:text-white transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {/* RTMP Server */}
                  <div>
                    <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-1">Server / RTMP URL</p>
                    <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2 border border-white/6">
                      <code className="text-cyan-300 text-[11px] flex-1 truncate">{muxCreds.rtmpUrl}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(muxCreds.rtmpUrl); setCopiedField("url"); setTimeout(() => setCopiedField(null), 2000); }}
                        className="flex-shrink-0 text-zinc-500 hover:text-cyan-400 transition-colors"
                      >
                        {copiedField === "url" ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  {/* Stream Key */}
                  <div>
                    <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest mb-1">Stream Key</p>
                    <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2 border border-white/6">
                      <code className="text-amber-300 text-[11px] flex-1 truncate">
                        {streamKeyVisible ? muxCreds.streamKey : "•".repeat(Math.min(muxCreds.streamKey.length, 32))}
                      </code>
                      <button onClick={() => setStreamKeyVisible(v => !v)} className="flex-shrink-0 text-zinc-500 hover:text-white transition-colors">
                        {streamKeyVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(muxCreds.streamKey); setCopiedField("key"); setTimeout(() => setCopiedField(null), 2000); }}
                        className="flex-shrink-0 text-zinc-500 hover:text-amber-400 transition-colors"
                      >
                        {copiedField === "key" ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  <p className="text-zinc-600 text-[10px] leading-relaxed">
                    In OBS: Settings → Stream → Service: Custom → paste the server URL and stream key above.
                  </p>
                </div>
              </div>
            )}
            {muxCreds && !showObs && (
              <button
                onClick={() => setShowObs(true)}
                className="absolute top-4 right-4 z-30 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-cyan-400 transition-all"
                style={{ background: "rgba(10,10,20,0.85)", border: "1px solid rgba(0,212,255,0.25)" }}
              >
                <Monitor size={13} /> OBS Setup
              </button>
            )}

            {/* TOP-LEFT: LIVE + watch party + viewer count */}
            <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
              <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-lg shadow-red-600/40">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Live
              </span>
              {activeWatchUrl && (
                <span className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: "rgba(109,40,217,0.75)", backdropFilter: "blur(12px)", border: "1px solid rgba(167,139,250,0.3)" }}>
                  <Film size={11} /> Watch Party
                </span>
              )}
              <span className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10">
                <Users size={11} className="text-cyan-400" />
                {viewerCount.toLocaleString()} watching
              </span>
              {spotlightId && (
                <span className="flex items-center gap-1.5 bg-primary/80 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-primary/30">
                  <Star size={11} /> Spotlighting
                </span>
              )}
            </div>

            {/* Floating evil emojis */}
            <FloatingEmojiLayer />

            {/* Bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
              <div className="h-56 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
            </div>

            {/* BOTTOM OVERLAY: creator info + end stream */}
            <div className="absolute bottom-0 left-0 z-30 px-5 pb-5 pt-10" style={{ right: "320px" }}>
              <div className="flex items-end justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden ring-2 ring-red-500/40">
                    <Avatar user={user as any} fill />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-white font-bold text-sm">{(user as any)?.displayName}</span>
                      {(user as any)?.isVerified && <BadgeCheck size={13} className="text-primary flex-shrink-0" />}
                    </div>
                    <p className="text-zinc-200 text-sm font-semibold truncate">{form.title}</p>
                    {form.category && <p className="text-zinc-500 text-xs mt-0.5">{form.category}</p>}
                  </div>
                </div>
                <button
                  onClick={endStream}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-red-600/30"
                >
                  <PhoneOff size={15} /> End stream
                </button>
              </div>
            </div>

            {/* ── IDLE WARNING MODAL ──────────────────────────────────────── */}
            <AnimatePresence>
              {idleWarning && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 16 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 16 }}
                    className="mx-6 rounded-2xl p-8 text-center max-w-xs w-full"
                    style={{ background: "rgba(15,0,35,0.95)", border: "1px solid rgba(239,68,68,0.3)" }}
                  >
                    <div className="text-4xl mb-4">😴</div>
                    <h3 className="text-white text-xl font-black mb-2">Are you still there?</h3>
                    <p className="text-zinc-400 text-sm mb-1">Your stream will end automatically in</p>
                    <p className="text-red-400 text-4xl font-black mb-6 tabular-nums">{idleCountdown}s</p>
                    <button
                      onClick={resetIdle}
                      className="w-full py-3 bg-primary hover:bg-primary/80 text-white font-bold rounded-xl transition-colors text-sm"
                    >
                      I'm here! Keep streaming
                    </button>
                    <button
                      onClick={endStream}
                      className="mt-3 w-full py-2.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                    >
                      End stream
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── TRANSPARENT CHAT OVERLAY (right side) ──────────────────── */}
            <AnimatePresence>
              {showChat && (
                <motion.div
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 40, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute right-0 top-0 bottom-0 w-80 flex flex-col z-30 pointer-events-none"
                >
                  {/* Scrolling messages — fully transparent */}
                  <div className="flex-1 overflow-hidden flex flex-col justify-end px-3 py-3 gap-1.5">
                    <AnimatePresence initial={false}>
                      {chatMessages.slice(-18).map((m, i) => (
                        <motion.div
                          key={`${m.timestamp}-${i}`}
                          initial={{ opacity: 0, x: 20, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="flex gap-2 items-start"
                        >
                          <Link href={`/profile/${m.username}`} className="pointer-events-auto flex-shrink-0">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/60 to-purple-600/60 flex items-center justify-center text-[9px] font-bold text-white mt-0.5 hover:ring-2 hover:ring-primary/60 transition-all">
                              {m.displayName[0]?.toUpperCase()}
                            </div>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <Link href={`/profile/${m.username}`} className="pointer-events-auto">
                              <span className="text-xs font-black text-cyan-300 hover:text-cyan-200 transition-colors cursor-pointer" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>{m.displayName} </span>
                            </Link>
                            <span className="text-sm text-white/90 break-words" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>{m.message}</span>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat input — pointer-events back on */}
                  <div className="flex-shrink-0 px-3 pb-4 pointer-events-auto relative">
                    {/* Emoji picker popover */}
                    <AnimatePresence>
                      {showEmojiPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full mb-2 right-3 left-3 rounded-2xl p-3 grid grid-cols-7 gap-1.5"
                          style={{ background: "rgba(10,0,25,0.92)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                          {CHAT_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setChatInput(prev => prev + emoji);
                              }}
                              className="text-xl hover:scale-125 transition-transform leading-none py-1 rounded-lg hover:bg-white/10"
                            >
                              {emoji}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form onSubmit={sendChat} className="flex items-center gap-2 bg-black/25 backdrop-blur-sm border border-white/10 rounded-2xl px-3 py-2.5 focus-within:border-primary/50 transition-colors">
                      <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="Chat with your audience..."
                        className="flex-1 bg-transparent text-sm text-white placeholder-white/35 focus:outline-none min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(v => !v)}
                        className={cn("transition-colors flex-shrink-0", showEmojiPicker ? "text-primary" : "text-white/40 hover:text-white/70")}
                      >
                        <Smile size={15} />
                      </button>
                      <button type="submit" disabled={!chatInput.trim()} className="text-primary hover:text-primary/80 disabled:opacity-30 transition-colors flex-shrink-0">
                        <Send size={15} />
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
        </div>

        {/* ── PEOPLE IN THE ROOM (always visible) ──────────────────────────── */}
        <div className="flex-shrink-0 px-3 pb-1 pt-1" style={{ background: "rgba(8,0,18,0.6)" }}>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Users size={11} className="text-zinc-500" />
            <span className="text-[11px] font-bold text-zinc-400">People in the room</span>
            <ChevronRight size={13} className="text-zinc-600" />
            <span className="text-[10px] text-zinc-600 ml-auto">{totalOnStage} on stage</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto px-1 py-1 scrollbar-none">

            {/* Host tile (broadcaster — always first) */}
            <div className="flex-shrink-0 w-[100px]">
              <div className="relative rounded-xl overflow-hidden ring-2 ring-red-500/60 shadow-lg shadow-red-500/15" style={{ aspectRatio: "1/1", background: "#0a0a0a" }}>
                {/* Avatar fills tile (shown when no cam or cam off) */}
                <div className="absolute inset-0">
                  <Avatar user={user as any} fill />
                </div>
                {/* Live cam on top */}
                {!camError && (
                  <video ref={tileVideoRef} autoPlay muted playsInline
                    className={cn("absolute inset-0 w-full h-full object-cover", !videoOn && "opacity-0")} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                  <span className="text-[9px] font-black bg-cyan-500 text-white px-1.5 py-0.5 rounded-md uppercase tracking-wide">Host</span>
                  {!audioOn && <MicOff size={9} className="text-red-400" />}
                </div>
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="text-[10px] text-white font-semibold truncate">{(user as any)?.displayName}</span>
                </div>
              </div>
            </div>

            {/* Viewer cam tiles */}
            {videoParticipants.map(p => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex-shrink-0 cursor-pointer w-[100px]"
                onClick={() => toggleSpotlight(p.id)}
              >
                <div className={cn(
                  "relative rounded-xl overflow-hidden transition-all",
                  spotlightId === p.id
                    ? "ring-2 ring-primary/70 shadow-lg shadow-primary/20"
                    : "ring-1 ring-white/10 hover:ring-white/25"
                )} style={{ aspectRatio: "1/1" }}>
                  {/* Avatar background (visible when no stream) */}
                  <div className="absolute inset-0">
                    <Avatar user={{ displayName: p.displayName, username: p.id }} fill />
                  </div>
                  {/* Live cam on top */}
                  {p.stream && (
                    <video autoPlay playsInline
                      ref={el => { if (el) el.srcObject = p.stream; }}
                      className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                    <span className="text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded-md uppercase">Live</span>
                    {p.isMuted && <MicOff size={9} className="text-red-400" />}
                  </div>
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-[10px] text-white font-semibold truncate">{p.displayName}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                      <button onClick={e => { e.stopPropagation(); muteParticipant(p.id); }}
                        className="w-5 h-5 rounded bg-black/60 flex items-center justify-center hover:bg-white/20 transition-colors" title="Mute">
                        <MicOff size={9} className="text-zinc-400" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); removeParticipant(p.id); }}
                        className="w-5 h-5 rounded bg-black/60 flex items-center justify-center hover:bg-red-600/80 transition-colors" title="Remove">
                        <PhoneOff size={9} className="text-zinc-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Other live streams — browse while broadcasting */}
            {liveStreams.filter((ls: any) => ls.id !== streamId).slice(0, 5 - videoParticipants.length).map((ls: any) => (
              <Link key={ls.id} href={`/stream/${ls.id}`}>
                <div className="flex-shrink-0 w-[100px] cursor-pointer group">
                  <div className="relative rounded-xl overflow-hidden ring-1 ring-white/10 group-hover:ring-primary/40 transition-all" style={{ aspectRatio: "1/1", background: "#0a0a0a" }}>
                    {ls.thumbnailUrl ? (
                      <img src={ls.thumbnailUrl} alt={ls.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-900/30 via-zinc-900 to-cyan-900/20 group-hover:from-violet-900/50 transition-all" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                      <span className="flex items-center gap-0.5 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">
                        <span className="w-1 h-1 bg-white rounded-full animate-pulse" /> Live
                      </span>
                    </div>
                    <div className="absolute bottom-1.5 left-1.5 right-1.5">
                      <p className="text-white text-[10px] font-bold truncate leading-tight">{ls.title}</p>
                      <p className="text-zinc-400 text-[9px] truncate mt-0.5">{ls.host?.displayName ?? `Stream #${ls.id}`}</p>
                      {ls.viewerCount > 0 && (
                        <div className="flex items-center gap-0.5 text-[8px] text-zinc-500 mt-0.5">
                          <Users size={7} /><span>{ls.viewerCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── WATCH PARTY LIVE MANAGEMENT PANEL ───────────────────────────── */}
        <AnimatePresence>
          {showWpLivePanel && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mx-2 mb-1 rounded-2xl p-4 relative"
              style={{ background: "rgba(8,0,20,0.97)", backdropFilter: "blur(24px)", border: "1px solid rgba(139,92,246,0.25)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Film size={14} className="text-violet-400" />
                  <p className="text-white font-bold text-sm">Watch Party Controls</p>
                </div>
                <button onClick={() => { setShowWpLivePanel(false); setWpLivePanelError(""); }} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
              </div>
              {wpLivePanelError && <p className="text-red-400 text-[11px] mb-2">{wpLivePanelError}</p>}

              {activeWatchUrl && (
                <button
                  onClick={() => handleUpdateWatchPartyLive(null)}
                  disabled={updateStream.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-3 transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)" }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(239,68,68,0.2)" }}>
                    <X size={14} className="text-red-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-red-300 text-xs font-bold leading-tight">Stop watch party</p>
                    <p className="text-zinc-500 text-[10px] leading-tight mt-0.5">Viewers return to the live broadcast</p>
                  </div>
                </button>
              )}

              <div className="flex items-center justify-between mb-2">
                <p className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide">
                  {activeWatchUrl ? "Switch to a different video" : "Start a watch party"}
                </p>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <button type="button" onClick={() => { setWpTab("url"); setWpUploadState("idle"); setWpUploadError(""); }}
                    className={cn("px-2.5 py-1 text-[10px] font-semibold transition-colors", wpTab === "url" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-white")}>
                    URL
                  </button>
                  <button type="button" onClick={() => { setWpTab("upload"); setWpUploadState("idle"); setWpUploadError(""); }}
                    className={cn("px-2.5 py-1 text-[10px] font-semibold transition-colors flex items-center gap-1", wpTab === "upload" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-white")}>
                    <UploadCloud size={9} /> Upload
                  </button>
                </div>
              </div>

              {wpTab === "url" ? (
                <>
                  <input
                    value={newWpLiveUrl}
                    onChange={e => setNewWpLiveUrl(e.target.value)}
                    placeholder="Paste a YouTube / video URL…"
                    className="w-full rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none mb-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  <button
                    onClick={() => { if (newWpLiveUrl.trim()) handleUpdateWatchPartyLive(newWpLiveUrl.trim()); }}
                    disabled={!newWpLiveUrl.trim() || updateStream.isPending}
                    className="w-full py-2 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 hover:brightness-110"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}
                  >
                    {updateStream.isPending ? "Updating…" : activeWatchUrl ? "Switch video" : "Start watch party"}
                  </button>
                </>
              ) : (
                <>
                  {(wpUploadState === "idle" || wpUploadState === "error") && (
                    <>
                      <label
                        className="flex flex-col items-center justify-center gap-2 w-full py-6 rounded-xl cursor-pointer transition-colors text-zinc-400 hover:text-violet-300"
                        style={{ border: "2px dashed rgba(139,92,246,0.3)" }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleWpFileUpload(f); }}
                      >
                        <UploadCloud size={20} />
                        <span className="text-xs font-medium">Drop or choose a video file</span>
                        <span className="text-[10px] text-zinc-600">MP4, MOV, WebM…</span>
                        <input type="file" accept="video/*" className="sr-only"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleWpFileUpload(f); }} />
                      </label>
                      {wpUploadError && <p className="text-red-400 text-[10px] mt-2">{wpUploadError}</p>}
                    </>
                  )}
                  {wpUploadState === "uploading" && (
                    <div className="py-3">
                      <div className="flex justify-between text-[10px] text-zinc-400 mb-1.5">
                        <span>Uploading…</span><span>{wpUploadProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${wpUploadProgress}%` }} />
                      </div>
                    </div>
                  )}
                  {wpUploadState === "processing" && (
                    <div className="flex items-center gap-2 py-3 text-zinc-400 text-[10px]">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin flex-shrink-0" />
                      Processing… this may take a moment.
                    </div>
                  )}
                  {wpUploadState === "ready" && (
                    <div className="flex items-center gap-1.5 py-3 text-green-400 text-[10px]">
                      <Check size={12} />
                      Video ready — watch party started!
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── BOTTOM CONTROL BAR ────────────────────────────────────────────── */}
        <div className="flex-shrink-0 mx-2 mb-2 mt-2 rounded-2xl flex items-center justify-between px-5 py-2.5 gap-4" style={{ background: "rgba(10,0,30,0.90)", backdropFilter: "blur(20px)", border: "1px solid rgba(139,92,246,0.2)" }}>

          {/* Left: mic + cam + watch party */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAudio}
              className={cn(
                "flex flex-col items-center gap-1 w-12 py-1.5 rounded-xl text-xs transition-all",
                audioOn ? "bg-white/8 hover:bg-white/12 text-zinc-300" : "bg-red-600/20 text-red-400 border border-red-500/30"
              )}
            >
              {audioOn ? <Mic size={16} /> : <MicOff size={16} />}
              <span className="text-[9px]">Mic</span>
            </button>
            <button
              onClick={toggleVideo}
              className={cn(
                "flex flex-col items-center gap-1 w-12 py-1.5 rounded-xl text-xs transition-all",
                videoOn ? "bg-white/8 hover:bg-white/12 text-zinc-300" : "bg-red-600/20 text-red-400 border border-red-500/30"
              )}
            >
              {videoOn ? <Video size={16} /> : <VideoOff size={16} />}
              <span className="text-[9px]">Camera</span>
            </button>
            <button
              onClick={() => setShowWpLivePanel(v => !v)}
              className={cn(
                "flex flex-col items-center gap-1 w-12 py-1.5 rounded-xl text-xs transition-all",
                showWpLivePanel
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                  : activeWatchUrl
                    ? "bg-violet-500/15 text-violet-400 border border-violet-500/25"
                    : "bg-white/8 hover:bg-white/12 text-zinc-300"
              )}
            >
              <Film size={16} />
              <span className="text-[9px]">{activeWatchUrl ? "W. Party" : "W. Party"}</span>
            </button>
          </div>

          {/* Center: stream info — tapping navigates home */}
          <Link href="/" className="flex-1 text-center min-w-0 cursor-pointer group">
            <p className="text-white text-sm font-bold truncate group-hover:text-zinc-300 transition-colors">{form.title}</p>
            {form.category && <p className="text-zinc-500 text-xs">{form.category}</p>}
          </Link>

          {/* Right: viewer count + end */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
              <Users size={14} className="text-cyan-400" />
              <span className="font-semibold text-white">{viewerCount.toLocaleString()}</span>
            </div>
            <button
              onClick={endStream}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <PhoneOff size={14} /> End
            </button>
          </div>
        </div>

        {/* ── SAVE WATCH PARTY VIDEO MODAL ───────────────────────────────── */}
        <AnimatePresence>
          {showSaveModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm px-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                    <Film size={18} className="text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-base">Save watch party video?</h2>
                    <p className="text-zinc-400 text-xs mt-0.5">Post it to your profile so followers can watch it later.</p>
                  </div>
                </div>

                <textarea
                  value={saveCaption}
                  onChange={e => setSaveCaption(e.target.value)}
                  placeholder="Add a caption… (optional)"
                  rows={3}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 mb-4"
                />

                <div className="flex gap-3">
                  <button
                    onClick={() => doEndStream()}
                    disabled={savingPost}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleSaveVideo}
                    disabled={savingPost}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingPost ? (
                      <><div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Saving…</>
                    ) : (
                      <><Check size={14} /> Save &amp; post</>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETUP PHASE
  // ══════════════════════════════════════════════════════════════════════════
  if (!isAuthed) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-600/15 rounded-xl flex items-center justify-center">
            <Radio size={20} className="text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Go live</h1>
            <p className="text-sm text-muted-foreground">Start streaming to your audience</p>
          </div>
        </div>

        {/* Resume banner — shown when a previously live stream is still active */}
        {resumableStreamId && (
          <div className="mb-5 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-500/30" style={{ background: "rgba(239,68,68,0.08)" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold">You have an active stream</p>
                <p className="text-zinc-500 text-xs">Stream #{resumableStreamId} is still live</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" onClick={resumeStream}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors">
                Resume
              </button>
              <button type="button" onClick={dismissResume}
                className="px-3 py-1.5 bg-white/8 hover:bg-white/12 text-zinc-400 text-xs font-medium rounded-lg transition-colors">
                Start new
              </button>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-5" data-testid="go-live-form">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">Stream title *</label>
            <input type="text" required data-testid="stream-title-input" placeholder="Give your stream a catchy title..."
              className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              {...field("title")} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea data-testid="stream-description-input" placeholder="Tell viewers what you'll be doing..." rows={3}
              className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              {...field("description")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Category</label>
              <Select
                value={form.category}
                onValueChange={v => setForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger
                  data-testid="stream-category-select"
                  className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm h-auto focus:ring-2 focus:ring-primary/40"
                >
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Thumbnail URL</label>
              <input type="url" data-testid="stream-thumbnail-input" placeholder="https://..."
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                {...field("thumbnailUrl")} />
            </div>
          </div>

          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Film size={15} className="text-violet-400" />
                <span className="text-sm font-semibold text-white">Watch Party <span className="text-[10px] text-violet-400 font-bold ml-1 uppercase tracking-wide">Optional</span></span>
              </div>
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.25)" }}>
                <button type="button" onClick={() => setWpTab("url")}
                  className={cn("px-3 py-1 text-[10px] font-semibold transition-colors", wpTab === "url" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white")}>
                  URL
                </button>
                <button type="button" onClick={() => { setWpTab("upload"); setWpUploadState("idle"); setWpUploadError(""); }}
                  className={cn("px-3 py-1 text-[10px] font-semibold transition-colors flex items-center gap-1", wpTab === "upload" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white")}>
                  <UploadCloud size={10} /> Upload
                </button>
              </div>
            </div>

            {wpTab === "url" ? (
              <>
                <p className="text-xs text-zinc-500 mb-3">Paste a video URL and your audience will watch it together. Supports PornHub, YouTube, XVideos, xHamster, RedTube, Vimeo, Twitch, and direct .mp4 links.</p>
                <input type="url" placeholder="https://www.pornhub.com/view_video.php?viewkey=..."
                  className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 placeholder-zinc-600"
                  {...field("watchPartyUrl")} />
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-500 mb-3">Upload a video file — it's transcoded via Mux and streamed in sync to all viewers with full playback controls.</p>
                {(wpUploadState === "idle" || wpUploadState === "error") && (
                  <>
                    <label
                      className="flex flex-col items-center justify-center gap-2 w-full py-7 rounded-xl cursor-pointer transition-colors text-zinc-400 hover:text-violet-300"
                      style={{ border: "2px dashed rgba(139,92,246,0.3)" }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleWpFileUpload(f); }}
                    >
                      <UploadCloud size={22} />
                      <span className="text-xs font-medium">Drop or choose a video file</span>
                      <span className="text-[10px] text-zinc-600">MP4, MOV, WebM…</span>
                      <input type="file" accept="video/*" className="sr-only"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleWpFileUpload(f); }} />
                    </label>
                    {wpUploadError && <p className="text-red-400 text-[10px] mt-2">{wpUploadError}</p>}
                  </>
                )}
                {wpUploadState === "uploading" && (
                  <div className="py-3">
                    <div className="flex justify-between text-[10px] text-zinc-400 mb-1.5">
                      <span>Uploading…</span><span>{wpUploadProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${wpUploadProgress}%` }} />
                    </div>
                  </div>
                )}
                {wpUploadState === "processing" && (
                  <div className="flex items-center gap-2.5 py-3 text-zinc-400 text-xs">
                    <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin flex-shrink-0" />
                    Processing video… this may take a moment.
                  </div>
                )}
                {wpUploadState === "ready" && (
                  <div className="flex items-center gap-2 py-3 text-green-400 text-xs">
                    <Check size={14} />
                    Video ready — URL filled in the URL tab above.
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── AUDIENCE TYPE ────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium mb-3">Who can watch?</label>
            <div className="grid grid-cols-5 gap-2">
              {([
                { value: "public",      icon: <Globe size={16} />,   label: "Public",    desc: "Everyone" },
                { value: "girls_only",  icon: <span className="text-base">♀</span>, label: "Girls Only", desc: "Women only" },
                { value: "guys_only",   icon: <span className="text-base">♂</span>, label: "Guys Only",  desc: "Men only" },
                { value: "invite_only", icon: <Users size={16} />,   label: "Invite",    desc: "By invite" },
                { value: "private",     icon: <Lock size={16} />,    label: "Private",   desc: "Only you" },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAudienceType(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-all",
                    audienceType === opt.value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-input text-muted-foreground hover:border-border/80 hover:text-foreground"
                  )}
                >
                  {opt.icon}
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[9px] text-zinc-500 leading-tight text-center">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── INVITE LIST (shown only for invite_only) ─────────────────── */}
          {audienceType === "invite_only" && (
            <div>
              <label className="block text-sm font-medium mb-2">Invite people</label>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by username or name..."
                  value={inviteSearch}
                  onChange={e => setInviteSearch(e.target.value)}
                  className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              {/* Search results */}
              {inviteSearch.length >= 2 && searchResults.length > 0 && (
                <div className="border border-border rounded-lg bg-sidebar overflow-hidden mb-2">
                  {searchResults.filter((u: any) => !invitedUsers.find(i => i.id === u.id)).slice(0, 5).map((u: any) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => addInvite(u)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {u.displayName[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{u.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                      </div>
                      <Plus size={14} className="text-primary ml-auto flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {/* Invited list */}
              {invitedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {invitedUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                      <span className="text-xs font-medium text-primary">{u.displayName}</span>
                      <button type="button" onClick={() => removeInvite(u.id)} className="text-primary/60 hover:text-primary transition-colors">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {invitedUsers.length === 0 && (
                <p className="text-xs text-muted-foreground">No one invited yet — search above to add people</p>
              )}
            </div>
          )}

          {/* ── PAID + NOTIFY ROW ────────────────────────────────────────── */}
          <div className="flex gap-6 flex-wrap">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => setForm(f => ({ ...f, isPaid: !f.isPaid }))}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${form.isPaid ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isPaid ? "left-4" : "left-0.5"}`} />
              </div>
              <span className="text-sm">Paid access</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => setNotifyFollowers(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${notifyFollowers ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${notifyFollowers ? "left-4" : "left-0.5"}`} />
              </div>
              <div className="flex items-center gap-1.5">
                <Bell size={13} className="text-muted-foreground" />
                <span className="text-sm">Notify followers</span>
              </div>
            </label>
          </div>

          {form.isPaid && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Access price (USD)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="number" min="0.01" step="0.01" data-testid="access-price-input" placeholder="4.99"
                  className="w-full bg-input border border-border rounded-lg pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  {...field("accessPrice")} />
              </div>
            </div>
          )}

          <button type="submit" disabled={createStream.isPending} data-testid="go-live-submit"
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Radio size={18} />
            {createStream.isPending ? "Starting stream..." : "Go live now"}
          </button>
        </form>

        {/* ── CURRENTLY LIVE (test / browse) ─────────────────────────────── */}
        {liveStreams.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-sm font-bold text-white">Currently live</h2>
              <span className="text-xs text-zinc-600">— click to watch &amp; test the viewer</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {liveStreams.slice(0, 6).map((s: any) => (
                <Link key={s.id} href={`/stream/${s.id}`}>
                  <div className="group relative rounded-xl overflow-hidden cursor-pointer border border-white/8 hover:border-white/20 transition-all hover:scale-[1.02]"
                    style={{ aspectRatio: "16/9", background: "#0a0a0a" }}>
                    {s.thumbnailUrl ? (
                      <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-violet-900/30 via-zinc-900 to-cyan-900/20" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                        <span className="w-1 h-1 bg-white rounded-full animate-pulse" /> Live
                      </span>
                      {s.viewerCount > 0 && (
                        <span className="flex items-center gap-1 bg-black/60 backdrop-blur text-white text-[9px] px-1.5 py-0.5 rounded">
                          <Users size={8} /> {s.viewerCount}
                        </span>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2.5">
                      <p className="text-white text-xs font-bold truncate leading-tight">{s.title}</p>
                      <p className="text-zinc-400 text-[10px] mt-0.5 truncate">
                        {s.host?.displayName ?? `Stream #${s.id}`}
                        {s.category ? ` · ${s.category}` : ""}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
