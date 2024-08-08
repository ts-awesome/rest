import {StatusCode} from './status-code';

export class RequestError extends Error {
  public statusCode: number;

  constructor(message: string, name: string, statusCode?: StatusCode) {
    super(message);
    this.statusCode = statusCode ?? StatusCode.ServerError;
    this.name = name;
    this.message = message;

    Object.setPrototypeOf(this, RequestError.prototype);
  }
}

export class ForbiddenError extends RequestError {
  constructor(message?: string) {
    super(message || "Forbidden", "Forbidden", StatusCode.Forbidden);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class BadRequestError extends RequestError {
  constructor(
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message || "Bad Request Error", "BadRequest", StatusCode.BadRequest);

    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class NotFoundError extends RequestError {
  constructor(message?: string) {
    super(message || "Not Found Error", "NotFound", StatusCode.NotFound);

    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends RequestError {
  constructor(message?: string) {
    super(message || "Unauthorized Error", "Unauthorized", StatusCode.Unauthorized);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}
