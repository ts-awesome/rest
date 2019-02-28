import { Request, Response } from 'express';
import { Container } from 'inversify';

export interface IHttpRequest extends Request {
  container: Container;
}

export interface IHttpResponse extends Response {

}

export interface IMiddleware {
  handle(req: IHttpRequest, res: IHttpResponse): Promise<void>
}

export interface IErrorMiddleware {
  handle(err: Error, req: IHttpRequest, res: IHttpResponse): Promise<void>
}

export interface IRoute {
  handle(...args: any[]): Promise<void>
}
