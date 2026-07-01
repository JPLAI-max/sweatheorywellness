import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import { db, usersTable, streamsTable } from "@workspace/db";
import { verifyToken } from "../middlewares/auth";
import { logger } from "./logger";

interface Client {
  ws: WebSocket;
  id: string;
  role: "broadcaster" | "viewer";
  streamId: string;
  userId: number;
  username: string;
  displayName: string;
  hasVideo: boolean;
}

interface Room {
  broadcaster: Client | null;
  viewers: Map<string, Client>;
  spotlight: string | null;
  watchPartySync?: { currentTime: number; isPlaying: boolean };
}

const rooms = new Map<string, Room>();

function getRoom(streamId: string): Room {
  if (!rooms.has(streamId)) {
    rooms.set(streamId, { broadcaster: null, viewers: new Map(), spotlight: null });
  }
  return rooms.get(streamId)!;
}

function findClient(room: Room, id: string): Client | undefined {
  if (room.broadcaster?.id === id) return room.broadcaster;
  return room.viewers.get(id);
}

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToAll(room: Room, data: object, excludeId?: string) {
  const msg = JSON.stringify(data);
  if (room.broadcaster && room.broadcaster.id !== excludeId && room.broadcaster.ws.readyState === WebSocket.OPEN) {
    room.broadcaster.ws.send(msg);
  }
  room.viewers.forEach(v => {
    if (v.id !== excludeId && v.ws.readyState === WebSocket.OPEN) v.ws.send(msg);
  });
}

function broadcastViewerCount(room: Room) {
  broadcastToAll(room, { type: "viewer-count", count: room.viewers.size });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** Parse g_token from a Cookie header string */
function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)g_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Extract Bearer token from Authorization header */
function parseBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Broadcast a watch-party-url-updated event to every connected client in a
 * stream room.  Called by the HTTP PATCH handler after it persists the change.
 */
export function broadcastWatchPartyUrl(streamId: number, watchPartyUrl: string | null) {
  const room = rooms.get(String(streamId));
  if (!room) return;
  broadcastToAll(room, { type: "watch-party-url-updated", watchPartyUrl: watchPartyUrl ?? null });
}

export function attachSignaling(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = request.url ?? "";
    if (!url.startsWith("/api/ws/stream/")) {
      socket.destroy();
      return;
    }

    // ── AUTH GATE: every WebSocket connection must carry a valid JWT ──────────
    // Browsers can't send custom headers on WS upgrades, so we also accept the
    // token as a ?token= query param (used by the dev-preview Bearer fallback).
    const qs = new URL(url, "http://localhost").searchParams;
    const token =
      parseCookieToken(request.headers.cookie as string | undefined) ??
      parseBearerToken(request.headers.authorization as string | undefined) ??
      qs.get("token");

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }

    // Attach the verified userId to the request for use in the connection handler
    (request as any).authenticatedUserId = payload.userId;

    wss.handleUpgrade(request, socket as any, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket, request: any) => {
    const url: string = request.url ?? "";
    const match = url.match(/\/api\/ws\/stream\/(\d+)/);
    const streamId = match?.[1];
    if (!streamId) { ws.close(1008, "No stream ID"); return; }

    const authenticatedUserId: number = request.authenticatedUserId;

    let client: Client | null = null;

    ws.on("message", (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {

        // ── JOIN ─────────────────────────────────────────────────────────────
        case "join": {
          const role: "broadcaster" | "viewer" = msg.role === "broadcaster" ? "broadcaster" : "viewer";

          // Resolve user identity and broadcaster ownership from DB — never from client payload
          (async () => {
            // Fetch the authenticated user to get their real username/displayName
            const [user] = await db
              .select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
              .from(usersTable)
              .where(eq(usersTable.id, authenticatedUserId))
              .limit(1);

            if (!user) {
              ws.close(4001, "User not found");
              return;
            }

            // Broadcaster: verify they own this stream
            if (role === "broadcaster") {
              const [stream] = await db
                .select({ hostId: streamsTable.hostId })
                .from(streamsTable)
                .where(eq(streamsTable.id, parseInt(streamId, 10)))
                .limit(1);

              if (!stream || stream.hostId !== authenticatedUserId) {
                logger.warn({ streamId, authenticatedUserId }, "Broadcaster auth failed — not the stream owner");
                ws.close(4003, "Forbidden");
                return;
              }
            }

            const id = uid();
            client = {
              ws,
              id,
              role,
              streamId,
              userId: authenticatedUserId,
              username: user.username,
              displayName: user.displayName,
              hasVideo: false,
            };

            const room = getRoom(streamId);

            if (role === "broadcaster") {
              room.broadcaster = client;
              send(ws, { type: "ready", id });
              room.viewers.forEach(viewer => {
                send(ws, {
                  type: "viewer-joined",
                  viewerId: viewer.id,
                  username: viewer.username,
                  displayName: viewer.displayName,
                  hasVideo: viewer.hasVideo,
                });
              });
              logger.info({ streamId, userId: authenticatedUserId }, "Broadcaster joined");
            } else {
              room.viewers.set(id, client);
              send(ws, { type: "ready", id });
              if (room.broadcaster) {
                send(room.broadcaster.ws, {
                  type: "viewer-joined",
                  viewerId: id,
                  username: client.username,
                  displayName: client.displayName,
                  hasVideo: false,
                });
              }
              send(ws, { type: "global-spotlight", targetId: room.spotlight });
              if (room.watchPartySync) {
                send(ws, { type: "watch-party-sync", ...room.watchPartySync });
              }
              broadcastViewerCount(room);
              logger.info({ streamId, viewerId: id, userId: authenticatedUserId }, "Viewer joined");
            }
          })().catch(err => {
            logger.error({ err, streamId }, "Error during join");
            ws.close(1011, "Internal error");
          });
          break;
        }

        // ── MAIN BROADCAST: broadcaster → viewer ─────────────────────────────
        case "offer": {
          const room = getRoom(streamId);
          const viewer = room.viewers.get(msg.viewerId as string);
          if (viewer) send(viewer.ws, { type: "offer", sdp: msg.sdp });
          break;
        }
        case "answer": {
          const room = getRoom(streamId);
          if (room.broadcaster) send(room.broadcaster.ws, { type: "answer", sdp: msg.sdp, viewerId: client?.id });
          break;
        }
        case "ice-candidate": {
          const room = getRoom(streamId);
          if (client?.role === "broadcaster") {
            const viewer = room.viewers.get(msg.viewerId as string);
            if (viewer) send(viewer.ws, { type: "ice-candidate", candidate: msg.candidate });
          } else {
            if (room.broadcaster) send(room.broadcaster.ws, { type: "ice-candidate", candidate: msg.candidate, viewerId: client?.id });
          }
          break;
        }

        // ── P2P TILE: any participant ↔ any participant ───────────────────────
        case "p2p-offer":
        case "p2p-answer":
        case "p2p-ice": {
          const room = getRoom(streamId);
          const target = findClient(room, msg.toId as string);
          if (target) {
            send(target.ws, {
              type: msg.type,
              fromId: client?.id,
              sdp: msg.sdp,
              candidate: msg.candidate,
            });
          }
          break;
        }

        // ── VIEWER CAMERA ON / OFF ────────────────────────────────────────────
        case "viewer-camera-on": {
          if (!client) break;
          client.hasVideo = true;
          const room = getRoom(streamId);
          broadcastToAll(room, {
            type: "new-video-participant",
            participantId: client.id,
            username: client.username,
            displayName: client.displayName,
          }, client.id);
          const videoList: { id: string; username: string; displayName: string }[] = [];
          room.viewers.forEach(v => {
            if (v.hasVideo && v.id !== client!.id) {
              videoList.push({ id: v.id, username: v.username, displayName: v.displayName });
            }
          });
          if (room.broadcaster) {
            videoList.push({ id: room.broadcaster.id, username: room.broadcaster.username, displayName: room.broadcaster.displayName });
          }
          send(ws, { type: "video-participant-list", participants: videoList });
          logger.info({ streamId, viewerId: client.id }, "Viewer camera on");
          break;
        }
        case "viewer-camera-off": {
          if (!client) break;
          client.hasVideo = false;
          const room = getRoom(streamId);
          broadcastToAll(room, { type: "video-participant-left", participantId: client.id }, client.id);
          logger.info({ streamId, viewerId: client.id }, "Viewer camera off");
          break;
        }

        // ── HOST CONTROLS (broadcaster only) ─────────────────────────────────
        case "mute-participant": {
          if (client?.role !== "broadcaster") break;
          const room = getRoom(streamId);
          const target = findClient(room, msg.targetId as string);
          if (target) send(target.ws, { type: "force-muted" });
          break;
        }
        case "unmute-participant": {
          if (client?.role !== "broadcaster") break;
          const room = getRoom(streamId);
          const target = findClient(room, msg.targetId as string);
          if (target) send(target.ws, { type: "force-unmuted" });
          break;
        }
        case "remove-participant": {
          if (client?.role !== "broadcaster") break;
          const room = getRoom(streamId);
          const target = room.viewers.get(msg.targetId as string);
          if (target) {
            send(target.ws, { type: "force-removed" });
            setTimeout(() => { try { target.ws.close(1000, "Removed by host"); } catch {} }, 300);
          }
          break;
        }
        case "spotlight-participant": {
          if (client?.role !== "broadcaster") break;
          const room = getRoom(streamId);
          room.spotlight = msg.targetId ?? null;
          broadcastToAll(room, { type: "global-spotlight", targetId: room.spotlight });
          logger.info({ streamId, targetId: msg.targetId }, "Host spotlighted participant");
          break;
        }

        // ── WATCH PARTY SYNC (broadcaster → all viewers) ─────────────────────
        case "watch-party-sync": {
          if (client?.role !== "broadcaster") break;
          const room = getRoom(streamId);
          room.watchPartySync = { currentTime: msg.currentTime, isPlaying: msg.isPlaying };
          broadcastToAll(room, {
            type: "watch-party-sync",
            currentTime: msg.currentTime,
            isPlaying: msg.isPlaying,
          }, client.id);
          break;
        }

        // ── CHAT ─────────────────────────────────────────────────────────────
        // Username and displayName always come from the server-side client record
        // (populated from DB on join) — never from the incoming message payload.
        case "chat": {
          if (!client) break;
          const room = getRoom(streamId);
          // excludeId = client.id so the sender doesn't get a server echo
          // (the client adds the message optimistically on send)
          broadcastToAll(room, {
            type: "chat",
            username: client.username,
            displayName: client.displayName,
            message: String(msg.message ?? "").slice(0, 300),
            timestamp: Date.now(),
          }, client.id);
          break;
        }
      }
    });

    ws.on("close", () => {
      if (!client) return;
      const room = getRoom(streamId);

      if (client.role === "broadcaster") {
        room.broadcaster = null;
        broadcastToAll(room, { type: "broadcaster-left" });
        logger.info({ streamId }, "Broadcaster left");
      } else {
        room.viewers.delete(client.id);
        if (room.broadcaster) send(room.broadcaster.ws, { type: "viewer-left", viewerId: client.id });
        if (client.hasVideo) {
          broadcastToAll(room, { type: "video-participant-left", participantId: client.id });
        }
        if (room.spotlight === client.id) {
          room.spotlight = null;
          broadcastToAll(room, { type: "global-spotlight", targetId: null });
        }
        broadcastViewerCount(room);
        logger.info({ streamId, viewerId: client.id }, "Viewer left");
      }

      if (!room.broadcaster && room.viewers.size === 0) rooms.delete(streamId);
    });

    ws.on("error", (err) => logger.error({ err, streamId }, "WebSocket error"));
  });

  logger.info("WebRTC signaling server attached");
}
