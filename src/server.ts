import { Application, NextFunction, Request, Response } from 'express-serve-static-core';

import { Container } from 'inversify';

import { MiddlewareMetadata, ParameterMetadata, RouteMetadata, RouteReflector } from './route-refletor';

import { IRoute, IHttpRequest, IHttpResponse, IMiddleware } from './interfaces';

import {RequestSymbol, ResponseSymbol} from './symbols';

export type RequestContainerBinder = (container: Container, req: Request) => void;

/* eslint-disable @typescript-eslint/no-use-before-define */

export default function (app: Application, rootContainer: Container, requestContainerBinder: RequestContainerBinder): void {

  // create request container here
  requireScopeBinder(app, rootContainer, requestContainerBinder);

  const middlewaresMetadata = RouteReflector
    .getMiddlewaresMetadata()
    .sort(meta => meta.priority);

  middlewaresMetadata
    .filter(meta => meta.priority >= 0)
    .forEach(meta => registerMiddleware(app, meta));

  RouteReflector
    .getRoutesMetadata()
    .forEach(meta => registerRouter(app, meta));

  middlewaresMetadata
    .filter(meta => meta.priority < 0)
    .forEach(meta => registerMiddleware(app, meta));
}

function requireScopeBinder(app: Application, rootContainer: Container, requestContainerBinder: RequestContainerBinder): void {
  app.use(async(async (req: IHttpRequest, res: IHttpResponse) => {
    const requestContainer = rootContainer.createChild();
    requestContainerBinder(requestContainer, req);
    requestContainer.bind<IHttpRequest>(RequestSymbol).toConstantValue(req);
    requestContainer.bind<IHttpResponse>(ResponseSymbol).toConstantValue(res);
    req.container = requestContainer;
  }));
}

function registerRouter(app: Application, meta: RouteMetadata): void {
  app[meta.actionType](meta.path, async(async (req: IHttpRequest, res: IHttpResponse) => {

    if (typeof meta.matcher === 'function' && meta.matcher(req) !== true) {
      return;
    }

    res.set('Cache-Control', `no-cache`);
    res.cacheControl = meta.cachable ?? {
      type: 'no-cache'
    };

    if (req.method === 'POST' || req.method === 'HEAD' || req.method === 'DELETE') {
      res.set('Cache-Control', `no-store`);
      res.cacheControl = {
        type: 'no-store'
      };
    }

    const binds = meta.middlewares
      .map((Middleware: any) => {
        const tempSymbol = Symbol();
        req.container.bind<IMiddleware>(tempSymbol).to(Middleware).inSingletonScope();
        return tempSymbol as any;
      });

    for (let i = 0; i < binds.length; i++) {
      await req.container.get<IMiddleware>(binds[i]).handle(req, res);
    }

    const routeSymbol = Symbol();
    req.container.bind<IRoute>(routeSymbol).to(meta.target).inSingletonScope();
    const instance = req.container.get<IRoute>(routeSymbol);
    const parametersMeta = RouteReflector.getRouteParametersMetadata(meta.target);
    const args = extractParameters(req, parametersMeta);
    return instance.handle(...args);
  }));
}

function registerMiddleware(app: Application, meta: MiddlewareMetadata): void {
  app[meta.actionType](meta.path, async(async (req: IHttpRequest, res: IHttpResponse) => {
    const middlewareSymbol = Symbol();
    req.container.bind<IMiddleware>(middlewareSymbol).to(meta.target);
    return req.container.get<IMiddleware>(middlewareSymbol).handle(req, res);
  }));
}

function extractParameters(req: Request, params: ParameterMetadata[] = []): any[] {
  // noinspection CommaExpressionJS
  return params
    .reduce((r: ParameterMetadata[], a) => ((r[a.index] = a), r), [])
    .map(({ type, parameterName, injectRoot, parser }) => {
      const res = (() => {
        switch (type) {
          case 'QUERY_NAMED':   return getParam(req, 'query', injectRoot, parameterName);
          case 'QUERY_MODEL':   return req.query;
          case 'REQUEST_NAMED': return getParam(req, 'params', injectRoot, parameterName);
          case 'BODY_NAMED':    return getParam(req, 'body', injectRoot, parameterName);
          case 'BODY_MODEL':    return req.body;
          case 'HEADER_NAMED':  return getParam(req, 'headers', injectRoot, parameterName);
          case 'COOKIE_NAMED':  return getParam(req, 'cookies', injectRoot, parameterName);
          default: throw new Error(`Unknown parameter type ${type}`);
        }
      })();
      return parser?.(res) ?? res;
    });
}

function getParam(source: Request, paramType: 'query'|'params'|'headers'|'cookies'|'body', injectRoot: boolean, name?: string | symbol): string {
  if (paramType === 'headers' && typeof name === 'string') {
    name = name.toLowerCase();
  }
  const param = source[paramType];

  if (injectRoot) {
    return param;
  } else {
    return (param && name) ? param[name] : undefined;
  }
}

function async(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).then(() => next()).catch(next);
}
