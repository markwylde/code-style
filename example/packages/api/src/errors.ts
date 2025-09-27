export class ApplicationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(
    message: string,
    options?: { statusCode?: number; code?: string },
  ) {
    super(message);
    this.name = "ApplicationError";
    this.statusCode = options?.statusCode ?? 500;
    this.code = options?.code ?? "INTERNAL_ERROR";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string, code = "NOT_FOUND") {
    super(message, { statusCode: 404, code });
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details: unknown) {
    super(message, { statusCode: 400, code: "VALIDATION_FAILED" });
    this.details = details;
    this.name = "ValidationError";
  }

  public readonly details: unknown;
}
