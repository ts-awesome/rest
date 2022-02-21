import {Request, Response} from 'express';
import {Container} from 'inversify';

export interface IHttpRequest extends Request {
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

export interface IServer {
  start(): Promise<void>;
  stop(): Promise<void>
}

export interface HealthCheckStatus {
  readonly title: string;
  readonly healthy: boolean;
}

export interface HealthStatus {
  readonly healthy: boolean;
  readonly checks: readonly HealthCheckStatus[];
}

export interface IHealthChecker {
  readonly title: string;
  healthy(): Promise<boolean | HealthStatus>;
}

export interface IManagedResource extends IServer, IHealthChecker {
}
