/** Application error carrying an HTTP status and stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Forbidden") => new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);

export const badRequest = (message: string, code = "BAD_REQUEST") =>
  new AppError(400, code, message);

export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
