export interface MediaUploadResult {
  publicUrl: string;
  key: string;
}

function getDevToken(): string | null {
  try {
    return localStorage.getItem("g_dev_token");
  } catch {
    return null;
  }
}

function attachAuth(xhr: XMLHttpRequest): void {
  const token = getDevToken();
  if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
}

export async function uploadToR2Media(
  file: File,
  folder = "media",
  onProgress?: (pct: number) => void,
  xhrHolder?: { current: XMLHttpRequest | null },
): Promise<MediaUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (xhrHolder) xhrHolder.current = xhr;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.storageExceeded) {
            reject(Object.assign(new Error(body.error ?? "Storage limit exceeded"), { storageExceeded: true, upgradeRequired: body.upgradeRequired }));
          } else if (body.error) {
            reject(new Error(body.error));
          } else {
            resolve({ publicUrl: body.publicUrl, key: body.key });
          }
        } catch {
          reject(new Error("Invalid response from upload endpoint"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.storageExceeded) {
            reject(Object.assign(new Error(body.error ?? "Storage limit exceeded"), { storageExceeded: true, upgradeRequired: body.upgradeRequired }));
          } else {
            reject(new Error(body.error ?? `Upload failed: HTTP ${xhr.status}`));
          }
        } catch {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.open("POST", "/api/upload/media");
    xhr.withCredentials = true;
    attachAuth(xhr);
    xhr.send(formData);
  });
}

export async function uploadToR2Private(
  file: File,
  folder = "docs",
  onProgress?: (pct: number) => void,
): Promise<{ key: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.storageExceeded) {
            reject(Object.assign(new Error(body.error ?? "Storage limit exceeded"), { storageExceeded: true, upgradeRequired: body.upgradeRequired }));
          } else if (body.error) {
            reject(new Error(body.error));
          } else {
            resolve({ key: body.key });
          }
        } catch {
          reject(new Error("Invalid response from upload endpoint"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.storageExceeded) {
            reject(Object.assign(new Error(body.error ?? "Storage limit exceeded"), { storageExceeded: true, upgradeRequired: body.upgradeRequired }));
          } else {
            reject(new Error(body.error ?? `Upload failed: HTTP ${xhr.status}`));
          }
        } catch {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.open("POST", "/api/upload/private");
    xhr.withCredentials = true;
    attachAuth(xhr);
    xhr.send(formData);
  });
}
