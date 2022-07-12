import {ErrorRequestHandler, NextFunction, Request, RequestHandler, Response,} from 'express';

import {Router} from 'express';

import {Container, ContainerModule} from 'inversify';

import {
  MiddlewareMetadataSymbol,
  ParameterMetadata,
  RouteMetadata,
  RouteMetadataSymbol,
  RouteReflector
} from './route-refletor';

import {Class, IErrorMiddleware, IHttpRequest, IHttpResponse, IMiddleware, IRoute} from './interfaces';

import {ErrorHandlerMiddlewareSymbol, RequestSymbol, ResponseSymbol} from './symbols';
import {
  consoleReporter,
  IProfilingLog,
  IProfilingSession,
  ProfilingSession,
  ProfilingSessionSymbol,
  serverTimingReporter,
} from "@ts-awesome/profiler";
import {ErrorHandlerMiddleware, GlobalErrorLogger,} from "./error-handler.middleware";
import {ILogger, ILoggerFactory, LoggerFactorySymbol} from "@ts-awesome/logger";
import {NotFoundError} from "./errors";

export type IoCSetup = (req?: Request) => readonly ContainerModule[];

/* eslint-disable @typescript-eslint/no-use-before-define */

const ProfilingRequestTotal = Symbol();

export function useProfilingSession<T extends IProfilingSession>(Class?: Class<T>): RequestHandler {
  return async(async (req: IHttpRequest) => {
    const profilingSession: IProfilingSession = new (Class ?? ProfilingSession)();
    req[ProfilingRequestTotal] = profilingSession.start('total');
    req.container?.bind<IProfilingSession>(ProfilingSessionSymbol).toConstantValue(profilingSession);
  })
}

export function useProfilingSessionStop(): RequestHandler {
  return async(async (req: IHttpRequest, res: IHttpResponse) => {
    // const config = req.container?.isBound(ConfigSymbol) ? req.container.get<IConfig>(ConfigSymbol).get('profiler', ProfilerConfig) : undefined;
    if (req.container?.isBound(ProfilingSessionSymbol)) {
      const log = req[ProfilingRequestTotal]?.() as (IProfilingLog | undefined);

      const profilingSession = req.container.get<IProfilingSession>(ProfilingSessionSymbol);
      if (log != null && log.time > 300) {
        let logger: ILogger = console;
        if (req.container?.isBound(LoggerFactorySymbol)) {
          const loggerFactory = req.container.get<ILoggerFactory>(LoggerFactorySymbol);
          logger = loggerFactory(ProfilingSession.name);
        }

        logger.warn(req.url, 'took', log.time.toFixed(1) + 'ms');
        consoleReporter(profilingSession.logs).forEach(x => logger.info(x));
      }

      if (!res.headersSent) {
        res.setHeader('Server-Timing', serverTimingReporter(profilingSession.logs).join(','));
        res.send();
      }
    }
  })
}

export function useRequestContainer(container: Container): RequestHandler {
  return async(async (req: IHttpRequest, res: IHttpResponse) => {
    const child = req.container = container.createChild();
    child.bind<IHttpRequest>(RequestSymbol).toConstantValue(req);
    child.bind<IHttpResponse>(ResponseSymbol).toConstantValue(res);
  })
}

export function useContainerModules(setup?: IoCSetup): RequestHandler {
  return async(async (req: IHttpRequest) => {
    req.container?.load(...setup?.(req) ?? []);
  });
}

export function useErrorHandler(): ErrorRequestHandler {
  return (err, req, res, next) => {
    const url = req.url;
    (async (err, req, res) => profileAction(req, 'error-handler', () => {
      if (req.container == null) {
        return next(err);
      }

      const handler: IErrorMiddleware = (() => {
        if (req.container?.isBound(ErrorHandlerMiddlewareSymbol)) {
          return req.container.get<IErrorMiddleware>(ErrorHandlerMiddlewareSymbol)
        }

        let globalErrorLogger: GlobalErrorLogger = (err) => console.error(url, err);
        if (req.container?.isBound(LoggerFactorySymbol)) {
          const loggerFactory = req.container.get<ILoggerFactory>(LoggerFactorySymbol);
          globalErrorLogger = loggerFactory(url).error;
        }

        return new ErrorHandlerMiddleware(globalErrorLogger)
      })();

      return handler.handle(err, req, res);
    }))(err, req as IHttpRequest, res as IHttpResponse)
      .then(() => next())
      .catch(next);
  }
}

export function useIoC(container: Container): RequestHandler;
export function useIoC(setup: IoCSetup): RequestHandler;
export function useIoC(containerOrSetup: Container | IoCSetup): RequestHandler {
  const container: Container = typeof containerOrSetup === 'function' ? new Container() : containerOrSetup;
  const setup: IoCSetup = typeof containerOrSetup === 'function' ? containerOrSetup : () => [];
  container.load(...setup() ?? []);
  return async(async (req: IHttpRequest) => {
    req.container = container.createChild();
  });
}

export function useRestServer(setupRequestModules: IoCSetup): Router {

  const router = Router().use(
    // ensure we have a child container before profiling session starts
    async(async (req: IHttpRequest) => { req.container = req.container?.createChild() ?? new Container(); }),
    useProfilingSession(),
    useContainerModules(setupRequestModules),
  );

  const middlewaresMetadata = RouteReflector
    .getMiddlewaresMetadata()
    .sort((a, b) => b.priority - a.priority);

  for (const meta of middlewaresMetadata.filter(meta => meta.priority >= 0)) {
    router[meta.actionType](meta.path, useMiddleware(meta.target));
  }

  for (const meta of RouteReflector.getRoutesMetadata()) {
    router[meta.actionType](meta.path, useRoute(meta.target));
  }

  for (const meta of middlewaresMetadata.filter(meta => meta.priority < 0)) {
    router[meta.actionType](meta.path, useMiddleware(meta.target));
  }

  router.use((req, res: Response & {__handledBy?: Class<any>}, next) => {
    if (!res.headersSent && !res.__handledBy) {
      next(new NotFoundError(`Resource not found`));
    }
  });

  return router.use(
    useErrorHandler(),
    useProfilingSessionStop(),
    (req, res) => res.end(),
  );
}

function profileAction(req: IHttpRequest, metric: string, action: () => Promise<void> | void): Promise<void> | void;
function profileAction(req: IHttpRequest, metric: string, group: string, action: () => Promise<void> | void): Promise<void> | void;
function profileAction(req: IHttpRequest, ...args: unknown[]): Promise<void> | void {
  const action = args.pop() as (() => Promise<void> | void);

  const container = req.container;
  if (!container?.isBound(ProfilingSessionSymbol)) {
    return action();
  }

  const profilingSession = container.get<IProfilingSession>(ProfilingSessionSymbol);
  return profilingSession.auto(...args as [string, string, string], async () => action())
}

export function useRoute<T extends IRoute>(Class: Class<T>): RequestHandler {
  const meta: RouteMetadata | undefined = Class[RouteMetadataSymbol];
  return async(async (req: IHttpRequest, res: IHttpResponse & {__handledBy?: Class<T>}) => {

    if (typeof meta?.matcher === 'function' && meta.matcher(req) !== true) {
      return;
    }

    res.__handledBy = Class;
    res.set('Cache-Control', `no-cache`);
    res.cacheControl = meta?.cachable ?? {
      type: 'no-cache'
    };

    if (req.method === 'POST' || req.method === 'HEAD' || req.method === 'DELETE') {
      res.set('Cache-Control', `no-store`);
      res.cacheControl = {
        type: 'no-store'
      };
    }

    const container = req.container ?? new Container();

    if (!container.isBound(RequestSymbol)) {
      container.bind<IHttpRequest>(RequestSymbol).toConstantValue(req);
    }

    if (!container.isBound(ResponseSymbol)) {
      container.bind<IHttpResponse>(ResponseSymbol).toConstantValue(res);
    }

    const middlewares: [IMiddleware, string, unknown[]][] = meta?.middlewares
      .map((Middleware: Class<IMiddleware>) => [
        container.resolve(Middleware),
        Middleware.name || 'anonymous',
        extractParameters(req, RouteReflector.getRouteParametersMetadata(Middleware)).slice(2)
      ]) ?? [];

    for (const [instance, name, args] of middlewares) {
      await profileAction(req, name, 'middleware', () => instance.handle(req, res, ...args))
    }

    const instance = container.resolve(Class);
    const args = extractParameters(req, RouteReflector.getRouteParametersMetadata(Class));
    return profileAction(
      req,
      Class.name || 'anonymous',
      'route',
      () => instance.handle(...args));
  })
}

export function useMiddleware<T extends IMiddleware>(Class: Class<T>): RequestHandler {
  return async(async (req: IHttpRequest, res: IHttpResponse) => {
    const container = req.container ?? new Container();

    if (!container.isBound(RequestSymbol)) {
      container.bind<IHttpRequest>(RequestSymbol).toConstantValue(req);
    }

    if (!container.isBound(ResponseSymbol)) {
      container.bind<IHttpResponse>(ResponseSymbol).toConstantValue(res);
    }

    const instance = container.resolve(Class);
    const args = extractParameters(req, RouteReflector.getRouteParametersMetadata(Class)).slice(2);
    return profileAction(
      req,
      Class.name || 'anonymous',
      'global',
      () => instance.handle(req, res, ...args)
    );
  })
}

export function useRoutes<T extends IRoute>(...routes: Class<T>[]): Router {
  const router = Router();

  for(const Class of routes) {
    const meta: RouteMetadata | undefined = Class[RouteMetadataSymbol];
    if (!meta) {
      throw new Error(`Route class ${Class.name || Class} has no metadata`);
    }
    router[meta.actionType](meta.path, useRoute(meta.target));
  }

  return router;
}

export function useMiddlewares<T extends IMiddleware>(...middlewares: Class<T>[]): Router {
  const router = Router();

  for(const Class of middlewares) {
    const meta: RouteMetadata | undefined = Class[MiddlewareMetadataSymbol];
    if (!meta) {
      throw new Error(`Middleware class ${Class.name || Class} has no metadata`);
    }
    router[meta.actionType](meta.path, useMiddleware(meta.target));
  }

  return router;
}

function extractParameters(req: Request, params: ParameterMetadata[] = []): any[] {
  // noinspection CommaExpressionJS
  return params
    .reduce((r: ParameterMetadata[], a) => ((r[a.index] = a), r), [])
    .map(({ type, parameterName, parser }) => {
      const res = (() => {
        switch (type) {
          case 'QUERY_NAMED':   return getParam(req, 'query',   false, parameterName);
          case 'QUERY_MODEL':   return getParam(req, 'query',   true,  parameterName);
          case 'REQUEST_NAMED': return getParam(req, 'params',  false, parameterName);
          case 'BODY_NAMED':    return getParam(req, 'body',    false, parameterName);
          case 'BODY_MODEL':    return getParam(req, 'body',    true,  parameterName);
          case 'HEADER_NAMED':  return getParam(req, 'headers', false, parameterName);
          case 'COOKIE_NAMED':  return getParam(req, 'cookies', false, parameterName);
          default: throw new Error(`Unknown parameter type ${type}`);
        }
      })();
      return parser?.(res) ?? res;
    });
}

function getParam(source: Request, paramType: 'query'|'params'|'headers'|'cookies'|'body', injectRoot: boolean, name?: string | symbol): string | undefined {
  const param = source[paramType];
  if (param == null || injectRoot) {
    return param;
  }

  if (name == null) {
    return undefined
  }

  return param[paramType === 'headers' && typeof name === 'string' ? name.toLowerCase() : name];
}

function async(fn: (req: IHttpRequest, res: IHttpResponse) => Promise<any>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => fn(req as IHttpRequest, res as IHttpResponse).then(() => next()).catch(next);
}

