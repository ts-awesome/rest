// noinspection JSUnusedGlobalSymbols

import { injectable, decorate } from 'inversify';
import reader, {proxied} from '@ts-awesome/model-reader';

import {RouteReflector, ActionType, ParameterType, ParameterMetadata, MatcherDelegate} from './route-refletor';

const ROUTER_HANDLE_ACTION_NAME = 'handle';

export function route(actionType: ActionType, path: string, matcher: MatcherDelegate | null, ...middlewares: any[]): ClassDecorator {
  return (constructor: any) => {
    decorate(injectable(), constructor);

    RouteReflector.setRouteMetadata(constructor, {
      middlewares,
      path,
      target: constructor,
      actionType,
      matcher
    });
    return constructor;
  }
}

export function cacheControl(type: 'immutable', maxAge?: number): ClassDecorator;
export function cacheControl(type: 'public', maxAge: number): ClassDecorator;
export function cacheControl(type: 'private', maxAge: number): ClassDecorator;
export function cacheControl(type: 'no-cache'): ClassDecorator;
export function cacheControl(type: 'no-store'): ClassDecorator;
export function cacheControl(type: 'no-store'|'no-cache'|'private'|'public'|'immutable' = 'no-store', maxAge = 0): ClassDecorator {
  return (constructor: any) => {
    RouteReflector.setRouteMetadata(constructor, {
      target: constructor,
      cachable: {
        type,
        maxAge
      }
    });
    return constructor;
  }
}

export function httpAll(path: string, ...middlewares: any[]): ClassDecorator {
  return route('all', path, null, ...middlewares);
}
export function httpPost(path: string, ...middlewares: any[]): ClassDecorator {
  return route('post', path, null, ...middlewares);
}
export function httpPut(path: string, ...middlewares: any[]): ClassDecorator {
  return route('put', path, null, ...middlewares);
}
export function httpGet(path: string, ...middlewares: any[]): ClassDecorator {
  return route('get', path, null, ...middlewares);
}
export function httpDelete(path: string, ...middlewares: any[]): ClassDecorator {
  return route('delete', path, null, ...middlewares);
}
export function httpHead(path: string, ...middlewares: any[]): ClassDecorator {
  return route('head', path, null, ...middlewares);
}
export function httpPatch(path: string, ...middlewares: any[]): ClassDecorator {
  return route('patch', path, null, ...middlewares);
}

export function params<T>(type: ParameterType, parameterName?: string, Model?: T | [T], nullable?: boolean): ParameterDecorator {
  return (target: any, methodName: string | symbol | undefined, index: number) => {
    if (methodName !== ROUTER_HANDLE_ACTION_NAME) {
      throw new Error(`Invalid route method. Current decorator can only be added on ${ROUTER_HANDLE_ACTION_NAME}`);
    }

    const meta: ParameterMetadata = {
      index,
      parameterName,
      type
    };

    const pTypes = Reflect.getOwnMetadata('design:paramtypes', target, methodName)
      || Reflect.getMetadata('design:paramtypes', target, methodName);

    if (pTypes?.[index] || Model) {
      const convertTo: ((raw: any) => T) = Model ?? pTypes?.[index];
      if ([Number, String, Boolean].includes(convertTo as any)) {
        meta.parser = (raw, context) => raw != null ? reader(raw, convertTo, context ?? `param[${index}]`, !nullable as true) : raw;
      } else {
        meta.parser = (raw, context) => raw != null && typeof(raw) !== 'function' ? proxied(raw, convertTo as any, context ?? `param[${index}]`, !nullable) : raw
      }
    }

    RouteReflector.addRouteParameterMetadata(target.constructor, meta);
  };
}

function last<T>(x: T[]): T | undefined {
  return x.length > 0 ? x[x.length - 1] : undefined;
}

function parse(args: any[]): [any, boolean] {
  const nullable = typeof last(args) === 'boolean' ? args.pop() as boolean : false;
  const model = args.pop();
  return [model, nullable];
}

type Class<T=any> = new (...arg: any[]) => T;

export function queryParam<T extends Class>(name: string, model: T | [T], nullable?: true): ParameterDecorator;
export function queryParam(name: string, nullable?: true): ParameterDecorator;
export function queryParam(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('QUERY_NAMED', name, model, nullable);
}

export function bodyParam<T extends Class>(name: string, model: T | [T], nullable?: true): ParameterDecorator;
export function bodyParam(name: string, nullable?: true): ParameterDecorator;
export function bodyParam(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('BODY_NAMED', name, model, nullable);
}

export function requestParam<T extends Class>(name: string, model?: T | [T], nullable?: true): ParameterDecorator;
export function requestParam(name: string, nullable?: true): ParameterDecorator;
export function requestParam(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('REQUEST_NAMED', name, model, nullable);
}

export function headerParam<T extends Class>(name: string, model?: T | [T], nullable?: true): ParameterDecorator;
export function headerParam(name: string, nullable?: true): ParameterDecorator;
export function headerParam(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('HEADER_NAMED', name, model, nullable);
}

export function cookieParam<T extends Class>(name: string, model?: T | [T], nullable?: true): ParameterDecorator;
export function cookieParam(name: string, nullable?: true): ParameterDecorator;
export function cookieParam(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('COOKIE_NAMED', name, model, nullable);
}

export function queryModel<T extends Class>(model: T, nullable?: true): ParameterDecorator;
export function queryModel(nullable?: true): ParameterDecorator;
export function queryModel(target: Object, methodName: string | symbol, index: number): void;
export function queryModel(...args: any[]): ParameterDecorator | void {
  if (args.length === 3) {
    const [target, key, index] = args;
    return params('QUERY_MODEL')(target, key, index);
  }

  const [Model, nullable] = parse(args);
  return params('QUERY_MODEL', undefined, Model, nullable);
}

export function requestBody<T extends Class>(model: T | [T], nullable?: true): ParameterDecorator;
export function requestBody(nullable?: true): ParameterDecorator;
export function requestBody(target: Object, methodName: string | symbol, index: number): void;
export function requestBody(...args: any[]): ParameterDecorator | void {
  if (args.length === 3) {
    const [target, key, index] = args;
    return params('BODY_MODEL')(target, key, index);
  }

  const [Model, nullable] = parse(args);
  return params('BODY_MODEL', undefined, Model, nullable);
}

export function middleware(priority: number, path = '*', actionType: ActionType = 'all'): ClassDecorator {
  return <TFunction extends Function>(target: TFunction): TFunction | void => {
    decorate(injectable(), target);

    RouteReflector.setMiddlewareMeta(target, {
      actionType,
      path,
      priority,
      target: target as any
    });
  }
}
