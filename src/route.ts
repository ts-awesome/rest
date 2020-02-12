import {IHttpRequest, IHttpResponse, IRoute} from './interfaces';
import {inject, injectable} from 'inversify';
import {RequestSymbol, ResponseSymbol, SanitizerSymbol} from './symbols';
import {Sanitizer} from './sanitizer';
import {RequestError} from './errors';
import {StatusCode} from './status-code';

@injectable()
export abstract class Route implements IRoute {

  @inject(RequestSymbol)
  protected readonly request!: IHttpRequest;

  @inject(ResponseSymbol)
  protected readonly response!: IHttpResponse;

  //TODO add protected redirect method

  protected empty(statusCode: number = StatusCode.NoContent): void {
    this.response
      .status(statusCode)
      .end();
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

    const sanitizer: Sanitizer<T, unknown> = (x: unknown) => resolved.reduce((acc, op) => op(acc), x);

    return objs.map(sanitizer) as any;
  }

  protected json<TResponse>(
    content: TResponse,
    statusCode: number = 200,
    sanitizers?: (string | Sanitizer<unknown, unknown>)[]
  ): void {
    this.ensureRequestMedia('application/json');
    this.setHeader('Date', new Date().toUTCString());

    const res = this.sanitize(Array.isArray(content) ? content : [content] , sanitizers);

    this.response
      .status(statusCode ?? 200)
      .json(Array.isArray(content) ? res : res[0])
      .end();
  }

  protected text<TResponse extends string>(
    content: TResponse,
    statusCode: number = 200
  ): void {
    this.ensureRequestMedia('text/plain');
    this.setHeader('Date', new Date().toUTCString());

    this.response
      .status(statusCode ?? 200)
      .type('text')
      .send(content)
      .end();
  }

  protected ensureRequestMedia(expected: string): void {
    const { accept } = this.request.headers;
    if (typeof accept === 'string' && accept.split(',').every(value => !value.trim().startsWith(expected))) {
      throw new RequestError(
        `Requested content-type is not supported. Default is ${expected}`,
        '',
        StatusCode.NotAcceptable);
    }
  }

  protected setHeader(name: string, value: string): this {
    this.response.setHeader(name, value);
    return this;
  }

  protected ensureETag(uid: string, lastModified: Date, version: number = 0) {
    const value = this.request.header('If-Match');
    if (typeof value === 'string' && value !== etag(uid, lastModified, version)) {
      throw new RequestError(`Newer content found on server`, 'Precondition Failed', StatusCode.PreconditionFailed);
    }
  }

  protected setETag(uid: string, lastModified: Date, version: number = 0) {
    this.setHeader('ETag', etag(uid, lastModified, version));
  }

  public abstract handle(...args: any[]): Promise<void>;
}

function etag(uid: string, lastModified: Date, version: number = 0) {
  return JSON.stringify(new Buffer(`${uid}-${version}-${lastModified.getTime()}`).toString('base64'));
}
