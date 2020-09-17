import {RequestError, StatusCode} from './';

import {IErrorMiddleware, IHttpRequest, IHttpResponse} from '.';
import {ErrorRequestHandler} from "express-serve-static-core";

export interface IErrorResult<T = unknown> {
  error: string;
  code: number;
  name?: string;
  errorData?: T;
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

  public async handle(err: Error, req: IHttpRequest, res: IHttpResponse): Promise<void> {

    const errorResult: IErrorResult<unknown> = {
      error: err.message,
      code: (err as any).statusCode ?? StatusCode.ServerError,
      name: err.name,
      errorData: (err as any).errorData ?? (err as any).data,
    };

    if (err instanceof RequestError) {
      const {statusCode} = err;
      if (statusCode === StatusCode.Unauthorized) {
        errorResult.error = `Not authorized`;
      }

      if (statusCode >= StatusCode.ServerError) {
        this.errorLogger?.(err, req, (req as any).user);
      }
    }

    if ((req.header('Accept')?.indexOf('text/html') ?? -1) >= 0) {
      return res
        .status(errorResult.code)
        .send(`<html lang="en"><body><h1>${errorResult.code}</h1><hr/><h2>${errorResult.error}</h2></body></html>`)
        .end();
    }

    return res
      .status(errorResult.code)
      .json(errorResult)
      .end();
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
