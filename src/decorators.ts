import { injectable, decorate } from 'inversify';

import { RouteReflector, ActionType, ParameterType, ParameterMetadata } from './route-refletor';

const ROUTER_HANDLE_ACTION_NAME = 'handle';

export function route(actionType: ActionType, path: string, ...middlewares: any[]) {
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

export function httpAll(path: string, ...middlewares: any[]) {
  return route('all', path, ...middlewares);
}
export function httpPost(path: string, ...middlewares: any[]) {
  return route('post', path, ...middlewares);
}
export function httpPut(path: string, ...middlewares: any[]) {
  return route('put', path, ...middlewares);
}
export function httpGet(path: string, ...middlewares: any[]) {
  return route('get', path, ...middlewares);
}
export function httpDelete(path: string, ...middlewares: any[]) {
  return route('delete', path, ...middlewares);
}
export function httpHead(path: string, ...middlewares: any[]) {
  return route('head', path, ...middlewares);
}
export function httpPatch(path: string, ...middlewares: any[]) {
  return route('patch', path, ...middlewares);
}

type ParameterDecoratorDelegate = (name?: string) => ParameterDecorator;

function paramDecoratorFactory(parameterType: ParameterType): ParameterDecoratorDelegate {
  return (name?: string) => params(parameterType, name);
}

export const queryParam: ParameterDecoratorDelegate = paramDecoratorFactory('QUERY');
export const requestParam: ParameterDecoratorDelegate = paramDecoratorFactory('PARAMS');
export const requestBody: ParameterDecoratorDelegate = paramDecoratorFactory('BODY');
export const requestHeaders: ParameterDecoratorDelegate = paramDecoratorFactory('HEADERS');
export const cookies: ParameterDecoratorDelegate = paramDecoratorFactory('COOKIES');

const parserMap = {
  [Number.name]: parseInt,
  [Boolean.name]: (v: string | boolean) => v === 'true' || v === true,
  [Date.name]: (v: string | Date) => new Date(v)
}

export function params(type: ParameterType, parameterName?: string): ParameterDecorator {
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

    let pTypes = Reflect.getOwnMetadata('design:paramtypes', target, methodName)
      || Reflect.getMetadata('design:paramtypes', target, methodName);

    if (pTypes && pTypes[index]) {
      meta.parser = parserMap[pTypes[index].name];
    }

    RouteReflector.addRouteParameterMetadata(target.constructor,  meta);
  };
}

export function middleware(priority: number, path: string = '*', actionType: ActionType = 'all') {
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
