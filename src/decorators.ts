import { injectable, decorate } from 'inversify';
import reader, {proxied} from '@viatsyshyn/ts-model-reader';

import { RouteReflector, ActionType, ParameterType, ParameterMetadata } from './route-refletor';

const ROUTER_HANDLE_ACTION_NAME = 'handle';

export function route(actionType: ActionType, path: string, ...middlewares: any[]): MethodDecorator {
  return (constructor: any) => {
    decorate(injectable(), constructor);

    RouteReflector.setRouteMetadata(constructor, {
      middlewares: middlewares,
      path,
      target: constructor,
      actionType
    });
    return constructor;
  }
}

export function httpAll(path: string, ...middlewares: any[]): MethodDecorator {
  return route('all', path, ...middlewares);
}
export function httpPost(path: string, ...middlewares: any[]): MethodDecorator {
  return route('post', path, ...middlewares);
}
export function httpPut(path: string, ...middlewares: any[]): MethodDecorator {
  return route('put', path, ...middlewares);
}
export function httpGet(path: string, ...middlewares: any[]): MethodDecorator {
  return route('get', path, ...middlewares);
}
export function httpDelete(path: string, ...middlewares: any[]): MethodDecorator {
  return route('delete', path, ...middlewares);
}
export function httpHead(path: string, ...middlewares: any[]): MethodDecorator {
  return route('head', path, ...middlewares);
}
export function httpPatch(path: string, ...middlewares: any[]): MethodDecorator {
  return route('patch', path, ...middlewares);
}

export function params<T>(type: ParameterType, parameterName?: string, Model?: T | [T], nullable?: boolean): ParameterDecorator {
  return (target: Object, methodName: string | symbol, index: number) => {

    if (methodName !== ROUTER_HANDLE_ACTION_NAME) {
      throw new Error(`Invalid route method. Current decorator can only be added on ${ROUTER_HANDLE_ACTION_NAME}`);
    }
    const injectRoot = parameterName === undefined;
    const meta: ParameterMetadata = {
      index,
      injectRoot,
      parameterName,
      type
    };

    const pTypes = Reflect.getOwnMetadata('design:paramtypes', target, methodName)
      || Reflect.getMetadata('design:paramtypes', target, methodName);

    if (pTypes?.[index] || Model) {
      const convertTo: ((raw: any) => T) = Model ?? pTypes?.[index];
      if ([Number, String, Boolean].includes(convertTo as any)) {
        meta.parser = (raw, context) => reader(raw, convertTo, context ?? `param[${index}]`, !nullable as true);
      } else {
        meta.parser = (raw, context) => proxied(raw, convertTo as any, context ?? `param[${index}]`, !nullable);
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

export function queryParam<T>(name: string, model: T | [T], nullable?: true): ParameterDecorator;
export function queryParam<T>(name: string, nullable?: true): ParameterDecorator;
export function queryParam<T>(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('QUERY_NAMED', name, model, nullable);
}

export function requestParam<T>(name: string, model?: T | [T], nullable?: true): ParameterDecorator;
export function requestParam<T>(name: string, nullable?: true): ParameterDecorator;
export function requestParam<T>(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('REQUEST_NAMED', name, model, nullable);
}

export function headerParam<T>(name: string, model?: T | [T], nullable?: true): ParameterDecorator;
export function headerParam<T>(name: string, nullable?: true): ParameterDecorator;
export function headerParam<T>(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('HEADER_NAMED', name, model, nullable);
}

export function cookieParam<T>(name: string, model?: T | [T], nullable?: true): ParameterDecorator;
export function cookieParam<T>(name: string, nullable?: true): ParameterDecorator;
export function cookieParam<T>(name: string, ...args: any[]): ParameterDecorator {
  const [model, nullable] = parse(args);
  return params('COOKIE_NAMED', name, model, nullable);
}

export function queryModel<T>(model: T, nullable?: true): ParameterDecorator;
export function queryModel<T>(nullable?: true): ParameterDecorator;
export function queryModel(target: Object, methodName: string | symbol, index: number): void;
export function queryModel(...args: any): ParameterDecorator | void {
  if (args.length === 3) {
    const [target, key, index] = args;
    return params('QUERY_MODEL')(target, key, index);
  }

  const [Model, nullable] = parse(args);
  return params('QUERY_MODEL', undefined, Model, nullable);
}

export function requestBody<T>(model: [T], nullable?: true): ParameterDecorator;
export function requestBody<T>(model: T, nullable?: true): ParameterDecorator;
export function requestBody<T>(nullable?: true): ParameterDecorator;
export function requestBody(target: Object, methodName: string | symbol, index: number): void;
export function requestBody(...args: any): ParameterDecorator | void {
  if (args.length === 3) {
    const [target, key, index] = args;
    return params('BODY_MODEL')(target, key, index);
  }

  const [Model, nullable] = parse(args);
  return params('BODY_MODEL', undefined, Model, nullable);
}

export function middleware(priority: number, path = '*', actionType: ActionType = 'all') {
  return (target: Object) => {
    decorate(injectable(), target);

    RouteReflector.setMiddlewareMeta(target, {
      actionType,
      path,
      priority,
      target
    });
  }
}
