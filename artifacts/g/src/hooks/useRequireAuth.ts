import { useEffect } from "react";
import { useLocation } from "wouter";
import { isLoggedIn } from "@/lib/auth";

/**
 * Redirects to /login (via useEffect, never during render) when the user is
 * not authenticated.  Always returns the current auth state so the caller can
 * gate its render:
 *
 *   const isAuthed = useRequireAuth();
 *   // … declare all other hooks …
 *   if (!isAuthed) return null;
 */
export function useRequireAuth(): boolean {
  const [, setLocation] = useLocation();
  const isAuthed = isLoggedIn();

  useEffect(() => {
    if (!isAuthed) {
      setLocation("/login");
    }
  }, [isAuthed, setLocation]);

  return isAuthed;
}
