import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { setLoggedIn, saveAccount } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export default function OAuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      setError(`OAuth cancelled or denied: ${errorParam}`);
      return;
    }
    if (!code || !state) {
      setError("OAuth failed: missing parameters.");
      return;
    }

    const platform = window.location.pathname.includes("reddit") ? "reddit" : "x";

    fetch(`/api/auth/${platform}/callback`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    })
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) { setError(data.error); return; }
        if (data.user) {
          if (data.devToken) localStorage.setItem("g_dev_token", data.devToken);
          setLoggedIn(data.user.id);
          saveAccount({
            id: data.user.id,
            username: data.user.username,
            displayName: data.user.displayName ?? data.user.username,
            avatarUrl: data.user.avatarUrl ?? null,
          });
          setLocation("/feed");
        }
      })
      .catch(() => setError("OAuth callback failed. Please try again."));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-4">
        <p className="text-destructive text-sm text-center max-w-xs">{error}</p>
        <button
          onClick={() => setLocation("/login")}
          className="text-primary text-sm hover:underline"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 size={28} className="animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Connecting your account…</p>
    </div>
  );
}
