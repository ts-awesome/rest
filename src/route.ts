import {IHttpRequest, IHttpResponse, IRoute} from './interfaces';
import {inject, injectable} from 'inversify';
import {RequestSymbol, ResponseSymbol, SanitizerSymbol} from './symbols';
import {Sanitizer} from './sanitizer';
import {BadRequestError, RequestError} from './errors';
import {StatusCode} from './status-code';
import {createHash} from 'crypto';
import {Readable} from 'stream';

interface ISimpleValidator<T> {
  validate(value: T): true | string[];
}

interface IValidatorWithOptions<T, X> {
  validate(value: T, options?: X & {restrictExtraFields?: boolean}): true | string[];
}

type IValidator<T> = ISimpleValidator<T> | IValidatorWithOptions<T, any>;

function etag(uid: string, lastModified: Date, version= 0) {
  return JSON.stringify(new Buffer(`${uid}-${version}-${lastModified.getTime()}`).toString('base64'));
}

function sha256(data: string | Buffer): string {
  return createHash('sha-256').update(data).digest().toString('hex');
}

function etagList(list: {uid: string; lastModified: Date; version?: number}[]): string {
  let lastModified = new Date();
  let uid = '';
  for(const item of list) {
    lastModified = lastModified > item.lastModified ? lastModified : item.lastModified;
    uid += `,${etag(item.uid, item.lastModified, item.version ?? 0)}`
  }

  return etag(sha256(uid), lastModified, list.length);
}

@injectable()
export abstract class Route implements IRoute {

  @inject(RequestSymbol)
  protected readonly request!: IHttpRequest;

  @inject(ResponseSymbol)
  protected readonly response!: IHttpResponse;

  // noinspection JSUnusedGlobalSymbols
  protected redirect(url: string, statusCode: number = StatusCode.TemporaryRedirect): void {
    this.ensureCacheControl();
    this.response.redirect(statusCode, url);
  }

  // noinspection JSUnusedGlobalSymbols
  protected empty(statusCode: number = StatusCode.NoContent): void {
    this.ensureCacheControl();
    this.response
      .status(statusCode)
      .end();
  }

  protected json<TResponse>(
    content: TResponse,
    statusCode: StatusCode | number = StatusCode.OK,
    sanitizers?: (string | Sanitizer<unknown, unknown>)[]
  ): void {
    this.ensureCacheControl();
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
    statusCode: StatusCode | number = StatusCode.OK,
  ): void {
    this.ensureCacheControl();
    this.ensureRequestMedia('text/plain');
    this.setHeader('Date', new Date().toUTCString());

    this.response
      .status(statusCode ?? 200)
      .type('text')
      .send(content)
      .end();
  }

  // noinspection JSUnusedGlobalSymbols
  protected stream<TResponse extends Readable>(
    content: TResponse,
    size?: number,
    contentType = 'application/octet-stream',
    statusCode: StatusCode | number = StatusCode.OK,
  ): Promise<void> {
    this.ensureCacheControl();
    this.ensureRequestMedia(contentType);
    if (size != null) {
      this.setHeader('Content-Length', size.toString());
    }

    this.setHeader('Date', new Date().toUTCString());

    this.response
      .status(statusCode ?? 200)
      .type(contentType)

    return new Promise((resolve, reject) => {
      content
        .pipe(this.response)
        .once('finish', resolve)
        .on('error', reject);
    })
  }

  // noinspection JSUnusedGlobalSymbols
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

  // noinspection JSUnusedGlobalSymbols
  protected ensureRequestMedia(expected: string): void {
    const { accept } = this.request.headers;
    if (typeof accept !== 'string' || accept.indexOf('*/*') >= 0) {
      return;
    }

    if (accept.split(',').every(value => !value.trim().startsWith(expected))) {
      throw new RequestError(
        `Requested content-type is not supported. Default is ${expected}`,
        '',
        StatusCode.NotAcceptable);
    }
  }

  // noinspection JSUnusedGlobalSymbols
  protected ensureCacheControl() {
    if (!this.response.headersSent) {
      const cacheControl = this.response.cacheControl;
      this.setHeader('Cache-Control', `${cacheControl?.type ?? 'no-cache'}, max-age=${cacheControl?.maxAge ?? 0}`)
    }
  }

  // noinspection JSUnusedGlobalSymbols
  protected setHeader(name: string, value: string): this {
    this.response.set(name, value);
    return this;
  }

  // noinspection JSUnusedGlobalSymbols
  protected isNewerContent(etag: string, lastModified?: Date): boolean {
    const ifNoneMatch = this.request.header('If-None-Match');
    if (typeof ifNoneMatch === 'string') {
      etag = etag.endsWith('"') ? etag : JSON.stringify(etag);
      return ifNoneMatch.replace('W/', '') !== etag.replace('W/', '');
    }

    const ifModifiedSince = this.request.header('If-Modified-Since');
    if (ifModifiedSince) {
      const ts = new Date(ifModifiedSince).getTime();
      return isNaN(ts) || ts > (lastModified?.getTime() ?? 0);
    }

    return true;
  }

  // noinspection JSUnusedGlobalSymbols
  protected isNewerModel(uid: string, lastModified: Date, version = 0) {
    return this.isNewerContent(etag(uid, lastModified, version), lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected isNewerList(list: {uid: string; lastModified: Date; version?: number}[]) {
    let lastModified = new Date();
    for(const item of list) {
      lastModified = lastModified > item.lastModified ? lastModified : item.lastModified;
    }

    const etag = etagList(list);
    return this.isNewerContent(etag, lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected ensureETag(uid: string, lastModified: Date, version = 0) {
    if (!this.isNewerModel(uid, lastModified, version)) {
      throw new RequestError(`Newer content found on server`, 'Precondition Failed', StatusCode.PreconditionFailed);
    }
  }

  // noinspection JSUnusedGlobalSymbols
  /**
   * @deprecated please use setModelETag()
   */
  protected setETag(uid: string, lastModified: Date, version = 0) {
    this.setModelETag(uid, lastModified, version);
  }

  // noinspection JSUnusedGlobalSymbols
  protected setModelETag(uid: string, lastModified: Date, version = 0) {
    this.setContentETag(etag(uid, lastModified, version), lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected setListETag(list: {uid: string; lastModified: Date; version?: number}[]) {
    let lastModified = new Date();
    for(const item of list) {
      lastModified = lastModified > item.lastModified ? lastModified : item.lastModified;
    }

    this.setContentETag(etagList(list), lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected setContentETag(etag: string, lastModified?: Date) {
    this.setHeader('ETag', etag.endsWith('"') ? etag : JSON.stringify(etag));
    if (lastModified) {
      this.setHeader('Last-Modified', lastModified.toString());
    }
  }

  // noinspection JSUnusedGlobalSymbols
  protected validate<T>(validator: IValidator<T>, value: T, message?: string): void;
  protected validate<T, X>(validator: IValidatorWithOptions<T, X>, value: T, message?: string, options?: X): void;
  protected validate<T>(validator: IValidator<T>, value: T[], message?: string): void;
  protected validate<T, X>(validator: IValidatorWithOptions<T, X>, value: T[], message?: string, options?: X): void;
  protected validate<T>(validator: IValidator<any>, value: any, message?: string, options: any = {}): void {
    if (Array.isArray(value)) {
      value.forEach(v => {
        this.validate(validator, v);
      })
    }

    let restrictExtraFields = true;
    if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'raw')) {
      value = value.raw;
      restrictExtraFields = false;
    }

    const isValid = validator.validate(value, {restrictExtraFields, ...options});
    if (isValid !== true) {
      throw new BadRequestError((message ?? 'Bad request')  + '\n' + isValid.join('\n'));
    }
  }

  public abstract handle(...args: any[]): Promise<void>;
}
