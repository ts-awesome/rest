import { injectable, decorate } from 'inversify';

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

const parserMap = {
  [Number.name]: parseInt,
  [Boolean.name]: (v: string | boolean) => v === 'true' || v === true,
  [Date.name]: (v: string | Date) => new Date(v)
};

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

    const pTypes = Reflect.getOwnMetadata('design:paramtypes', target, methodName)
      || Reflect.getMetadata('design:paramtypes', target, methodName);

    if (pTypes?.[index]) {
      meta.parser = parserMap[pTypes[index].name];
    }

    RouteReflector.addRouteParameterMetadata(target.constructor,  meta);
  };
}

type ParameterDecoratorDelegate = (name?: string) => ParameterDecorator;

function paramDecoratorFactory(parameterType: ParameterType): ParameterDecoratorDelegate {
  return (name?: string) => params(parameterType, name);
}

export const queryParam: ParameterDecoratorDelegate = paramDecoratorFactory('QUERY_NAMED');
export const queryModel: ParameterDecoratorDelegate = paramDecoratorFactory('QUERY_MODEL');
export const requestParam: ParameterDecoratorDelegate = paramDecoratorFactory('REQUEST_NAMED');
export const requestBody: ParameterDecoratorDelegate = paramDecoratorFactory('REQUEST_MODEL');
export const header: ParameterDecoratorDelegate = paramDecoratorFactory('HEADER_NAMED');
export const cookies: ParameterDecoratorDelegate = paramDecoratorFactory('COOKIES');


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
