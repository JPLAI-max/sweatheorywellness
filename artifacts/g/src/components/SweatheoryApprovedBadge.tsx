import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SweatheoryApprovedBadgeProps {
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function SweatheoryApprovedBadge({
  size = "sm",
  showLabel = false,
  className,
}: SweatheoryApprovedBadgeProps) {
  const dims = { sm: "w-[15px] h-[15px]", md: "w-[18px] h-[18px]", lg: "w-6 h-6" };
  const textSizes = { sm: "text-[9px]", md: "text-[10px]", lg: "text-xs" };

  const mark = (
    <span
      className={cn(
        "inline-flex items-center gap-1 flex-shrink-0 select-none",
        showLabel && "bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5",
        className,
      )}
    >
      <span
        className={cn(
          "rounded-full bg-primary flex items-center justify-center flex-shrink-0",
          dims[size],
        )}
      >
        <svg
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[70%] h-[70%]"
        >
          <path
            d="M2 6.5L4.5 9L10 3"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showLabel && (
        <span
          className={cn(
            "font-bold text-primary tracking-wide uppercase whitespace-nowrap",
            textSizes[size],
          )}
        >
          Sweatheory Approved
        </span>
      )}
    </span>
  );

  if (showLabel) return mark;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{mark}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs font-semibold">Sweatheory Approved Creator</p>
      </TooltipContent>
    </Tooltip>
  );
}
