import "reflect-metadata";

export type ActionType = 'post' | 'get' | 'put' | 'delete' | 'patch' | 'head' | 'all';

export type ParameterType = 'QUERY_NAMED' | 'QUERY_MODEL' | 'REQUEST_NAMED' | 'BODY_MODEL' | 'HEADER_NAMED' | 'COOKIE_NAMED';

export const METADATA_KEY = {
  route: Symbol.for('route'),
  parameter: Symbol.for('parameter'),
  middleware: Symbol.for('middleware')
};

export interface RouteMetadata {
  path: string;
  middlewares: any[];
  target: any;
  actionType: ActionType;
  cachable?: {
    type: 'no-store'|'no-cache'|'private'|'public'|'immutable';
    maxAge?: number;
  };
}

export interface ParameterMetadata {
  parameterName: string | symbol | undefined;
  injectRoot: boolean;
  index: number;
  type: ParameterType;
  parser?: (raw: any, context?: string) => any;
}

export interface MiddlewareMetadata {
  path: string;
  actionType: ActionType;
  target: any;
  priority: number;
}

export class RouteReflector {


  public static getRoutesFromMetadata(): any[] {
    return RouteReflector.getRoutesMetadata().map((metadata) => metadata.target);
  }

  public static getRouteMetadata(constructor: any): RouteMetadata {
    return Reflect.getMetadata(METADATA_KEY.route, constructor);
  }

  public static getRouteParametersMetadata(constructor: any): ParameterMetadata[] {
    return Reflect.getMetadata(METADATA_KEY.parameter, constructor);
  }

  public static cleanUpMetadata(): void {
    Reflect.defineMetadata(METADATA_KEY.route, [], Reflect);
  }

  public static setRouteMetadata(target: any, currentMetadata: Partial<RouteMetadata>): void {
    const existingMetadata = Reflect.getMetadata(METADATA_KEY.route, target);
    currentMetadata = {
      ...existingMetadata,
      ...currentMetadata
    };
    Reflect.defineMetadata(METADATA_KEY.route, currentMetadata, target);

    const previousMetadata: RouteMetadata[] = RouteReflector.getRoutesMetadata();

    const newMetadata = [currentMetadata, ...previousMetadata.filter(x => x !== existingMetadata)];

    Reflect.defineMetadata(METADATA_KEY.route, newMetadata, Reflect);
  }

  public static addRouteParameterMetadata(constructor: any, metadata: ParameterMetadata): void {
    let parameterMetadataList: ParameterMetadata[] = [];
    if (Reflect.hasMetadata(METADATA_KEY.parameter, constructor)) {
      parameterMetadataList = Reflect.getMetadata(METADATA_KEY.parameter, constructor);
    }
    parameterMetadataList.unshift(metadata);
    Reflect.defineMetadata(METADATA_KEY.parameter, parameterMetadataList, constructor);
  }

  public static setMiddlewareMeta(constructor: any, metadata: MiddlewareMetadata): void {
    Reflect.defineMetadata(METADATA_KEY.middleware, metadata, constructor);

    const previousMetadata: MiddlewareMetadata[] = RouteReflector.getMiddlewaresMetadata();
    const newMetadata = [metadata, ...previousMetadata];
    Reflect.defineMetadata(METADATA_KEY.middleware, newMetadata, Reflect);
  }

  public static getMiddlewareMeta(constructor: any): MiddlewareMetadata {
    return Reflect.getMetadata(METADATA_KEY.middleware, constructor);
  }

  public static getMiddlewaresFromMetadata(): any[] {
    return RouteReflector.getRoutesMetadata().map((metadata) => metadata.target);
  }

  public static getRoutesMetadata(): RouteMetadata[] {
    return Reflect.getMetadata(METADATA_KEY.route, Reflect) || [];
  }

  public static getMiddlewaresMetadata(): MiddlewareMetadata[] {
    return Reflect.getMetadata(METADATA_KEY.middleware, Reflect) || [];
  }
}
