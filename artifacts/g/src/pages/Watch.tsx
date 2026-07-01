import { Link } from "wouter";
import { useListStreams } from "@workspace/api-client-react";
import { Radio, Users, Search } from "lucide-react";
import { useState } from "react";
import { useCategories } from "@/lib/categories";

export default function Watch() {
  const [category, setCategory] = useState("All");
  const { categories: baseCategories } = useCategories();
  const CATEGORIES = ["All", ...baseCategories];
  const [query, setQuery] = useState("");
  const { data, isLoading } = useListStreams({ limit: 50 });

  const all: any[] = (data as any)?.streams ?? (Array.isArray(data) ? data : []);
  const live = all
    .filter((s: any) => s.status === "live")
    .filter((s: any) => category === "All" || s.category === category)
    .filter((s: any) => !query || s.title?.toLowerCase().includes(query.toLowerCase()) || s.host?.displayName?.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 xl:pb-6">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
            <Radio size={16} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-black text-foreground">Watch Live</h1>
          {live.length > 0 && (
            <span className="flex items-center gap-1.5 bg-red-600/15 border border-red-500/30 text-red-400 text-xs font-bold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {live.length} live
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">Browse creators streaming right now</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search streams or creators..."
          className="w-full bg-muted/50 border border-border/60 rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-none">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              category === c
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden bg-card border border-border/60 animate-pulse">
              <div className="aspect-video bg-muted/40" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-muted/60 rounded w-3/4" />
                <div className="h-3 bg-muted/40 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : live.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center mb-4">
            <Radio size={28} className="text-muted-foreground/50" />
          </div>
          <p className="text-foreground font-semibold mb-1">No streams live right now</p>
          <p className="text-muted-foreground text-sm">Check back soon — creators go live all the time</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {live.map((s: any) => (
            <Link key={s.id} href={`/stream/${s.id}`}>
              <div className="group rounded-2xl overflow-hidden bg-card border border-border/60 hover:border-border transition-all hover:shadow-lg hover:shadow-primary/5 cursor-pointer">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-black overflow-hidden">
                  {s.thumbnailUrl ? (
                    <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-900/40 via-zinc-900 to-cyan-900/20 group-hover:from-violet-900/60 transition-all" />
                  )}
                  {/* LIVE badge */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    Live
                  </div>
                  {/* Viewer count */}
                  {s.viewerCount > 0 && (
                    <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md backdrop-blur-sm">
                      <Users size={9} />
                      <span>{s.viewerCount.toLocaleString()}</span>
                    </div>
                  )}
                  {/* Category */}
                  {s.category && (
                    <div className="absolute top-2.5 right-2.5 bg-black/60 text-zinc-300 text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
                      {s.category}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex gap-2.5">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-muted border border-border">
                    {s.host?.avatarUrl ? (
                      <img src={s.host.avatarUrl} alt={s.host.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/20 text-primary text-sm font-bold">
                        {s.host?.displayName?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate leading-tight">{s.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{s.host?.displayName}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
