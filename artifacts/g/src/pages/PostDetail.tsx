import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useGetPost, useGetComments, useCreateComment, useCreateConversation, getGetPostQueryKey, getGetCommentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { PostCard } from "@/components/PostCard";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState } from "react";
import { Send, MessageCircle, CornerDownRight, MessageSquare, X } from "lucide-react";
import { PostSkeleton } from "@/components/SkeletonLoader";
import { formatDistanceToNow } from "date-fns";

export default function PostDetail() {
  const [, params] = useRoute("/post/:postId");
  const postId = parseInt(params?.postId ?? "0");
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ commentId: number; username: string } | null>(null);

  const { data: post, isLoading } = useGetPost(postId, {
    query: { enabled: !!postId, queryKey: getGetPostQueryKey(postId) }
  });

  const { data: comments, isLoading: commentsLoading } = useGetComments(postId, { limit: 50, offset: 0 }, {
    query: { enabled: !!postId, queryKey: getGetCommentsQueryKey(postId, { limit: 50, offset: 0 }) }
  });

  const createComment = useCreateComment({
    mutation: {
      onSuccess: () => {
        setComment("");
        setReplyTo(null);
        queryClient.invalidateQueries({ queryKey: getGetCommentsQueryKey(postId) });
        queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
      }
    }
  });

  const createConversation = useCreateConversation();

  const commentList = Array.isArray(comments) ? comments : [];

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    createComment.mutate({
      postId,
      data: {
        content: comment,
        ...(replyTo ? { parentCommentId: replyTo.commentId } : {}),
      } as any,
    });
  }

  function startReply(commentId: number, username: string) {
    setReplyTo({ commentId, username });
    setComment(`@${username} `);
    document.getElementById("comment-input")?.focus();
  }

  function cancelReply() {
    setReplyTo(null);
    setComment("");
  }

  async function openDM(recipientId: number) {
    try {
      const conv = await createConversation.mutateAsync({ data: { participantId: recipientId } });
      setLocation(`/messages/${conv.id}`);
    } catch {
      // ignore — user not logged in or other error
    }
  }

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-6"><PostSkeleton /></div>;
  }

  if (!post) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground">Post not found.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <PostCard post={post as any} />

      {/* Comments */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
          <MessageCircle size={14} />
          Comments ({(post as any).commentsCount ?? commentList.length})
        </h2>

        {/* Comment form */}
        {user ? (
          <form onSubmit={submitComment} className="flex gap-3 mb-6">
            <Avatar user={user as any} size="sm" />
            <div className="flex-1 flex flex-col gap-2">
              {replyTo && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">
                  <CornerDownRight size={11} className="flex-shrink-0" />
                  <span>Replying to <span className="text-primary font-semibold">@{replyTo.username}</span></span>
                  <button
                    type="button"
                    onClick={cancelReply}
                    className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  id="comment-input"
                  type="text"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={replyTo ? `Reply to @${replyTo.username}…` : "Add a comment…"}
                  data-testid="comment-input"
                  className="flex-1 bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || createComment.isPending}
                  data-testid="submit-comment-button"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </form>
        ) : null}

        {/* Comment list */}
        {commentsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 bg-muted rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : commentList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm bg-card border border-card-border rounded-xl">
            No comments yet. Be the first.
          </div>
        ) : (
          <div className="space-y-4">
            {commentList.map((c: any) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 group ${c.parentCommentId ? "pl-8" : ""}`}
                data-testid="comment-item"
              >
                {c.parentCommentId && (
                  <div className="absolute left-[2.75rem] -mt-2 h-4 w-4 border-l-2 border-b-2 border-border rounded-bl-sm" />
                )}
                <Avatar user={c.author} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{c.author?.displayName}</span>
                    <span className="text-xs text-muted-foreground">@{c.author?.username}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : ""}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{c.content}</p>

                  {/* Comment action buttons */}
                  {user && c.author?.id !== (user as any).id && (
                    <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startReply(c.id, c.author?.username ?? "")}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <CornerDownRight size={11} />
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => openDM(c.author?.id)}
                        disabled={createConversation.isPending}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <MessageSquare size={11} />
                        Message
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
