import type { ApiErrorBody } from "@pdfforge/shared";

/** Access token is kept in memory only — never in localStorage. */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(res.status, "UNKNOWN", `Request failed with status ${res.status}`);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Internal flag preventing infinite refresh loops. */
  _retried?: boolean;
}

/**
 * JSON API client. Attaches the bearer token and, on a 401, transparently
 * attempts one token refresh (via the httpOnly cookie) before failing.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });

  if (res.status === 401 && !options._retried && !path.startsWith("/api/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) return api<T>(path, { ...options, _retried: true });
  }

  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

/** Attempts a silent session refresh. Returns true when a new token was obtained. */
export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

/**
 * Multipart upload with progress, using XHR (fetch has no upload progress).
 * Retries once after a token refresh on 401, like `api`.
 */
export function apiUpload<T>(
  path: string,
  files: File[],
  onProgress?: (percent: number) => void,
  retried = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", async () => {
      if (xhr.status === 401 && !retried) {
        const ok = await tryRefresh();
        if (ok) {
          apiUpload<T>(path, files, onProgress, true).then(resolve, reject);
          return;
        }
      }
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through to generic error below
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      const err = (body ?? {}) as { error?: { code?: string; message?: string } };
      reject(
        new ApiError(
          xhr.status,
          err.error?.code ?? "UPLOAD_FAILED",
          err.error?.message ?? `Upload failed with status ${xhr.status}`,
        ),
      );
    });

    xhr.addEventListener("error", () =>
      reject(new ApiError(0, "NETWORK_ERROR", "Network error during upload")),
    );

    xhr.send(form);
  });
}

/** Fetches a protected file and triggers a browser download. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: "include",
  });
  if (!res.ok) throw await (async () => parseError(res))();
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
