/** User object as exposed to clients (never includes credentials). */
export interface UserDTO {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  storageUsed: number;
  storageLimit: number;
  activityLogging: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
}

export interface MessageResponse {
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export interface FileDTO {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileListResponse {
  files: FileDTO[];
  total: number;
  page: number;
  limit: number;
}

export type ActivityAction =
  | "UPLOAD"
  | "RENAME"
  | "FAVORITE"
  | "UNFAVORITE"
  | "DELETE"
  | "DOWNLOAD"
  | "MERGE"
  | "SPLIT"
  | "ORGANIZE"
  | "REPLACE_PAGES"
  | "EDIT"
  | "WATERMARK"
  | "CONVERT"
  | "COMPRESS"
  | "OCR"
  | "FORM_FILL"
  | "FORM_CREATE"
  | "REDACT"
  | "REMOVE_TEXT";

export interface ActivityDTO {
  id: string;
  action: ActivityAction;
  detail: string | null;
  fileId: string | null;
  fileName: string | null;
  createdAt: string;
}

export interface ActivityListResponse {
  activities: ActivityDTO[];
  total: number;
  page: number;
  limit: number;
}
