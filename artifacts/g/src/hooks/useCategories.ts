import { useState, useEffect } from "react";

export interface CategoryItem {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
}

const FALLBACK: string[] = [
  "album", "Video", "goon caption", "sissy", "bi", "cock", "gay", "sauced",
  "NNN💦", "lesbian", "story", "BWC", "BBC", "cuckhold", "bolted-on", "Bimbo",
];

let cached: string[] | null = null;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }

export function invalidateCategoriesCache() {
  cached = null;
  notify();
}

async function fetchCategories(): Promise<string[]> {
  const res = await fetch("/api/categories", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch categories");
  const rows: CategoryItem[] = await res.json();
  const names = rows.map(r => r.name);
  // If the table is empty fall back to the static list so selectors are never blank
  return names.length > 0 ? names : FALLBACK;
}

export function useCategories(): { categories: string[]; loading: boolean } {
  const [categories, setCategories] = useState<string[]>(cached ?? FALLBACK);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    const refresh = () => setCategories(cached ?? FALLBACK);
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, []);

  useEffect(() => {
    if (cached) { setCategories(cached); setLoading(false); return; }
    fetchCategories()
      .then(names => { cached = names; setCategories(names); })
      .catch(() => setCategories(FALLBACK))
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading };
}
