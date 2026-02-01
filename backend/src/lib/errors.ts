export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message, 422, 'VALIDATION_ERROR');
  }
}

export class AuthError extends AppError {
  constructor(message = 'Invalid credentials') {
    super(message, 401, 'AUTH_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'Forbidden',
    public action?: string,
    public method?: string,
  ) {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class GoneError extends AppError {
  constructor(message: string, public action?: string) {
    super(message, 410, 'GONE');
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = 'Too many requests',
    public retryAfter: number = 60,
  ) {
    super(message, 429, 'RATE_LIMIT');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'File too large. Maximum size is 5MB.') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

export class UnsupportedMediaError extends AppError {
  constructor(
    message = 'Unsupported file type. Please upload a JPG, PNG, or GIF image.',
  ) {
    super(message, 415, 'UNSUPPORTED_MEDIA');
  }
}
