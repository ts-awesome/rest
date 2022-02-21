import {RequestError, StatusCode, UnauthorizedError} from './';

import {IErrorMiddleware, IHttpRequest, IHttpResponse} from '.';
import {ErrorRequestHandler} from "express";

export interface IErrorResult<T = unknown> {
  error: string;
  code: number;
  name: string;
  data?: T;
}

export interface GlobalErrorLogger {
  (err: Error, req: IHttpRequest, user?: any): void;
}

export interface GlobalErrorLoggerFactory {
  (url: string): GlobalErrorLogger;
}

export class ErrorHandlerMiddleware implements IErrorMiddleware {

  constructor(
    private readonly errorLogger?: GlobalErrorLogger
  ) { }

  public async handle(err: Error & {statusCode?: number}, req: IHttpRequest & {user?: unknown}, res: IHttpResponse): Promise<void> {

    if (res.headersSent) {
      this.errorLogger?.(err, req, (req as any).user);
      return;
    }

    const { message, statusCode, name, ...data} = err;
    let errorResult: IErrorResult<unknown> = {
      error: message,
      code: statusCode ?? StatusCode.ServerError,
      name,
      data,
    };

    if (err instanceof UnauthorizedError) {
      errorResult.error = `Not authorized`;
      errorResult.data = undefined;

    } else if (err instanceof RequestError && err.statusCode === StatusCode.ServerError) {
      errorResult = {
        error: process.env.NODE_ENV !== 'production' ? `${name ?? 'Error'}: ${message}` : 'Server error',
        code: StatusCode.ServerError,
        name: 'Error',
      }
    }

    if (errorResult.code == StatusCode.ServerError) {
      this.errorLogger?.(err, req, req.user);
    }

    if (req.accepts('application/json')) {
      res
        .status(errorResult.code)
        .json(errorResult);

      return;
    }

    res
      .status(errorResult.code)
      .type('text/html')
      .send(`<html lang="en"><body><h1>${errorResult.code}</h1><hr/><h2>${errorResult.error}</h2></body></html>`);
  }
}

export function errorHandlerFactory(globalErrorLoggerFactory?: GlobalErrorLoggerFactory): ErrorRequestHandler {
  return (err, req, res, next) => {
    new ErrorHandlerMiddleware(globalErrorLoggerFactory?.(req.url))
      .handle(err, req as any, res as any)
      .then(() => next())
      .catch(next);
  }
}
