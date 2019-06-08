export enum StatusCode {
  Success = 200,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  ServerError = 500
}

export class RequestError extends Error {
  public statusCode: number;

  constructor(message: string, name: string, statusCode?: StatusCode) {
    super();
    this.statusCode = statusCode || StatusCode.ServerError;
    this.name = name;
    this.message = message;

    Object.setPrototypeOf(this, RequestError.prototype);
  }
}

export class ConfigError extends RequestError {
  constructor(message?: string) {
    super(message || "Config Error", "ConfigError");
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

export class ForbiddenError extends RequestError {
  constructor(message?: string) {
    super(message || "Forbidden", "ForbiddenError");
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class BadRequestError extends RequestError {
  constructor(message?: string) {
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
