import {IHttpRequest, IHttpResponse, IRoute} from "./interfaces";
import {inject, injectable} from "inversify";
import Symbols from './symbols';
import { Sanitizer } from "./sanitizer";

type ElementType<T> = T extends any[] ? T[number] : T;

@injectable()
export abstract class Route implements IRoute {

  @inject(Symbols.Request)
  protected readonly request: IHttpRequest;

  @inject(Symbols.Response)
  protected readonly response: IHttpResponse;

  //TODO add protected redirect method

  protected empty(statusCode: number = 200): void {
    this.response.status(statusCode).end();
  }

  protected sanitize<T, X = T>(objs: T[], sanitizers?: (string|Sanitizer<T, any>)[]): X[] {
    const container = this.request.container;
    return (!sanitizers 
      ? container.getAll<Sanitizer<T, any>>(Symbols.Sanitizer)
      : sanitizers.map(s =>
          typeof(s) === 'string'
            ? container.getNamed<Sanitizer<T, any>>(Symbols.Sanitizer, s)
            : s
        )
      )
      .reduce((list, sanitizer) => list.map(x => sanitizer(x)), objs.map(x => ({...x})));
  }

  protected json<TResponse>(
    content: TResponse,
    statusCode: number = 200,
    sanitizers?: (string|Sanitizer<ElementType<TResponse>, any>)[]
  ): void {
    const res = this.sanitize(Array.isArray(content) ? content : [content] , sanitizers);
    this.response.status(statusCode || 200).json(Array.isArray(content) ? res : res[0]).end();
  }

  protected setHeader(name: string, value: string): void {
    this.response.setHeader(name, value);
  }

  abstract handle(...args: any[]): Promise<void>;
}
