import { injectable, decorate } from 'inversify';

import { RouteReflector, ActionType, ParameterType } from './route-refletor';

import { SwaggerService } from 'swagger-express-ts/swagger.service';
import {v4} from 'node-uuid';

export {ApiPath} from 'swagger-express-ts';

import {
  IApiOperationDeleteArgs,
  IApiOperationGetArgs,
  IApiOperationPatchArgs,
  IApiOperationPostArgs,
  IApiOperationPutArgs,
  SwaggerDefinitionConstant
} from 'swagger-express-ts';

export const SwaggerType = SwaggerDefinitionConstant.Model.Property.Type;

const ROUTER_HANDLE_ACTION_NAME = 'handle';

export function ApiOperationGet(args: IApiOperationGetArgs): MethodDecorator {
  return function (target: any) {
    SwaggerService.getInstance().addOperationGet(args, target, v4());
  };
}

export function ApiOperationPatch(args: IApiOperationPatchArgs): MethodDecorator {
  return function (target: any) {
    SwaggerService.getInstance().addOperationPatch(args, target, v4());
  };
}

export function ApiOperationPost(args: IApiOperationPostArgs): MethodDecorator {
  return function (target: any) {
    SwaggerService.getInstance().addOperationPost(args, target, v4());
  };
}

export function ApiOperationPut(args: IApiOperationPutArgs): MethodDecorator {
  return function (target: any) {
    SwaggerService.getInstance().addOperationPut(args, target, v4());
  };
}

export function ApiOperationDelete(args: IApiOperationDeleteArgs): MethodDecorator {
  return function (target: any) {
    SwaggerService.getInstance().addOperationDelete(args, target, v4());
  };
}

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

type ParameterDecoratorDelegate = (cookieName?: string) => ParameterDecorator;

function paramDecoratorFactory(parameterType: ParameterType): ParameterDecoratorDelegate {
  return (name?: string) => params(parameterType, name);
}

export const queryParam: ParameterDecoratorDelegate = paramDecoratorFactory('QUERY');
export const requestParam: ParameterDecoratorDelegate = paramDecoratorFactory('PARAMS');
export const requestBody: ParameterDecoratorDelegate = paramDecoratorFactory('BODY');
export const requestHeaders: ParameterDecoratorDelegate = paramDecoratorFactory('HEADERS');
export const cookies: ParameterDecoratorDelegate = paramDecoratorFactory('COOKIES');

export function params(type: ParameterType, parameterName?: string) {
  return (target: Object, methodName: string, index: number) => {

    if (methodName !== ROUTER_HANDLE_ACTION_NAME) {
      throw new Error(`Invalid route method. Current decorator can only be added on ${ROUTER_HANDLE_ACTION_NAME}`);
    }

    const injectRoot = parameterName === undefined;
    RouteReflector.addRouteParameterMetadata(target.constructor, {
      index,
      injectRoot,
      parameterName,
      type
    });
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
