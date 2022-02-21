import {Params, ParamsDictionary, Request, Response} from 'express-serve-static-core';
import {Container} from 'inversify';

export interface IHttpRequest<P extends Params = ParamsDictionary> extends Request<P> {
  container?: Container | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IHttpResponse extends Response {
  cacheControl: {
    type: 'no-store'|'no-cache'|'private'|'public'|'immutable';
    maxAge?: number;
  };
}

export interface IMiddleware {
  handle(req: IHttpRequest, res: IHttpResponse): Promise<void>;
}

export interface IErrorMiddleware {
  handle(err: Error, req: IHttpRequest, res: IHttpResponse): Promise<void>;
}

export interface IRoute {
  handle(...args: any[]): Promise<void>;
}

export declare type Class<T> = new (...args: any) => T;
