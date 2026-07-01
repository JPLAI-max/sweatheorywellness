import { useRoute, useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useGetStream, useTipStream, useListStreams, useUpdateStream, useFollowUser, useUnfollowUser, getGetStreamQueryKey, getListStreamsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState, useRef, useEffect, useCallback } from "react";
import MuxPlayer from "@mux/mux-player-react";
import {
  Users, Send, Radio, VideoOff, Mic, MicOff, Video, PhoneOff,
  Star, BadgeCheck, Gift, Share2, Scissors, UserPlus, UserCheck, Smile,
  MessageSquare, ChevronRight, Maximize2, Wifi, Check, Film,
  Hand, DollarSign, X, Flag, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WatchPartyPlayer, type WatchPartySuggestion } from "@/components/WatchPartyPlayer";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

interface ChatMsg { username: string; displayName: string; message: string; timestamp: number; }
interface VideoParticipant { id: string; username: string; displayName: string; stream: MediaStream | null; }

function getWsUrl(streamId: number) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/api/ws/stream/${streamId}`;
  const devToken = typeof localStorage !== "undefined" ? localStorage.getItem("g_dev_token") : null;
  return devToken ? `${base}?token=${encodeURIComponent(devToken)}` : base;
}

export default function StreamPage() {
  const [, params] = useRoute("/stream/:streamId");
  const streamId = parseInt(params?.streamId ?? "0");
  const [, setLocation] = useLocation();
  const { user, isLoggedIn } = useCurrentUser();

  const [tipAmount, setTipAmount] = useState("5");
  const [tipMessage, setTipMessage] = useState("");
  const [tipped, setTipped] = useState(false);
  const [showTipPanel, setShowTipPanel] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [following, setFollowing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clipped, setClipped] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [clipDataUrl, setClipDataUrl] = useState<string | null>(null);

  const [liveViewerCount, setLiveViewerCount] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "failed" | "idle">("idle");
  const [videoParticipants, setVideoParticipants] = useState<VideoParticipant[]>([]);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [forceMuted, setForceMuted] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [myId, setMyId] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const CHAT_EMOJIS = ["👏","❤️","🔥","😂","😮","🎉","😈","💀","🥵","💦","👅","😏","🤤","💋","🫦","😜","🥺","😭","💯","👀","✨","🌹","💅","🦋","🌙","⚡","🎭","🍓","🍀"];
  const [camError, setCamError] = useState("");
  const [showPeoplePanel, setShowPeoplePanel] = useState(false);
  const [raisedHand, setRaisedHand] = useState(false);
  const [raiseToast, setRaiseToast] = useState(false);
  const [wpSyncTime, setWpSyncTime] = useState<number | undefined>(undefined);
  const [wpSyncIsPlaying, setWpSyncIsPlaying] = useState<boolean | undefined>(undefined);
  const [wpSyncSerial, setWpSyncSerial] = useState(0);
  const [copyToast, setCopyToast] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hostPcRef = useRef<RTCPeerConnection | null>(null);
  const receivingPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const sendingPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const tipPanelRef = useRef<HTMLDivElement>(null);
  const giftPanelRef = useRef<HTMLDivElement>(null);
  const sharePanelRef = useRef<HTMLDivElement>(null);

  const { data: stream, isLoading, error: streamError } = useGetStream(streamId, {
    query: {
      enabled: !!streamId,
      queryKey: getGetStreamQueryKey(streamId),
      refetchInterval: 30000,
      retry: (count: number, err: any) => err?.status !== 402 && count < 3,
    }
  });
  const s = stream as any;
  const requiresPurchase = (streamError as any)?.status === 402;
  const paywallData = (streamError as any)?.data as { accessPrice?: number } | undefined;

  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  const queryClient = useQueryClient();
  const updateStream = useUpdateStream();

  async function handlePurchase() {
    if (!streamId) return;
    setPurchasing(true);
    setPurchaseError("");
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("g_dev_token") : null;
      const hdrs: Record<string, string> = {};
      if (token) hdrs["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/streams/${streamId}/purchase`, {
        method: "POST", credentials: "include", headers: hdrs,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as any;
        setPurchaseError(b.error ?? "Purchase failed");
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(streamId) });
    } catch {
      setPurchaseError("Network error. Please try again.");
    } finally {
      setPurchasing(false);
    }
  }

  const tipMut = useTipStream({
    mutation: {
      onSuccess: () => { setTipped(true); setTipMessage(""); setTimeout(() => setTipped(false), 3000); }
    }
  });

  const { data: otherStreamsData } = useListStreams({ limit: 20 });

  const isHost = !!user && !!s?.hostId && user.id === s.hostId;

  const endStream = useCallback(async () => {
    if (!streamId) { setLocation("/watch"); return; }
    try {
      await updateStream.mutateAsync({ streamId, data: { status: "ended" } });
      queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    } catch { /* navigate away regardless */ }
    setLocation("/watch");
  }, [streamId, updateStream, queryClient, setLocation]);

  const followMut = useFollowUser();
  const unfollowMut = useUnfollowUser();

  useEffect(() => {
    if (s?.isFollowing !== undefined) setFollowing(!!s.isFollowing);
  }, [s?.isFollowing]);

  function handleFollow() {
    if (!isLoggedIn) { setLocation("/login"); return; }
    const hostId = s?.hostId;
    if (!hostId) return;
    if (following) {
      unfollowMut.mutate({ userId: hostId });
      setFollowing(false);
    } else {
      followMut.mutate({ userId: hostId });
      setFollowing(true);
    }
  }

  function handleShare() {
    const url = window.location.href;
    const title = (s as any)?.title || `${(s as any)?.host?.displayName ?? "Someone"} is live on Sweatheory`;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
      return;
    }
    setShowSharePanel(p => !p);
    setShowTipPanel(false);
    setShowGiftPanel(false);
  }

  const handleWatchPartySync = useCallback((time: number, isPlaying: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: "watch-party-sync", currentTime: time, isPlaying }));
  }, []);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setCopyToast(true);
      setTimeout(() => { setCopied(false); setShowSharePanel(false); }, 1800);
      setTimeout(() => setCopyToast(false), 2600);
    }).catch(() => {});
  }

  function handleClip() {
    const video = muxPlaybackId
      ? (document.querySelector("mux-player video") as HTMLVideoElement | null)
      : hostVideoRef.current;
    if (!video || !video.videoWidth) {
      setClipped(true);
      setTimeout(() => setClipped(false), 2500);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setClipDataUrl(dataUrl);
    setClipped(true);
  }

  function sendGift(emoji: string, name: string, amount: number) {
    tipMut.mutate({ streamId, data: { recipientId: s.hostId, amount, message: `${emoji} ${name}` } });
    setTimeout(() => setShowGiftPanel(false), 800);
  }

  useEffect(() => {
    if (!streamId || !s || s.status !== "live") return;
    let cancelled = false;
    setConnectionState("connecting");
    const ws = new WebSocket(getWsUrl(streamId));
    wsRef.current = ws;
    ws.onopen = () => {
      if (cancelled) { ws.close(); return; }
      ws.send(JSON.stringify({
        type: "join", role: "viewer", streamId,
        username: (user as any)?.username ?? "viewer",
        displayName: (user as any)?.displayName ?? "Viewer",
      }));
    };
    ws.onmessage = async (e) => {
      if (cancelled) return;
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "ready": setMyId(msg.id); break;
        case "offer": await handleHostOffer(msg.sdp, ws); break;
        case "ice-candidate":
          if (hostPcRef.current && msg.candidate) {
            try { await hostPcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
          }
          break;
        case "broadcaster-left":
          setConnectionState("idle");
          hostPcRef.current?.close(); hostPcRef.current = null;
          if (hostVideoRef.current) hostVideoRef.current.srcObject = null;
          break;
        case "new-video-participant": handleNewVideoParticipant(msg); break;
        case "video-participant-list": handleVideoParticipantList(msg.participants); break;
        case "video-participant-left": handleVideoParticipantLeft(msg.participantId); break;
        case "p2p-offer": await handleP2POffer(msg.fromId, msg.sdp, ws); break;
        case "p2p-answer": await handleP2PAnswer(msg.fromId, msg.sdp); break;
        case "p2p-ice": await handleP2PIce(msg.fromId, msg.candidate); break;
        case "global-spotlight": setFeaturedId(msg.targetId ?? null); break;
        case "viewer-count": setLiveViewerCount(msg.count); break;
        case "chat": setChatMessages(prev => [...prev.slice(-99), msg]); break;
        case "force-muted":
          setForceMuted(true);
          localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
          setAudioOn(false);
          break;
        case "force-unmuted": setForceMuted(false); break;
        case "force-removed": setRemoved(true); cleanup(); break;
        case "watch-party-sync":
          setWpSyncTime(msg.currentTime);
          setWpSyncIsPlaying(msg.isPlaying);
          setWpSyncSerial(prev => prev + 1);
          break;
        case "watch-party-url-updated":
          queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(streamId) });
          break;
      }
    };
    ws.onclose = () => { if (!cancelled) setConnectionState("idle"); };
    ws.onerror = () => { if (!cancelled) setConnectionState("failed"); };
    return () => { cancelled = true; ws.close(); cleanup(); };
  }, [streamId, s?.status]);

  // ── MUX PLAYBACK ID ─────────────────────────────────────────────────────────
  const muxPlaybackId = (s as any)?.muxPlaybackId as string | undefined;
  const muxAssetId    = (s as any)?.muxAssetId    as string | undefined;

  // ── SIGNED PLAYBACK TOKEN (Phase 3b-B2) ─────────────────────────────────────
  // Live policy is ["signed"]; recordings were already ["signed"].
  // Tokens are short-lived; we refresh before expiry so the access gate
  // (auth / subscription / ban check) re-runs each window.
  // On 402/403 during any refresh we stop playback — that is the revocation path.
  const [muxToken, setMuxToken]                   = useState<string | null>(null);
  const [muxTokenPlaybackId, setMuxTokenPlaybackId] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading]           = useState(false);
  const [accessRevoked, setAccessRevoked]         = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!streamId || !s) return;
    const isLive      = s.status === "live"  && !!muxPlaybackId;
    const isRecording = s.status !== "live"  && !!muxAssetId;
    if (!isLive && !isRecording) return;

    let cancelled = false;

    if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; }

    setTokenLoading(true);
    setMuxToken(null);
    setMuxTokenPlaybackId(null);
    setAccessRevoked(false);

    const devToken = typeof localStorage !== "undefined" ? localStorage.getItem("g_dev_token") : null;
    const hdrs: Record<string, string> = {};
    if (devToken) hdrs["Authorization"] = `Bearer ${devToken}`;

    async function fetchToken() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/streams/${streamId}/playback-token`, { credentials: "include", headers: hdrs });
        if (cancelled) return;
        if (r.status === 402 || r.status === 403) {
          // Viewer lost access (banned, subscription cancelled, etc.) — tear down playback.
          setMuxToken(null);
          setMuxTokenPlaybackId(null);
          setAccessRevoked(true);
          setTokenLoading(false);
          return;
        }
        if (!r.ok) { setTokenLoading(false); return; }
        const d = (await r.json()) as { token: string; playbackId: string; ttlSeconds: number };
        if (cancelled) return;
        setMuxToken(d.token);
        setMuxTokenPlaybackId(d.playbackId);
        setTokenLoading(false);
        // Schedule silent refresh at 80 % of TTL — gate re-runs on each refresh.
        const refreshMs = (d.ttlSeconds ?? 300) * 1000 * 0.8;
        refreshTimerRef.current = setTimeout(fetchToken, refreshMs);
      } catch { if (!cancelled) setTokenLoading(false); }
    }

    fetchToken();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; }
    };
  // Intentionally re-run when status or playback IDs change (e.g. stream ends and creates VOD)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, s?.status, muxPlaybackId, muxAssetId]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
  }, [cameraOn]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!showTipPanel && !showGiftPanel && !showSharePanel) return;
      const target = e.target as Element;
      const isInsideOpenPanel =
        (showTipPanel && tipPanelRef.current?.contains(target)) ||
        (showGiftPanel && giftPanelRef.current?.contains(target)) ||
        (showSharePanel && sharePanelRef.current?.contains(target));
      const isOnToggleButton = !!target.closest("[data-panel-toggle]");
      if (!isInsideOpenPanel && !isOnToggleButton) {
        setShowTipPanel(false);
        setShowGiftPanel(false);
        setShowSharePanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTipPanel, showGiftPanel, showSharePanel]);

  async function handleHostOffer(sdp: RTCSessionDescriptionInit, ws: WebSocket) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    hostPcRef.current = pc;
    pc.ontrack = (e) => {
      if (hostVideoRef.current && e.streams[0]) {
        hostVideoRef.current.srcObject = e.streams[0];
        setConnectionState("connected");
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "ice-candidate", candidate: e.candidate }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setConnectionState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setConnectionState("failed");
    };
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: "answer", sdp: answer }));
    } catch {}
  }

  function addVideoParticipant(id: string, username: string, displayName: string) {
    setVideoParticipants(prev => {
      if (prev.find(p => p.id === id)) return prev;
      return [...prev, { id, username, displayName, stream: null }];
    });
  }

  async function handleVideoParticipantList(participants: { id: string; username: string; displayName: string }[]) {
    for (const p of participants) {
      addVideoParticipant(p.id, p.username, p.displayName);
      await connectToParticipantCam(p.id);
    }
  }

  async function handleNewVideoParticipant(msg: any) {
    const { participantId, username, displayName } = msg;
    addVideoParticipant(participantId, username, displayName);
    await connectToParticipantCam(participantId);
  }

  async function connectToParticipantCam(participantId: string) {
    if (receivingPeersRef.current.has(participantId)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    receivingPeersRef.current.set(participantId, pc);
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setVideoParticipants(prev => prev.map(p => p.id === participantId ? { ...p, stream: e.streams[0] } : p));
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: "p2p-ice", toId: participantId, candidate: e.candidate }));
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: "p2p-offer", toId: participantId, sdp: offer }));
    } catch {}
  }

  async function handleP2POffer(fromId: string, sdp: RTCSessionDescriptionInit, ws: WebSocket) {
    if (!localStreamRef.current) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    sendingPeersRef.current.set(fromId, pc);
    localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "p2p-ice", toId: fromId, candidate: e.candidate }));
    };
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: "p2p-answer", toId: fromId, sdp: answer }));
    } catch {}
  }

  async function handleP2PAnswer(fromId: string, sdp: RTCSessionDescriptionInit) {
    const pc = receivingPeersRef.current.get(fromId);
    try { if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch {}
  }

  async function handleP2PIce(fromId: string, candidate: RTCIceCandidateInit) {
    const pc = receivingPeersRef.current.get(fromId) ?? sendingPeersRef.current.get(fromId);
    try { if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  function handleVideoParticipantLeft(participantId: string) {
    const rpc = receivingPeersRef.current.get(participantId);
    if (rpc) { rpc.close(); receivingPeersRef.current.delete(participantId); }
    const spc = sendingPeersRef.current.get(participantId);
    if (spc) { spc.close(); sendingPeersRef.current.delete(participantId); }
    setVideoParticipants(prev => prev.filter(p => p.id !== participantId));
    if (featuredId === participantId) setFeaturedId(null);
  }

  async function toggleCamera() {
    if (cameraOn) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      sendingPeersRef.current.forEach(pc => pc.close());
      sendingPeersRef.current.clear();
      setCameraOn(false);
      setAudioOn(true);
      setVideoEnabled(true);
      wsRef.current?.send(JSON.stringify({ type: "viewer-camera-off" }));
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setCameraOn(true);
        wsRef.current?.send(JSON.stringify({ type: "viewer-camera-on" }));
      } catch (err: any) {
        const msg = err?.name === "NotFoundError"
          ? "No camera or microphone found."
          : err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
          ? "Camera access denied — allow permissions in your browser and try again."
          : "Could not start camera. Check your device settings.";
        setCamError(msg);
        setTimeout(() => setCamError(""), 6000);
      }
    }
  }

  function toggleAudio() {
    if (forceMuted) return;
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setAudioOn(t.enabled); }
  }

  function toggleVideoTrack() {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setVideoEnabled(t.enabled); }
  }

  function cleanup() {
    hostPcRef.current?.close(); hostPcRef.current = null;
    receivingPeersRef.current.forEach(pc => pc.close()); receivingPeersRef.current.clear();
    sendingPeersRef.current.forEach(pc => pc.close()); sendingPeersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
    setCameraOn(false);
  }

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    // Optimistic: add to local chat immediately so the sender sees their message
    setChatMessages(prev => [...prev.slice(-99), {
      username: (user as any)?.username ?? "me",
      displayName: (user as any)?.displayName ?? "Me",
      message: msg,
      timestamp: Date.now(),
    }]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "chat", message: msg }));
    }
    setChatInput("");
    setShowEmojiPicker(false);
  }

  function sendTip() {
    if (!isLoggedIn) { setLocation("/login"); return; }
    const amount = parseFloat(tipAmount);
    if (isNaN(amount) || amount < 0.5) return;
    tipMut.mutate({ streamId, data: { recipientId: s.hostId, amount, message: tipMessage || undefined } });
  }

  // ── LOADING / ERROR STATES ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-112px)] xl:h-[calc(100dvh-56px)] bg-[#080808] animate-pulse">
        <div className="flex-1 bg-zinc-900/50 m-3 rounded-2xl" />
        <div className="w-80 bg-zinc-900/30 m-3 ml-0 rounded-2xl" />
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-112px)] xl:h-[calc(100dvh-56px)] bg-[#080808]">
        <div className="text-center">
          <VideoOff size={48} className="text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-400 text-lg font-semibold">Stream not found</p>
        </div>
      </div>
    );
  }

  if (removed) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-112px)] xl:h-[calc(100dvh-56px)] bg-[#080808]">
        <div className="text-center px-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <PhoneOff size={28} className="text-red-400" />
          </div>
          <p className="text-white text-xl font-bold mb-2">Removed from stream</p>
          <p className="text-zinc-500 text-sm mb-6">The host removed you from the stage.</p>
          <button onClick={() => setLocation("/watch")}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
            Back to Watch Live
          </button>
        </div>
      </div>
    );
  }

  const otherLiveStreams: any[] = (() => {
    const all = (otherStreamsData as any)?.streams ?? (Array.isArray(otherStreamsData) ? otherStreamsData : []);
    return all.filter((ls: any) => ls.status === "live" && ls.id !== streamId);
  })();

  const wpSuggestions: WatchPartySuggestion[] = (() => {
    const currentTags = [
      s?.category,
      ...(s?.tags ? s.tags.split(",").map((t: string) => t.trim().toLowerCase()) : []),
    ].filter(Boolean) as string[];
    const pool = (otherStreamsData as any)?.streams ?? (Array.isArray(otherStreamsData) ? otherStreamsData : []);
    const scored = (pool as any[])
      .filter((ls: any) => ls.id !== streamId)
      .map((ls: any) => {
        const lsTags = [ls.category, ...(ls.tags ? ls.tags.split(",").map((t: string) => t.trim().toLowerCase()) : [])].filter(Boolean);
        const overlap = currentTags.filter(t => lsTags.includes(t)).length;
        return { ls, score: overlap + (ls.status === "live" ? 0.5 : 0) };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 4);
    return scored.map(({ ls }: any) => ({
      id: ls.id as number,
      title: (ls.title as string) || "Untitled stream",
      thumbnailUrl: (ls.thumbnailUrl as string | null | undefined) ?? null,
      hostDisplayName: (ls.host?.displayName as string) || (ls.host?.username as string) || "Creator",
      hostUsername: (ls.host?.username as string) || "",
    }));
  })();

  const viewerCountDisplay = liveViewerCount ?? s.viewerCount ?? 0;
  const featuredParticipant = featuredId ? videoParticipants.find(p => p.id === featuredId) : null;
  const totalParticipants = videoParticipants.length + (cameraOn ? 1 : 0);

  // Detect if the current user has an active broadcast they can return to
  const myBroadcastId = (() => {
    const raw = localStorage.getItem("g_my_stream_id");
    const id = parseInt(raw ?? "");
    return !isNaN(id) && id > 0 && id !== streamId ? id : null;
  })();

  // ── CHAT USERNAME COLOR ────────────────────────────────────────────────────
  function chatColor(name: string) {
    const colors = ["text-cyan-400", "text-violet-400", "text-emerald-400", "text-amber-400", "text-pink-400", "text-sky-400", "text-orange-400"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  // ── PAYWALL ────────────────────────────────────────────────────────────────
  if (requiresPurchase) {
    const price = paywallData?.accessPrice ?? 0;
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-112px)] md:min-h-[calc(100dvh-56px)] px-4"
        style={{ background: "linear-gradient(135deg, #0a001a 0%, #060606 45%, #00101a 100%)" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-sm rounded-3xl p-8 text-center"
          style={{ background: "rgba(12,0,30,0.97)", border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 0 60px rgba(139,92,246,0.15)" }}
        >
          <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <DollarSign size={28} className="text-violet-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Paid Stream</h2>
          <p className="text-zinc-400 text-sm mb-1">This stream requires a one-time purchase to watch.</p>
          <p className="text-violet-300 text-3xl font-bold my-5">${price.toFixed(2)}</p>
          {!user ? (
            <>
              <p className="text-zinc-500 text-xs mb-4">Sign in to your account to purchase access.</p>
              <button
                onClick={() => setLocation("/login")}
                className="w-full py-3 rounded-2xl text-white font-bold transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 4px 24px rgba(139,92,246,0.3)" }}
              >
                Sign in to watch
              </button>
            </>
          ) : (
            <>
              <p className="text-zinc-500 text-xs mb-4">Amount will be deducted from your G wallet. The host receives the payment minus a small platform fee.</p>
              {purchaseError && (
                <p className="text-red-400 text-xs mb-3 rounded-xl px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {purchaseError}
                </p>
              )}
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="w-full py-3 rounded-2xl text-white font-bold transition-all hover:brightness-110 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 4px 24px rgba(139,92,246,0.3)" }}
              >
                {purchasing ? "Processing…" : `Pay $${price.toFixed(2)} to watch`}
              </button>
              <button
                onClick={() => setLocation("/watch")}
                className="w-full mt-3 py-2.5 rounded-2xl text-zinc-400 text-sm font-medium hover:text-white transition-colors"
              >
                Back to streams
              </button>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // ── MAIN RENDER ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col overflow-hidden h-[calc(100dvh-112px)] md:h-[calc(100dvh-56px)]" style={{ background: "linear-gradient(135deg, #0a001a 0%, #060606 45%, #00101a 100%)" }}>

      {/* ── RETURN TO BROADCAST BANNER ────────────────────────────────────── */}
      <AnimatePresence>
        {myBroadcastId && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-shrink-0 flex items-center justify-between mx-2 mt-2 px-4 py-2 rounded-xl"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-300 text-xs font-semibold">Your stream is still live</span>
            </div>
            <button
              onClick={() => setLocation("/go-live")}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Radio size={11} />
              Return to broadcast
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FULL-BLEED VIDEO + OVERLAID CHAT ──────────────────────────────── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">

        {/* ── MAIN VIDEO AREA (fills everything) ──────────────────────────── */}
        <div
          className="absolute inset-0 overflow-hidden select-none"
          style={{ background: "#000", userSelect: "none", WebkitUserSelect: "none" }}
        >

          {/* Watch party player (takes over main area when set) */}
          {s.watchPartyUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-[5]">
              <WatchPartyPlayer
                url={s.watchPartyUrl}
                isHost={isHost}
                syncTime={wpSyncTime}
                syncIsPlaying={wpSyncIsPlaying}
                syncSerial={wpSyncSerial}
                onSync={isHost ? handleWatchPartySync : undefined}
                suggestions={wpSuggestions}
                onSuggestionClick={(id) => setLocation(`/stream/${id}`)}
              />
            </div>
          ) : null}

          {/* Host broadcast — Mux Player (signed token required) or WebRTC native video */}
          {(muxPlaybackId || muxAssetId) && !featuredId && !s.watchPartyUrl ? (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
              {accessRevoked ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
                  <VideoOff className="w-10 h-10 text-zinc-500" />
                  <p className="text-zinc-300 font-semibold text-sm">Playback access revoked</p>
                  <p className="text-zinc-500 text-xs">Your access to this stream has been removed.</p>
                </div>
              ) : muxTokenPlaybackId && muxToken ? (
                <MuxPlayer
                  playbackId={muxTokenPlaybackId}
                  tokens={{ playback: muxToken }}
                  streamType={s.status === "live" ? "live" : "on-demand"}
                  autoPlay
                  muted={s.status === "live"}
                  style={{ width: "100%", height: "100%" } as any}
                />
              ) : tokenLoading ? (
                <div className="w-10 h-10 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
              ) : null}
            </div>
          ) : (
            <video
              ref={hostVideoRef}
              autoPlay playsInline
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
                (featuredId || s.watchPartyUrl) ? "opacity-0 pointer-events-none" : "opacity-100"
              )}
            />
          )}

          {/* Featured participant video */}
          <AnimatePresence>
            {featuredParticipant && (
              <motion.div
                key={featuredParticipant.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                {featuredParticipant.stream ? (
                  <video
                    autoPlay playsInline
                    ref={el => { if (el) el.srcObject = featuredParticipant.stream; }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.15) 0%, #060606 70%)" }}>
                    <span className="text-8xl font-black text-zinc-700">{featuredParticipant.displayName[0]}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Offline / connecting placeholder */}
          {connectionState !== "connected" && !featuredId && !s.watchPartyUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              {s.thumbnailUrl && (
                <img src={s.thumbnailUrl} alt={s.title} className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm scale-105" />
              )}
              <div className="relative z-10 text-center px-6">
                {/* Hide the "Stream ended" card when the recording VOD is available to play */}
                {s.status === "ended" && !muxAssetId ? (
                  <div>
                    <VideoOff size={48} className="text-zinc-600 mx-auto mb-3" />
                    <p className="text-white text-xl font-bold">Stream ended</p>
                    <p className="text-zinc-500 text-sm mt-1">This broadcast has concluded</p>
                  </div>
                ) : s.status === "ended" && muxAssetId ? null : connectionState === "connecting" ? (
                  <div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", boxShadow: "0 0 24px rgba(239,68,68,0.2)" }}>
                      <Radio size={26} className="text-red-400 animate-pulse" />
                    </div>
                    <p className="text-white font-bold text-base">Connecting to stream...</p>
                    <p className="text-zinc-500 text-xs mt-1">Establishing secure connection</p>
                  </div>
                ) : connectionState === "failed" ? (
                  <div>
                    <VideoOff size={48} className="text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-300 font-semibold">Could not connect to stream</p>
                  </div>
                ) : (
                  <div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 0 32px rgba(239,68,68,0.15)" }}>
                      <Radio size={26} className="text-red-400 animate-pulse" />
                    </div>
                    <p className="text-white font-bold text-base">Waiting for broadcaster...</p>
                    <p className="text-zinc-500 text-xs mt-1">Stream will begin shortly</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── VIGNETTE ─────────────────────────────────────────────────── */}
          <div className="absolute inset-0 pointer-events-none z-5" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)" }} />

          {/* ── TOP-LEFT OVERLAY: LIVE badge + viewers ────────────────────── */}
          <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
            {s.status === "live" && (
              <span className="flex items-center gap-1.5 text-white text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-widest" style={{ background: "linear-gradient(90deg,#dc2626,#b91c1c)", boxShadow: "0 0 16px rgba(220,38,38,0.5)" }}>
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                Live
              </span>
            )}
            {s.watchPartyUrl && (
              <span className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: "rgba(109,40,217,0.75)", backdropFilter: "blur(12px)", border: "1px solid rgba(167,139,250,0.3)" }}>
                <Film size={11} /> Watch Party
              </span>
            )}
            <span className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Users size={11} className="text-cyan-400" />
              {viewerCountDisplay.toLocaleString()}
            </span>
            {featuredId && (
              <button
                onClick={() => setFeaturedId(null)}
                className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", border: "1px solid rgba(139,92,246,0.4)" }}
              >
                <Star size={11} className="text-violet-400" />
                {featuredParticipant?.displayName} · host view
              </button>
            )}
          </div>

          {/* ── TOP-RIGHT OVERLAY: chat toggle ────────────────────────────── */}
          <button
            onClick={() => setShowChat(c => !c)}
            className="absolute top-4 z-20 w-6 h-6 bg-sidebar border border-border rounded-full flex items-center justify-center hover:border-primary/40 hover:text-primary text-muted-foreground shadow-sm transition-all"
            style={{
              right: showChat ? "308px" : "8px",
              transition: "right 200ms cubic-bezier(0.4,0,0.2,1)",
            }}
            title={showChat ? "Hide chat" : "Show chat"}
          >
            <ChevronRight
              size={12}
              style={{
                transition: "transform 200ms cubic-bezier(0.4,0,0.2,1)",
                transform: showChat ? "rotate(0deg)" : "rotate(180deg)",
              }}
            />
          </button>

          {/* ── CINEMATIC BOTTOM GRADIENT (hidden during watch party — player has its own) */}
          {!s.watchPartyUrl && (
            <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
              <div className="h-56" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.7) 40%, transparent 100%)" }} />
            </div>
          )}


        </div>

        {/* ── LIVE CHAT PANEL ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="absolute right-0 top-0 bottom-0 w-80 flex flex-col z-30 pointer-events-none"
            >
              {/* Scrolling messages — fully transparent, floats over video */}
              <div className="flex-1 overflow-hidden flex flex-col justify-end px-3 pt-3 pb-24 gap-1.5">
                <AnimatePresence initial={false}>
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 pointer-events-none">
                      <MessageSquare size={20} className="text-zinc-600 mb-2" />
                      <p className="text-zinc-600 text-xs text-center font-medium" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>
                        {s.status === "live" ? "Be the first to chat!" : "Chat will appear here"}
                      </p>
                    </div>
                  ) : (
                    chatMessages.slice(-18).map((m, i) => (
                      <motion.div
                        key={`${m.timestamp}-${i}`}
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="flex gap-2 items-start"
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600/60 to-cyan-600/60 flex items-center justify-center text-[9px] font-bold text-white mt-0.5 flex-shrink-0">
                          {m.displayName[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-xs font-black", chatColor(m.displayName))} style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>{m.displayName} </span>
                          <span className="text-sm text-white/90 break-words" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>{m.message}</span>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>

              {/* Chat input — pointer-events back on */}
              <div className="flex-shrink-0 px-3 pb-4 pt-2 relative pointer-events-auto">
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
                        >{emoji}</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <form onSubmit={sendChat} className="flex items-center gap-2 bg-black/25 backdrop-blur-sm border border-white/10 rounded-2xl px-3 py-2.5 focus-within:border-violet-500/50 transition-colors">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder={isLoggedIn ? "Say something..." : "Sign in to chat"}
                    disabled={!isLoggedIn || s.status !== "live"}
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/35 focus:outline-none disabled:opacity-40 min-w-0"
                  />
                  <button
                    type="button"
                    disabled={!isLoggedIn || s.status !== "live"}
                    onClick={() => setShowEmojiPicker(v => !v)}
                    className={cn("transition-colors flex-shrink-0 disabled:opacity-30", showEmojiPicker ? "text-violet-400" : "text-white/40 hover:text-white/70")}
                  >
                    <Smile size={15} />
                  </button>
                  <button
                    type="submit"
                    disabled={!isLoggedIn || !chatInput.trim() || s.status !== "live"}
                    className="text-violet-400 hover:text-violet-300 disabled:opacity-30 transition-colors flex-shrink-0"
                  >
                    <Send size={14} />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── CREATOR ACTION STRIP ──────────────────────────────────────────── */}
      <div
        className="relative flex-shrink-0 flex items-center justify-between gap-3 mx-2 px-4 py-2.5 select-none rounded-xl"
        style={{ background: "rgba(6,0,18,0.92)", border: "1px solid rgba(139,92,246,0.18)", userSelect: "none", WebkitUserSelect: "none" }}
      >
          {/* Creator info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link href={`/profile/${s.host?.username}`}>
              <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden cursor-pointer transition-all hover:scale-105" style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.12), 0 0 12px rgba(139,92,246,0.25)" }}>
                <Avatar user={s.host} fill />
              </div>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <Link href={`/profile/${s.host?.username}`}>
                  <span className="text-white font-bold text-xs hover:text-cyan-400 transition-colors cursor-pointer">{s.host?.displayName}</span>
                </Link>
                {s.host?.isVerified && <BadgeCheck size={11} className="text-cyan-400 flex-shrink-0" />}
                {s.host?.isPremium && (
                  <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>Creator</span>
                )}
              </div>
              <p className="text-zinc-300 text-xs font-semibold truncate leading-tight max-w-[200px] sm:max-w-none">{s.title}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {[
              { icon: <DollarSign size={13} />, label: "Tip", action: () => { setShowGiftPanel(false); setShowSharePanel(false); setShowTipPanel(p => !p); }, active: showTipPanel, glow: "rgba(234,179,8,0.4)", panelToggle: true },
              { icon: <Gift size={13} />, label: "Gift", action: () => { setShowTipPanel(false); setShowSharePanel(false); setShowGiftPanel(p => !p); }, active: showGiftPanel, glow: "rgba(139,92,246,0.4)", panelToggle: true },
              { icon: showSharePanel ? <Check size={13} /> : <Share2 size={13} />, label: "Share", action: () => { setShowTipPanel(false); setShowGiftPanel(false); handleShare(); }, active: showSharePanel, glow: "rgba(6,182,212,0.4)", panelToggle: true },
              { icon: <Film size={13} />, label: "Clip", action: handleClip, active: false, glow: "rgba(6,182,212,0.3)", panelToggle: false },
              { icon: following ? <UserCheck size={13} /> : <UserPlus size={13} />, label: following ? "Following" : "Follow", action: handleFollow, active: following, glow: "rgba(139,92,246,0.4)", panelToggle: false },
              ...(isLoggedIn ? [{ icon: <Flag size={13} />, label: "Report", action: () => { setShowTipPanel(false); setShowGiftPanel(false); setShowSharePanel(false); setShowReportModal(p => !p); }, active: showReportModal, glow: "rgba(239,68,68,0.3)", panelToggle: true }] : []),
            ].map(({ icon, label, action, active, glow, panelToggle }) => (
              <motion.button
                key={label}
                whileTap={{ scale: 0.9 }}
                onClick={action}
                data-panel-toggle={panelToggle ? "true" : undefined}
                className="flex flex-col items-center gap-0.5 transition-all"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
                  style={active
                    ? { background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.6)", boxShadow: `0 0 16px ${glow}`, color: "#c4b5fd" }
                    : { background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", color: "#d4d4d8" }
                  }
                >
                  {icon}
                </div>
                <span className="text-[8px] font-semibold text-zinc-500">{label}</span>
              </motion.button>
            ))}

          </div>

          {/* ── TIP PANEL (pops upward from strip) ──────────────────────── */}
          <AnimatePresence>
            {showTipPanel && (
              <motion.div
                ref={tipPanelRef}
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                className="absolute bottom-full left-4 mb-2 z-50 w-72 rounded-2xl p-4 shadow-2xl"
                style={{ background: "rgba(8,0,20,0.96)", backdropFilter: "blur(24px)", border: "1px solid rgba(139,92,246,0.25)", boxShadow: "0 0 40px rgba(139,92,246,0.12)" }}
              >
                <p className="text-white font-bold mb-3 text-sm">Send a tip to {s.host?.displayName}</p>
                <div className="flex gap-2 mb-3">
                  {["1", "5", "10", "20"].map(amt => (
                    <button key={amt} onClick={() => setTipAmount(amt)} className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                      style={tipAmount === amt
                        ? { background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", border: "1px solid rgba(139,92,246,0.5)", boxShadow: "0 0 16px rgba(139,92,246,0.3)" }
                        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#d4d4d8" }
                      }
                    >${amt}</button>
                  ))}
                </div>
                <input value={tipMessage} onChange={e => setTipMessage(e.target.value)} placeholder="Add a message (optional)"
                  className="w-full rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none mb-3 transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <button onClick={sendTip} disabled={tipMut.isPending} className="w-full py-2.5 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 4px 20px rgba(139,92,246,0.35)" }}
                >{tipped ? "✓ Tip sent!" : tipMut.isPending ? "Sending..." : `Send $${tipAmount} tip`}</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── WATCH PARTY GIFT PANEL (pops upward from strip) ─────────── */}
          <AnimatePresence>
            {showGiftPanel && (
              <motion.div
                ref={giftPanelRef}
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                className="absolute bottom-full left-4 mb-2 z-50 w-80 rounded-2xl p-4 shadow-2xl"
                style={{ background: "rgba(8,0,20,0.96)", backdropFilter: "blur(24px)", border: "1px solid rgba(139,92,246,0.25)", boxShadow: "0 0 40px rgba(139,92,246,0.15)" }}
              >
                <p className="text-white font-bold mb-0.5 text-sm">Send a gift to {s.host?.displayName}</p>
                <p className="text-zinc-500 text-[11px] mb-3">Each gift sends a tip instantly from your wallet</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { emoji: "🌹", name: "Rose",    amount: 1 },
                    { emoji: "🍕", name: "Pizza",   amount: 2 },
                    { emoji: "🎉", name: "Party",   amount: 5 },
                    { emoji: "💎", name: "Diamond", amount: 10 },
                    { emoji: "🚀", name: "Rocket",  amount: 20 },
                    { emoji: "👑", name: "Crown",   amount: 50 },
                    { emoji: "💰", name: "Bag",     amount: 100 },
                    { emoji: "🌟", name: "Star",    amount: 500 },
                  ].map(g => (
                    <motion.button
                      key={g.name}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => sendGift(g.emoji, g.name, g.amount)}
                      disabled={tipMut.isPending}
                      className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all hover:scale-105 disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <span className="text-xl">{g.emoji}</span>
                      <span className="text-[9px] text-zinc-400">{g.name}</span>
                      <span className="text-[9px] text-violet-400 font-bold">${g.amount}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── WATCH PARTY SHARE PANEL (pops upward from strip) ─────────── */}
          <AnimatePresence>
            {showSharePanel && (
              <motion.div
                ref={sharePanelRef}
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                className="absolute bottom-full right-4 mb-2 z-50 rounded-2xl p-4 shadow-2xl w-64"
                style={{ background: "rgba(8,0,20,0.96)", backdropFilter: "blur(24px)", border: "1px solid rgba(6,182,212,0.25)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-bold text-sm">Share stream</p>
                  <button onClick={() => setShowSharePanel(false)} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
                </div>
                <div className="space-y-1.5">
                  <button onClick={copyLink} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors text-left">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      {copied ? <Check size={14} className="text-green-400" /> : <Share2 size={14} className="text-cyan-400" />}
                    </div>
                    <span className="text-white text-xs font-semibold">{copied ? "Copied!" : "Copy link"}</span>
                  </button>
                  {[
                    { label: "Share on X", color: "#000", icon: "𝕏", href: `https://x.com/intent/tweet?text=${encodeURIComponent(`Watching ${(s as any)?.host?.displayName ?? ""} live on Sweatheory`)}&url=${encodeURIComponent(window.location.href)}` },
                    { label: "Share on WhatsApp", color: "#25D366", icon: "W", href: `https://wa.me/?text=${encodeURIComponent(`${(s as any)?.host?.displayName ?? "Someone"} is live! ${window.location.href}`)}` },
                    { label: "Share on Telegram", color: "#0088cc", icon: "T", href: `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(`${(s as any)?.host?.displayName ?? ""} is live on Sweatheory`)}` },
                  ].map(({ label, color, icon, href }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" onClick={() => setShowSharePanel(false)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style={{ background: color }}>
                        {icon}
                      </div>
                      <span className="text-white text-xs font-semibold">{label}</span>
                    </a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── WATCH PARTY CLIP PANEL (pops upward from strip) ──────────── */}
          <AnimatePresence>
            {clipped && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: "rgba(8,0,20,0.96)", backdropFilter: "blur(24px)", border: "1px solid rgba(139,92,246,0.3)", minWidth: "220px" }}
              >
                {clipDataUrl ? (
                  <>
                    <img src={clipDataUrl} alt="Stream screenshot" className="w-full max-w-[280px] block" />
                    <div className="flex gap-2 p-2">
                      <a
                        href={clipDataUrl}
                        download={`gooncity-clip-${Date.now()}.jpg`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
                        onClick={() => setTimeout(() => { setClipped(false); setClipDataUrl(null); }, 500)}
                      >
                        <Film size={12} /> Download
                      </a>
                      <button
                        onClick={() => { setClipped(false); setClipDataUrl(null); }}
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    <Film size={13} className="text-violet-400" />
                    <span className="text-white text-xs font-semibold">Screenshot captured</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── REPORT MODAL ─────────────────────────────────────────────── */}
          <AnimatePresence>
            {showReportModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
                onClick={() => { if (!reportSubmitting) { setShowReportModal(false); setReportReason(""); setReportNote(""); setReportDone(false); } }}
              >
                <motion.div
                  initial={{ scale: 0.93, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.93, opacity: 0 }}
                  className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
                  style={{ background: "rgba(10,2,25,0.98)", border: "1px solid rgba(139,92,246,0.2)", backdropFilter: "blur(24px)" }}
                  onClick={e => e.stopPropagation()}
                >
                  {reportDone ? (
                    <div className="text-center py-4">
                      <CheckCircle2 size={36} className="text-green-400 mx-auto mb-3" />
                      <p className="text-white font-bold">Report submitted</p>
                      <p className="text-zinc-400 text-sm mt-1">We&apos;ll review it shortly.</p>
                      <button
                        onClick={() => { setShowReportModal(false); setReportReason(""); setReportNote(""); setReportDone(false); }}
                        className="mt-4 px-5 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold hover:bg-zinc-700 transition-colors"
                      >Close</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Flag size={14} className="text-red-400" />
                          <p className="text-white font-bold text-sm">Report this stream</p>
                        </div>
                        <button onClick={() => { setShowReportModal(false); setReportReason(""); setReportNote(""); }} className="text-zinc-500 hover:text-white transition-colors"><X size={14} /></button>
                      </div>
                      <div className="space-y-1.5 mb-4">
                        {[
                          { value: "underage_csam", label: "Involves someone who appears underage", urgent: true },
                          { value: "non_consensual", label: "Non-consensual content" },
                          { value: "violence", label: "Violence or self-harm" },
                          { value: "harassment", label: "Harassment or bullying" },
                          { value: "spam", label: "Spam or scam" },
                          { value: "other", label: "Something else" },
                        ].map(({ value, label, urgent }) => (
                          <button
                            key={value}
                            onClick={() => setReportReason(value)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all text-sm"
                            style={reportReason === value
                              ? urgent
                                ? { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5" }
                                : { background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }
                              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#a1a1aa" }
                            }
                          >
                            {urgent && <AlertTriangle size={12} className={reportReason === value ? "text-red-400" : "text-zinc-500"} />}
                            {label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={reportNote}
                        onChange={e => setReportNote(e.target.value)}
                        placeholder="Additional details (optional)"
                        maxLength={500}
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none resize-none mb-4"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                      <button
                        onClick={async () => {
                          if (!reportReason || reportSubmitting) return;
                          setReportSubmitting(true);
                          try {
                            const res = await fetch("/api/reports", {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                contentType: "live_stream",
                                contentId: String(streamId),
                                reason: reportReason,
                                note: reportNote || undefined,
                              }),
                            });
                            if (res.ok || res.status === 409) {
                              setReportDone(true);
                            } else {
                              const err = await res.json().catch(() => ({ error: "Request failed" }));
                              alert(err.error ?? "Failed to submit report");
                            }
                          } catch {
                            alert("Network error. Please try again.");
                          } finally {
                            setReportSubmitting(false);
                          }
                        }}
                        disabled={!reportReason || reportSubmitting}
                        className="w-full py-2.5 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 hover:brightness-110"
                        style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 4px 20px rgba(220,38,38,0.3)" }}
                      >
                        {reportSubmitting ? "Submitting…" : "Submit Report"}
                      </button>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── TIP PANEL (watch party section, pops upward from strip) ──── */}
          <AnimatePresence>
            {showTipPanel && (
              <motion.div
                ref={tipPanelRef}
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                className="absolute bottom-full left-4 mb-2 z-50 w-72 rounded-2xl p-4 shadow-2xl"
                style={{ background: "rgba(8,0,20,0.96)", backdropFilter: "blur(24px)", border: "1px solid rgba(139,92,246,0.25)", boxShadow: "0 0 40px rgba(139,92,246,0.12)" }}
              >
                <p className="text-white font-bold mb-3 text-sm">Send a tip to {s.host?.displayName}</p>
                <div className="flex gap-2 mb-3">
                  {["1", "5", "10", "20"].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setTipAmount(amt)}
                      className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                      style={tipAmount === amt
                        ? { background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", border: "1px solid rgba(139,92,246,0.5)", boxShadow: "0 0 16px rgba(139,92,246,0.3)" }
                        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#d4d4d8" }
                      }
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <input
                  value={tipMessage}
                  onChange={e => setTipMessage(e.target.value)}
                  placeholder="Add a message (optional)"
                  className="w-full rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none mb-3 transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <button
                  onClick={sendTip}
                  disabled={tipMut.isPending}
                  className="w-full py-2.5 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 4px 20px rgba(139,92,246,0.35)" }}
                >
                  {tipped ? "✓ Tip sent!" : tipMut.isPending ? "Sending..." : `Send $${tipAmount} tip`}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
      </div>


      {/* ── PEOPLE IN THE ROOM ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 mx-2 mb-1 px-3 pb-2 pt-1.5 rounded-xl overflow-visible select-none" style={{ background: "rgba(6,0,16,0.7)", border: "1px solid rgba(139,92,246,0.1)", userSelect: "none", WebkitUserSelect: "none" }}>
        <div className="flex items-center gap-2 mb-2 px-0.5">
          <Users size={11} className="text-zinc-600" />
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">In the room</span>
          <ChevronRight size={11} className="text-zinc-700" />
          <span className="text-[10px] text-zinc-600 ml-auto">{(totalParticipants + 1)} on stage</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 pt-1.5 pl-1.5 scrollbar-none">

          {/* Host tile — always first */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.93 }}
            className="flex-shrink-0 cursor-pointer w-[96px]"
            onClick={() => setFeaturedId(null)}
          >
            <div
              className="relative rounded-xl overflow-hidden transition-all"
              style={{ aspectRatio: "1/1", boxShadow: featuredId === null ? "inset 0 0 0 2px rgba(6,182,212,0.65)" : "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
            >
              {/* Avatar fills entire tile */}
              <div className="absolute inset-0">
                <Avatar user={s.host} fill />
              </div>
              {/* Bottom gradient for text legibility */}
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)" }} />
              {/* HOST badge top-left */}
              <div className="absolute top-1.5 left-1.5">
                <span className="text-[8px] font-black text-white px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: "linear-gradient(90deg,#0891b2,#0e7490)" }}>Host</span>
              </div>
              {/* Name bottom */}
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" style={{ boxShadow: "0 0 4px rgba(74,222,128,0.8)" }} />
                <span className="text-[10px] text-white font-semibold truncate">{s.host?.displayName}</span>
              </div>
            </div>
          </motion.div>

          {/* Viewer cam tiles */}
          {videoParticipants.map(p => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.93 }}
              className="flex-shrink-0 cursor-pointer w-[96px]"
              onClick={() => setFeaturedId(prev => prev === p.id ? null : p.id)}
            >
              <div
                className="relative rounded-xl overflow-hidden transition-all"
                style={{ aspectRatio: "1/1", boxShadow: featuredId === p.id ? "inset 0 0 0 2px rgba(139,92,246,0.85)" : "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
              >
                <div className="absolute inset-0">
                  {p.stream ? (
                    <video autoPlay playsInline
                      ref={el => { if (el) el.srcObject = p.stream; }}
                      className="w-full h-full object-cover" />
                  ) : (
                    <Avatar user={{ displayName: p.displayName, username: p.id }} fill />
                  )}
                </div>
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)" }} />
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[8px] font-black text-white px-1.5 py-0.5 rounded uppercase" style={{ background: "rgba(220,38,38,0.9)" }}>Live</span>
                </div>
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" style={{ boxShadow: "0 0 4px rgba(74,222,128,0.8)" }} />
                  <span className="text-[10px] text-white font-semibold truncate">{p.displayName}</span>
                  {featuredId === p.id && <Star size={8} className="text-violet-400 flex-shrink-0 ml-auto" />}
                </div>
              </div>
            </motion.div>
          ))}

          {/* My camera tile */}
          {cameraOn && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex-shrink-0 w-[96px]"
            >
              <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1", boxShadow: "inset 0 0 0 2px rgba(139,92,246,0.85)" }}>
                <video ref={localVideoRef} autoPlay muted playsInline
                  className={cn("absolute inset-0 w-full h-full object-cover", !videoEnabled && "opacity-0")} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)" }} />
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[8px] font-black text-white px-1.5 py-0.5 rounded uppercase" style={{ background: "rgba(139,92,246,0.9)" }}>You</span>
                </div>
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1">
                  {!audioOn && <MicOff size={8} className="text-red-400 flex-shrink-0" />}
                  <span className="text-[10px] text-violet-400 font-bold truncate">Your cam</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Other live streams */}
          {otherLiveStreams.slice(0, Math.max(4, 4 - videoParticipants.length - (cameraOn ? 1 : 0))).map((ls: any) => (
            <Link key={ls.id} href={`/stream/${ls.id}`}>
              <div className="flex-shrink-0 w-[88px] cursor-pointer group">
                <div className="relative rounded-xl overflow-hidden transition-all" style={{ aspectRatio: "1/1", background: "#080808", boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}>
                  {ls.thumbnailUrl ? (
                    <img src={ls.thumbnailUrl} alt={ls.title} className="w-full h-full object-cover opacity-50 group-hover:opacity-75 transition-opacity" />
                  ) : (
                    <div className="w-full h-full transition-all" style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.12),rgba(8,0,20,0.9),rgba(6,182,212,0.08))" }} />
                  )}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.1) 70%)" }} />
                  <div className="absolute top-1.5 left-1.5">
                    <span className="flex items-center gap-0.5 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase" style={{ background: "rgba(220,38,38,0.9)" }}>
                      <span className="w-1 h-1 bg-white rounded-full animate-pulse" /> Live
                    </span>
                  </div>
                  <div className="absolute bottom-1.5 left-1.5 right-1.5">
                    <p className="text-white text-[10px] font-bold truncate leading-tight">{ls.title}</p>
                    <p className="text-zinc-500 text-[9px] truncate mt-0.5">{ls.host?.displayName ?? `Stream #${ls.id}`}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── CAM ERROR TOAST ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {camError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex-shrink-0 mx-2 mb-1 px-4 py-2.5 rounded-xl flex items-center gap-2"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <VideoOff size={14} className="text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-xs">{camError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOTTOM CONTROL BAR ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 mx-2 mb-2 rounded-2xl flex items-center justify-between px-5 py-2.5 gap-4" style={{ background: "rgba(6,0,18,0.92)", backdropFilter: "blur(24px)", border: "1px solid rgba(139,92,246,0.18)", boxShadow: "0 -4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(6,182,212,0.04)" }}>

        {/* Left: mic/cam/controls */}
        <div className="flex items-center gap-1.5">
          {cameraOn ? (
            <>
              <button
                onClick={toggleAudio}
                title={forceMuted ? "Muted by host" : audioOn ? "Mute" : "Unmute"}
                className="flex flex-col items-center gap-1 w-11 py-1.5 rounded-xl text-xs transition-all"
                style={(audioOn && !forceMuted)
                  ? { background: "rgba(255,255,255,0.06)", color: "#a1a1aa" }
                  : { background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }
                }
              >
                {(audioOn && !forceMuted) ? <Mic size={16} /> : <MicOff size={16} />}
                <span className="text-[9px]">Mic</span>
              </button>
              <button
                onClick={toggleVideoTrack}
                title={videoEnabled ? "Stop camera" : "Start camera"}
                className="flex flex-col items-center gap-1 w-11 py-1.5 rounded-xl text-xs transition-all"
                style={videoEnabled
                  ? { background: "rgba(255,255,255,0.06)", color: "#a1a1aa" }
                  : { background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }
                }
              >
                {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
                <span className="text-[9px]">Cam</span>
              </button>
            </>
          ) : (
            s.status === "live" && isLoggedIn && (
              <button
                onClick={toggleCamera}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all hover:brightness-110"
                style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)" }}
              >
                <Video size={14} /> Join with camera
              </button>
            )
          )}

          <button
            onClick={() => setShowChat(c => !c)}
            className="flex flex-col items-center gap-1 w-11 py-1.5 rounded-xl text-xs transition-all"
            style={showChat
              ? { background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.25)" }
              : { background: "rgba(255,255,255,0.06)", color: "#71717a" }
            }
          >
            <MessageSquare size={16} />
            <span className="text-[9px]">Chat</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowPeoplePanel(p => !p)}
              className="flex flex-col items-center gap-1 w-11 py-1.5 rounded-xl text-xs transition-all"
              style={showPeoplePanel ? { background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.25)" } : { background: "rgba(255,255,255,0.06)", color: "#71717a" }}
            >
              <Users size={16} />
              <span className="text-[9px]">People</span>
            </button>
            <AnimatePresence>
              {showPeoplePanel && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-2xl shadow-2xl overflow-hidden"
                  style={{ background: "rgba(8,0,20,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(139,92,246,0.2)" }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
                      {viewerCountDisplay.toLocaleString()} watching
                    </p>
                  </div>
                  <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0"><Avatar user={s.host} fill /></div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{s.host?.displayName}</p>
                        <p className="text-[10px] text-cyan-400">Host</p>
                      </div>
                    </div>
                    {videoParticipants.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">
                          {p.displayName[0]?.toUpperCase()}
                        </div>
                        <p className="text-xs text-zinc-300 truncate">{p.displayName}</p>
                      </div>
                    ))}
                    {videoParticipants.length === 0 && (
                      <p className="text-[11px] text-zinc-600 text-center py-2">No one else on stage yet</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {s.status === "live" && isLoggedIn && (
            <div className="relative">
              <button
                onClick={() => {
                  const next = !raisedHand;
                  setRaisedHand(next);
                  if (next) {
                    setRaiseToast(true);
                    setTimeout(() => setRaiseToast(false), 2500);
                    wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: "raise_hand" }));
                  }
                }}
                className="flex flex-col items-center gap-1 w-11 py-1.5 rounded-xl text-xs transition-all"
                style={raisedHand ? { background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" } : { background: "rgba(255,255,255,0.06)", color: "#71717a" }}
              >
                <Hand size={16} />
                <span className="text-[9px]">{raisedHand ? "Raised!" : "Raise"}</span>
              </button>
              <AnimatePresence>
                {raiseToast && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.9 }}
                    animate={{ opacity: 1, y: -4, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-lg pointer-events-none z-20 flex items-center gap-1"
                    style={{ background: "rgba(245,158,11,0.9)", color: "#fff" }}
                  >
                    ✋ Hand raised!
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Center: stream info */}
        <div className="flex-1 min-w-0 text-center hidden sm:block">
          <p className="text-white text-sm font-semibold truncate">{s.title}</p>
          {s.category && <p className="text-zinc-600 text-xs mt-0.5">{s.category}</p>}
        </div>

        {/* Right: quality + leave */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Wifi size={11} className="text-green-400" />
            <span className="text-zinc-500">1080p</span>
            <span className="text-green-400 font-semibold">●</span>
          </div>

          <button className="hidden md:flex w-9 h-9 rounded-xl items-center justify-center text-zinc-500 hover:text-white transition-all" style={{ background: "rgba(255,255,255,0.05)" }}>
            <Maximize2 size={14} />
          </button>

          {isHost ? (
            <button
              onClick={endStream}
              disabled={updateStream.isPending}
              className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,0.35)" }}
            >
              <PhoneOff size={14} />
              {updateStream.isPending ? "Ending…" : "End stream"}
            </button>
          ) : cameraOn ? (
            <button
              onClick={toggleCamera}
              className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", boxShadow: "0 4px 16px rgba(220,38,38,0.35)" }}
            >
              <PhoneOff size={14} />
              Leave stage
            </button>
          ) : (
            <button
              onClick={() => setLocation("/watch")}
              className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl transition-all hover:brightness-110"
              style={{ background: "rgba(220,38,38,0.8)" }}
            >
              <PhoneOff size={14} />
              Leave
            </button>
          )}
        </div>
      </div>

      {/* ── COPY LINK TOAST ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {copyToast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.92 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl pointer-events-none"
            style={{ background: "rgba(6,0,18,0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(6,182,212,0.35)", boxShadow: "0 0 32px rgba(6,182,212,0.2)" }}
          >
            <Check size={14} className="text-cyan-400" />
            <span className="text-white text-sm font-semibold">Link copied!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
