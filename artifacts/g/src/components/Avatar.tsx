import { cn } from "@/lib/utils";
import { BadgeCheck } from "lucide-react";

interface AvatarProps {
  user: { displayName?: string; username?: string; avatarUrl?: string | null; avatarColor?: string | null; isVerified?: boolean };
  size?: "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showVerified?: boolean;
  /** When true, fills the parent container (parent must be sized + rounded-full + overflow-hidden) */
  fill?: boolean;
}

const sizeClasses = {
  "2xs": "w-4 h-4 text-[7px]",
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
  xl: "w-20 h-20 text-2xl",
};

function getInitials(user: AvatarProps["user"]) {
  const name = user.displayName || user.username || "?";
  return name.slice(0, 2).toUpperCase();
}

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function getBackground(user: AvatarProps["user"]): string {
  if (user.avatarColor) return user.avatarColor;
  const hue = stringToHue(user.username || user.displayName || "");
  return `hsl(${hue}, 55%, 30%)`;
}

export function Avatar({ user, size = "md", className, showVerified = false, fill = false }: AvatarProps) {
  const bg = getBackground(user);
  const sizeClass = sizeClasses[size];

  if (fill) {
    return (
      <div className={cn("w-full h-full", className)}>
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName || user.username}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-bold text-white"
            style={{ background: bg, fontSize: "clamp(0.75rem, 25%, 1.75rem)" }}
          >
            {getInitials(user)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative flex-shrink-0 inline-flex", className)}>
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.displayName || user.username}
          className={cn("rounded-full object-cover object-center border border-border", sizeClass)}
        />
      ) : (
        <div
          className={cn("rounded-full flex items-center justify-center font-bold border border-border", sizeClass)}
          style={{ background: bg, color: "white" }}
        >
          {getInitials(user)}
        </div>
      )}
      {showVerified && user.isVerified && (
        <span className="absolute -bottom-0.5 -right-0.5 text-primary bg-background rounded-full leading-none">
          <BadgeCheck size={14} className="fill-primary text-primary-foreground" />
        </span>
      )}
    </div>
  );
}
