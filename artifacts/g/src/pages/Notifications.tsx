import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion } from "framer-motion";
import { useListNotifications, useMarkNotificationsRead, getListNotificationsQueryKey, getGetUnreadNotificationCountQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useEffect } from "react";
import { Bell, Heart, MessageCircle, UserPlus, Zap, Radio, ScrollText, ShoppingCart, Crown, TriangleAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, any> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  tip: Zap,
  stream_live: Radio,
  mention: MessageCircle,
  custom_request: ScrollText,
  purchase: ShoppingCart,
  subscription: Crown,
  system_alert: TriangleAlert,
};

const TYPE_COLORS: Record<string, string> = {
  follow: "text-primary",
  like: "text-red-400",
  comment: "text-blue-400",
  tip: "text-primary",
  stream_live: "text-red-500",
  mention: "text-blue-400",
  custom_request: "text-amber-400",
  purchase: "text-green-400",
  subscription: "text-primary",
  system_alert: "text-amber-400",
};

export default function Notifications() {
  const isAuthed = useRequireAuth();

  const queryClient = useQueryClient();

  const { data, isLoading } = useListNotifications({ limit: 50, offset: 0 }, {
    query: { queryKey: getListNotificationsQueryKey({ limit: 50, offset: 0 }) }
  });

  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      }
    }
  });

  useEffect(() => {
    markRead.mutate(undefined as any);
  }, []);

  const notifications = Array.isArray(data) ? data : [];

  if (!isAuthed) return null;
  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bell size={20} className="text-primary" />
          Notifications
        </h1>
        {notifications.length > 0 && (
          <button
            onClick={() => markRead.mutate(undefined as any)}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="flex gap-3 p-4 bg-card border border-card-border rounded-xl animate-pulse">
              <div className="w-10 h-10 bg-muted rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2.5 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif: any) => {
            const isSystemAlert = notif.type === "system_alert";
            const Icon = TYPE_ICONS[notif.type] ?? Bell;
            const colorCls = TYPE_COLORS[notif.type] ?? "text-foreground";

            if (isSystemAlert) {
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 transition-colors"
                  data-testid="notification-item"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <TriangleAlert size={18} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-0.5">
                        System Alert
                      </p>
                      <p className="text-sm leading-snug">{notif.message}</p>
                      <a
                        href="/admin?tab=mux_cleanup"
                        className="inline-block mt-1.5 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                      >
                        Open Mux Cleanup Log →
                      </a>
                      {notif.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    {!notif.isRead && (
                      <div className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border transition-colors",
                  !notif.isRead
                    ? "bg-primary/5 border-primary/20"
                    : "bg-card border-card-border"
                )}
                data-testid="notification-item"
              >
                <div className="flex-shrink-0 relative">
                  {notif.actor ? (
                    <Avatar user={notif.actor} size="sm" />
                  ) : (
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-muted", colorCls)}>
                      <Icon size={16} />
                    </div>
                  )}
                  <span className={cn("absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card flex items-center justify-center", colorCls)}>
                    <Icon size={10} />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{notif.message}</p>
                  {notif.createdAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </p>
                  )}
                </div>

                {!notif.isRead && (
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
