import type {IHttpRequest, IHttpResponse, IMiddleware} from "./interfaces";
import type {RequestHandler} from "express-serve-static-core";
import {injectable} from "inversify";

type Class<T> = new (...arg: unknown[]) => T;

// noinspection JSUnusedGlobalSymbols
export function ExpressMiddleware(native: RequestHandler): Class<IMiddleware> {
  @injectable()
  class ExpressMiddlewareWrapper implements IMiddleware {
    handle(req: IHttpRequest, res: IHttpResponse): Promise<void> {
      return new Promise((resolve, reject) => {
        native(req, res, (err?: unknown) => (err ? reject(err) : resolve()))
      })
    }
  }

  return ExpressMiddlewareWrapper
}


