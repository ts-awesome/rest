import {IHttpRequest, IHttpResponse, IRoute} from "./interfaces";
import {inject, injectable} from "inversify";
import {RequestSymbol, ResponseSymbol, SanitizerSymbol} from './symbols';
import { Sanitizer } from "./sanitizer";

@injectable()
export abstract class Route implements IRoute {

  @inject(RequestSymbol)
  protected readonly request!: IHttpRequest;

  @inject(ResponseSymbol)
  protected readonly response!: IHttpResponse;

  //TODO add protected redirect method

  protected empty(statusCode: number = 200): void {
    this.response.status(statusCode).end();
  }

  protected sanitize<T, X = unknown>(objs: T[], sanitizers?: (string|symbol|Sanitizer<T, unknown>)[]): X[] {
    const container = this.request.container;
    if (container.isBound(SanitizerSymbol)) {
      sanitizers = sanitizers ?? container.getAll<Sanitizer<T, any>>(SanitizerSymbol);
    }

    if (!Array.isArray(sanitizers)) {
      return objs as any;
    }

    const resolved: Sanitizer<unknown, unknown>[] = sanitizers
      .map(s => typeof s === 'function'
        ? s as Sanitizer<unknown, unknown>
        : container.getNamed<Sanitizer<unknown, unknown>>(SanitizerSymbol, s));

    const sanitizer: Sanitizer<T, unknown> = (x: unknown) => {
      return resolved.reduce((acc, op) => op(acc), x);
    };

    return objs.map(sanitizer) as any;
  }

  protected json<TResponse>(
    content: TResponse,
    statusCode: number = 200,
    sanitizers?: (string | Sanitizer<unknown, unknown>)[]
  ): void {
    const res = this.sanitize(Array.isArray(content) ? content : [content] , sanitizers);
    this.response.status(statusCode || 200).json(Array.isArray(content) ? res : res[0]).end();
  }

  protected setHeader(name: string, value: string): this {
    this.response.setHeader(name, value);
    return this;
  }

  abstract handle(...args: any[]): Promise<void>;
}
