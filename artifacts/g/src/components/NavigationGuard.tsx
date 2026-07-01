import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useUpload } from "@/contexts/UploadContext";

async function reportCancelToServer(uploadId: string): Promise<void> {
  try {
    await fetch(`/api/mux/uploads/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // Best-effort — the orphan cleanup scheduler will catch it later
  }
}

export function NavigationGuard() {
  const { isUploadInProgress, muxUploadId, abortAll } = useUpload();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingHref = useRef<string | null>(null);

  const isUploadRef = useRef(isUploadInProgress);
  isUploadRef.current = isUploadInProgress;

  const muxUploadIdRef = useRef(muxUploadId);
  muxUploadIdRef.current = muxUploadId;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!isUploadRef.current) return;

      const target = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const currentPath = window.location.pathname;
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const resolvedHref = href.startsWith("/") ? href : `${base}/${href}`;
      const targetPath = resolvedHref.split("?")[0].split("#")[0];
      const currentClean = currentPath.split("?")[0].split("#")[0];

      if (targetPath === currentClean) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      pendingHref.current = href;
      setDialogOpen(true);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  function handleConfirm() {
    const href = pendingHref.current;
    const uploadId = muxUploadIdRef.current;

    abortAll();
    setDialogOpen(false);
    pendingHref.current = null;

    if (uploadId) {
      reportCancelToServer(uploadId);
    }

    if (href) {
      setLocation(href);
    }
  }

  function handleCancel() {
    pendingHref.current = null;
    setDialogOpen(false);
  }

  if (!dialogOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Upload in progress"
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground mb-1">Upload in progress</h2>
            <p className="text-sm text-muted-foreground">
              Navigating away will cancel your upload. Any video or photo being uploaded will be lost.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-foreground hover:bg-muted/50 transition-colors"
          >
            Stay and continue
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-bold rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Leave and cancel
          </button>
        </div>
      </div>
    </div>
  );
}
