import { useLocation, useRoute, Link } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListConversations, useGetMessages, useSendMessage,
  useCreateConversation, useSearchUsers, useMarkConversationRead,
  getListConversationsQueryKey, getGetMessagesQueryKey, getSearchUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isLoggedIn } from "@/lib/auth";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, MessageSquare, Plus, X, Search, Paperclip, ChevronLeft, Image as ImageIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { uploadToR2Media } from "@/lib/r2Upload";
import { TipButton } from "@/components/TipModal";

function NewDMModal({ onClose, onCreated }: { onClose: () => void; onCreated: (convId: number) => void }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { user } = useCurrentUser();

  const { data: usersData } = useSearchUsers({ q: q || undefined, limit: 10 }, {
    query: { enabled: q.length >= 1, queryKey: getSearchUsersQueryKey({ q: q || undefined, limit: 10 }) }
  });

  const createConversation = useCreateConversation();
  const users = Array.isArray(usersData) ? usersData.filter((u: any) => u.id !== (user as any)?.id) : [];

  async function startDM(recipientId: number) {
    if (creating) return;
    setCreating(true);
    try {
      const conv = await createConversation.mutateAsync({ data: { participantId: recipientId } });
      onCreated((conv as any).id);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl"
        data-testid="new-dm-modal"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <h2 className="font-bold">New message</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by username..."
              data-testid="new-dm-search"
              className="w-full bg-input border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {q.length >= 1 && users.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No users found</p>
          )}
          {q.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Type a username to search</p>
          )}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {users.map((u: any) => (
              <button
                key={u.id}
                onClick={() => startDM(u.id)}
                disabled={creating}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors text-left disabled:opacity-50"
                data-testid="dm-user-option"
              >
                <Avatar user={u} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground">@{u.username}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SuggestedUsers({ onStartWith }: { onStartWith: (userId: number) => void }) {
  const { data } = useSearchUsers({ q: "a", limit: 6 }, {
    query: { enabled: isLoggedIn(), queryKey: getSearchUsersQueryKey({ q: "a", limit: 6 }), staleTime: 60000 }
  });
  const { user } = useCurrentUser();
  const suggested = (Array.isArray(data) ? data : []).filter((u: any) => u.id !== (user as any)?.id).slice(0, 5);
  if (suggested.length === 0) return null;

  return (
    <div className="px-3 pb-4 mt-1">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-1 mb-2">People to message</p>
      <div className="space-y-0.5">
        {suggested.map((u: any) => (
          <button
            key={u.id}
            onClick={() => onStartWith(u.id)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left"
          >
            <Avatar user={u} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{u.displayName}</p>
              <p className="text-xs text-muted-foreground">@{u.username}</p>
            </div>
            <span className="text-xs text-primary font-semibold flex-shrink-0">Message</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationList({ activeId, onNew, onStartWith }: { activeId?: number; onNew: () => void; onStartWith: (userId: number) => void }) {
  const { user } = useCurrentUser();
  const { data, isLoading } = useListConversations({
    query: { enabled: isLoggedIn(), queryKey: getListConversationsQueryKey(), refetchInterval: 10000 }
  });
  const convs = Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
            <div className="w-10 h-10 bg-muted rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-muted rounded w-24" />
              <div className="h-2.5 bg-muted rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (convs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-col items-center justify-center py-10 text-center px-6">
          <MessageSquare size={32} className="text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No conversations yet</p>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            Start a conversation
          </button>
        </div>
        <SuggestedUsers onStartWith={onStartWith} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="space-y-1 p-2">
        {convs.map((conv: any) => {
          const other = conv.participants?.find((p: any) => p.id !== (user as any)?.id) ?? conv.participants?.[0];
          const hasUnread = conv.unreadCount > 0;
          return (
            <Link key={conv.id} href={`/messages/${conv.id}`}>
              <div className={cn(
                "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors",
                activeId === conv.id ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"
              )}>
                <div className="relative flex-shrink-0">
                  <Avatar user={other ?? {}} size="md" />
                  {hasUnread && (
                    <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className={cn("text-sm font-semibold truncate", hasUnread && "text-primary")}>{other?.displayName ?? "Unknown"}</p>
                    {conv.lastMessage && (
                      <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                        {formatDistanceToNow(new Date(conv.lastMessage.sentAt), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className={cn("text-xs truncate", hasUnread ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {conv.lastMessage.content || "📷 Image"}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <SuggestedUsers onStartWith={onStartWith} />
    </div>
  );
}

function ChatView({ conversationId, onBack }: { conversationId: number; onBack: () => void }) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const { data: msgs, isLoading } = useGetMessages(conversationId, { limit: 100 }, {
    query: {
      enabled: !!conversationId && isLoggedIn(),
      queryKey: getGetMessagesQueryKey(conversationId, { limit: 100 }),
      refetchInterval: 10000,
    }
  });

  const markRead = useMarkConversationRead();

  const sendMsg = useSendMessage({
    mutation: {
      onSuccess: () => {
        setText("");
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["messages", "unread-count"] });
      }
    }
  });

  const messages = Array.isArray(msgs) ? msgs : [];

  // Mark conversation as read when opened
  useEffect(() => {
    markRead.mutate({ conversationId });
    queryClient.invalidateQueries({ queryKey: ["messages", "unread-count"] });
    queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
  }, [conversationId]);

  // SSE for real-time messages
  useEffect(() => {
    const es = new EventSource("/api/conversations/events", { withCredentials: true });
    sseRef.current = es;

    es.addEventListener("new_message", (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.conversationId === conversationId) {
          queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          // Auto-mark as read since chat is open
          markRead.mutate({ conversationId });
        } else {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["messages", "unread-count"] });
        }
      } catch { /* ignore malformed */ }
    });

    return () => { es.close(); sseRef.current = null; };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Get the other participant for the header
  const { data: convList } = useListConversations({
    query: { queryKey: getListConversationsQueryKey(), staleTime: 30000 }
  });
  const conv = Array.isArray(convList) ? convList.find((c: any) => c.id === conversationId) : null;
  const otherUser = conv?.participants?.find((p: any) => p.id !== (user as any)?.id) ?? conv?.participants?.[0];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !imgUploading) return;
    if (!text.trim()) return;
    sendMsg.mutate({ conversationId, data: { content: text } });
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImgError(null);
    setImgUploading(true);
    try {
      const { key } = await uploadToR2Media(file, "messages");
      sendMsg.mutate({ conversationId, data: { content: "", mediaUrl: key } });
    } catch (err: any) {
      setImgError(err?.message ?? "Image upload failed");
    } finally {
      setImgUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-sidebar/60 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Back to conversations"
        >
          <ChevronLeft size={20} />
        </button>
        {otherUser ? (
          <>
            <Avatar user={otherUser} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{otherUser.displayName}</p>
              <p className="text-xs text-muted-foreground">@{otherUser.username}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <TipButton
                recipientId={otherUser.id}
                recipientName={otherUser.displayName}
                trigger={(open) => (
                  <button onClick={open} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-amber-400/40 text-amber-400 hover:bg-amber-400/10 transition-colors">
                    💰 Tip
                  </button>
                )}
              />
              <Link href={`/profile/${otherUser.username}`}>
                <span className="text-xs text-primary hover:underline cursor-pointer">Profile</span>
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold">Conversation</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Say hi!
          </div>
        ) : (
          messages.map((m: any) => {
            const isMe = user && (user as any).id === m.senderId;
            return (
              <div key={m.id} className={cn("flex gap-2 items-end", isMe ? "justify-end" : "justify-start")} data-testid="message-item">
                {!isMe && <Avatar user={m.sender ?? {}} size="xs" />}
                <div className={cn(
                  "max-w-[70%] rounded-2xl text-sm overflow-hidden",
                  isMe
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-card-border rounded-bl-sm"
                )}>
                  {m.mediaUrl ? (
                    <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={m.mediaUrl}
                        alt="attachment"
                        className="max-w-full max-h-64 object-cover rounded-2xl"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <span className="block px-4 py-2.5">{m.content}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image upload error */}
      {imgError && (
        <div className="px-4 pb-1">
          <p className="text-xs text-destructive">{imgError}</p>
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={submit} className="border-t border-border p-3 flex items-center gap-2 bg-background flex-shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImagePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={imgUploading}
          className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Attach image"
        >
          {imgUploading
            ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            : <ImageIcon size={18} />
          }
        </button>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message..."
          data-testid="message-input"
          className="flex-1 bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-0"
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMsg.isPending}
          data-testid="send-message-button"
          className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

export default function Messages() {
  const [location, setLocation] = useLocation();
  const isAuthed = useRequireAuth();

  const [, params] = useRoute("/messages/:conversationId");
  const conversationId = params?.conversationId ? parseInt(params.conversationId) : undefined;
  const [showNewDM, setShowNewDM] = useState(false);
  const queryClient = useQueryClient();
  const createConversation = useCreateConversation();

  function handleCreated(convId: number) {
    setShowNewDM(false);
    queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    setLocation(`/messages/${convId}`);
  }

  async function handleStartWith(userId: number) {
    try {
      const conv = await createConversation.mutateAsync({ data: { participantId: userId } });
      handleCreated((conv as any).id);
    } catch {
      // ignore — server errors surfaced elsewhere
    }
  }

  if (!isAuthed) return null;
  return (
    <>
      <AnimatePresence>
        {showNewDM && (
          <NewDMModal onClose={() => setShowNewDM(false)} onCreated={handleCreated} />
        )}
      </AnimatePresence>

      <div className="flex h-[calc(100dvh-168px)] md:h-[calc(100dvh-56px)] overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          "w-full md:w-72 border-r border-border flex flex-col",
          conversationId ? "hidden md:flex" : "flex"
        )}>
          <div className="px-4 py-4 border-b border-border flex items-center justify-between">
            <h1 className="font-bold">Messages</h1>
            <button
              onClick={() => setShowNewDM(true)}
              data-testid="new-dm-button"
              className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title="New message"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ConversationList activeId={conversationId} onNew={() => setShowNewDM(true)} onStartWith={handleStartWith} />
          </div>
        </div>

        {/* Chat area */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0",
          !conversationId ? "hidden md:flex items-center justify-center" : "flex"
        )}>
          {conversationId ? (
            <ChatView conversationId={conversationId} onBack={() => setLocation("/messages")} />
          ) : (
            <div className="text-center text-muted-foreground">
              <MessageSquare size={40} className="mx-auto mb-3" />
              <p className="text-sm mb-4">Select a conversation to start chatting</p>
              <button
                onClick={() => setShowNewDM(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors mx-auto"
              >
                <Plus size={14} />
                New message
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
