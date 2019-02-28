import { Application, NextFunction, Request, Response } from 'express';

import { Container } from 'inversify';

import { MiddlewareMetadata, ParameterMetadata, RouteMetadata, RouteReflector } from './route-refletor';

import { IRoute, IHttpRequest, IHttpResponse, IMiddleware } from './interfaces';

import Symbols from './symbols';

export type RequestContainerBinder = (container: Container, req: Request) => void;

export default function (app: Application, rootContainer: Container, requestContainerBinder: RequestContainerBinder): void {

  // create request container here
  requireScopeBinder(app, rootContainer, requestContainerBinder);

  let middlewaresMetadata = RouteReflector
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
    let requestContainer = rootContainer.createChild();
    requestContainerBinder(requestContainer, req);
    requestContainer.bind<IHttpRequest>(Symbols.Request).toConstantValue(req);
    requestContainer.bind<IHttpResponse>(Symbols.Response).toConstantValue(res);
    req.container = requestContainer;
  }));
}

function registerRouter(app: Application, meta: RouteMetadata): void {
  app[meta.actionType](meta.path, async(async (req: IHttpRequest, res: IHttpResponse) => {

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
    let parametersMeta = RouteReflector.getRouteParametersMetadata(meta.target);
    let args = extractParameters(req, parametersMeta);
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
    .reduce((r, a) => (((r as any)[a.index] = a), r), [])
    .map(({ type, parameterName, injectRoot }) => {
      switch (type) {
        case 'PARAMS':   return getParam(req, 'params', injectRoot, parameterName);
        case 'QUERY':    return getParam(req, 'query', injectRoot, parameterName);
        case 'BODY':     return req.body;
        case 'HEADERS':  return getParam(req, 'headers', injectRoot, parameterName);
        case 'COOKIES':  return getParam(req, 'cookies', injectRoot, parameterName);
        default: throw new Error(`Unknown parameter type ${type}`);
      }
    });
}

function getParam(source: Request, paramType: string, injectRoot: boolean, name?: string, ) {
  if (paramType === 'headers' && name) {
    name = name.toLowerCase();
  }
  let param = source[paramType];

  if (injectRoot) {
    return param;
  } else {
    return (param && name) ? param[name] : undefined;
  }
}

function async(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).then(() => next()).catch(next);
}
