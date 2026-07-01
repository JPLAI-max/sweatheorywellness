import { createContext, useContext, useRef, useState, useCallback } from "react";

interface UploadContextValue {
  isUploadInProgress: boolean;
  muxUploadId: string | null;
  videoXhrRef: React.MutableRefObject<XMLHttpRequest | null>;
  photoXhrRef: React.MutableRefObject<XMLHttpRequest | null>;
  registerVideoUpload: (uploadId: string) => void;
  registerPhotoUpload: () => void;
  clearVideoUpload: () => void;
  clearPhotoUpload: () => void;
  abortAll: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [videoActive, setVideoActive] = useState(false);
  const [photoActive, setPhotoActive] = useState(false);
  const [muxUploadId, setMuxUploadId] = useState<string | null>(null);

  const videoXhrRef = useRef<XMLHttpRequest | null>(null);
  const photoXhrRef = useRef<XMLHttpRequest | null>(null);

  const registerVideoUpload = useCallback((uploadId: string) => {
    setMuxUploadId(uploadId);
    setVideoActive(true);
  }, []);

  const registerPhotoUpload = useCallback(() => {
    setPhotoActive(true);
  }, []);

  const clearVideoUpload = useCallback(() => {
    setVideoActive(false);
    setMuxUploadId(null);
    videoXhrRef.current = null;
  }, []);

  const clearPhotoUpload = useCallback(() => {
    setPhotoActive(false);
    photoXhrRef.current = null;
  }, []);

  const abortAll = useCallback(() => {
    if (videoXhrRef.current) {
      try { videoXhrRef.current.abort(); } catch {}
      videoXhrRef.current = null;
    }
    if (photoXhrRef.current) {
      try { photoXhrRef.current.abort(); } catch {}
      photoXhrRef.current = null;
    }
    setVideoActive(false);
    setPhotoActive(false);
    setMuxUploadId(null);
  }, []);

  return (
    <UploadContext.Provider value={{
      isUploadInProgress: videoActive || photoActive,
      muxUploadId,
      videoXhrRef,
      photoXhrRef,
      registerVideoUpload,
      registerPhotoUpload,
      clearVideoUpload,
      clearPhotoUpload,
      abortAll,
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
