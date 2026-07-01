import { cn } from "@/lib/utils";

function Sk({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-muted rounded", className)} />;
}

export function PostSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <Sk className="w-8 h-8 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <Sk className="h-3 w-24" />
          <Sk className="h-2.5 w-32" />
        </div>
      </div>
      <Sk className="h-48 w-full rounded-lg" />
      <Sk className="h-3 w-3/4" />
      <Sk className="h-3 w-1/2" />
    </div>
  );
}

export function UserSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-card-border">
      <Sk className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Sk className="h-3 w-28" />
        <Sk className="h-2.5 w-20" />
      </div>
    </div>
  );
}

export function StreamSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <Sk className="aspect-video w-full" />
      <div className="p-3 flex items-start gap-2.5">
        <Sk className="w-8 h-8 rounded-full flex-shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Sk className="h-3 w-3/4" />
          <Sk className="h-2.5 w-1/2" />
        </div>
      </div>
    </div>
  );
}
