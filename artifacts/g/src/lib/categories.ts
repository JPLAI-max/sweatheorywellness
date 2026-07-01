export { useCategories } from "@/hooks/useCategories";
export type { CategoryItem } from "@/hooks/useCategories";

// Static fallback — used only for legacy/non-hook code paths
export const CATEGORIES = [
  "album",
  "Video",
  "goon caption",
  "sissy",
  "bi",
  "cock",
  "gay",
  "sauced",
  "NNN💦",
  "lesbian",
  "story",
  "BWC",
  "BBC",
  "cuckhold",
  "bolted-on",
  "Bimbo",
] as const;

export type Category = (typeof CATEGORIES)[number];
