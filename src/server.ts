import {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express-serve-static-core';

import {Router} from 'express';

import {Container} from 'inversify';

import {ParameterMetadata, RouteMetadata, RouteMetadataSymbol, RouteReflector} from './route-refletor';

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

export type RequestContainerBinder = (container: Container, req: Request) => void;

/* eslint-disable @typescript-eslint/no-use-before-define */

const ProfilingRequestTotal = Symbol();

export function useRequestContainer(container: Container): RequestHandler {
  return async(async (req: IHttpRequest, res: IHttpResponse) => {
    const child = container.createChild();
    req.container = child;
    child.bind<IHttpRequest>(RequestSymbol).toConstantValue(req);
    child.bind<IHttpResponse>(ResponseSymbol).toConstantValue(res);
  })
}

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

      if (!res.headersSent && process.env.VERBOSE_SERVER_TIMING === 'on') {
        res.setHeader('Server-Timing', serverTimingReporter(profilingSession.logs).join(','));
        res.send();
      }
    }
  })
}

export function useRequestIoC(init: RequestContainerBinder): RequestHandler {
  return async(async (req: IHttpRequest) => profileAction(req, 'ioc', async () => req.container ? init(req.container, req) : Promise.resolve()))
}

export function useErrorHandler(): ErrorRequestHandler {
  return (err, req, res, next) => {
    const url = req.url;
    (async (err, req, res) => profileAction(req, 'error-handler', () => {
      if (req.container?.isBound(ErrorHandlerMiddlewareSymbol)) {
        return req.container.get<IErrorMiddleware>(ErrorHandlerMiddlewareSymbol).handle(err, req, res)
      }

      let globalErrorLogger: GlobalErrorLogger = (err) => console.error(url, err);
      if (req.container?.isBound(LoggerFactorySymbol)) {
        const loggerFactory = req.container.get<ILoggerFactory>(LoggerFactorySymbol);
        globalErrorLogger = loggerFactory(url).error;
      }

      return new ErrorHandlerMiddleware(globalErrorLogger).handle(err, req, res);
    }))(err, req as IHttpRequest, res as IHttpResponse).then(() => next()).catch(next);
  }
}

export default function (container: Container, requestContainerBinder: RequestContainerBinder): Router {

  const router = new Router().use(
    useRequestContainer(container),
    useProfilingSession(),
    useRequestIoC(requestContainerBinder),
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

    const binds = meta?.middlewares
      .map((Middleware: any) => {
        const tempSymbol = Symbol();
        container.bind<IMiddleware>(tempSymbol).to(Middleware).inSingletonScope();
        return [tempSymbol as any, Middleware.name || 'anonymous'];
      }) ?? [];

    for (const [bound, name] of binds) {
      await profileAction(req, name, 'middleware', async () => {
        await container.get<IMiddleware>(bound).handle(req, res);
      })
    }

    const routeSymbol = Symbol();
    container.bind<IRoute>(routeSymbol).to(Class).inSingletonScope();
    const instance = container.get<IRoute>(routeSymbol);
    const args = extractParameters(req, RouteReflector.getRouteParametersMetadata(Class));
    return profileAction(req, Class.name || 'anonymous', 'route', () => instance.handle(...args));
  })
}

export function useMiddleware<T extends IMiddleware>(Class: Class<T>): RequestHandler {
  return async(async (req: IHttpRequest, res: IHttpResponse) => {
    const middlewareSymbol = Symbol();
    const container = req.container ?? new Container();
    container.bind<IMiddleware>(middlewareSymbol).to(Class);
    return profileAction(
      req,
      Class.name || 'anonymous',
      'global',
      () => container.get<IMiddleware>(middlewareSymbol).handle(req, res)
    );
  })
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

function async(fn: (req: IHttpRequest, res: IHttpResponse) => Promise<any>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => fn(req as IHttpRequest, res as IHttpResponse).then(() => next()).catch(next);
}
