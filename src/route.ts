import {IHttpRequest, IHttpResponse, IRoute} from './interfaces';
import {inject, injectable} from 'inversify';
import {RequestSymbol, ResponseSymbol, SanitizerSymbol} from './symbols';
import {Sanitizer} from './sanitizer';
import {BadRequestError, RequestError} from './errors';
import {StatusCode} from './status-code';
import {createHash} from 'crypto';
import {pipeline, Readable} from 'stream';
import read from '@ts-awesome/model-reader';
import {
  IProfilingSession,
  ProfilingSessionSymbol,
  serverTimingReporter
} from "@ts-awesome/profiler";

declare type Class = new (...args: any) => any;

interface ISimpleValidator<T> {
  validate(value: T): true | readonly string[];
}

interface IValidatorWithOptions<T, X> {
  validate(value: T, options?: X & {restrictExtraFields?: boolean}): true | readonly string[];
}

type IValidator<T> = ISimpleValidator<T> | IValidatorWithOptions<T, any>;

interface ETaggable {
  readonly uid: string;
  readonly lastModified: Date;
  readonly version?: number;
}

function etag(uid: string, lastModified: Date, version= 0) {
  return JSON.stringify(new Buffer(`${uid}-${version}-${lastModified.getTime()}`).toString('base64'));
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest().toString('hex');
}

function etagList(list: readonly ETaggable[] | Iterable<ETaggable>): [string, Date] {
  let lastModified = new Date(0);
  const uid: string[] = [];
  for(const item of list) {
    lastModified = lastModified > item.lastModified ? lastModified : item.lastModified;
    uid.push(`${etag(item.uid, item.lastModified, item.version ?? 0)}`);
  }

  return [etag(sha256(uid.join(',')), lastModified, uid.length), lastModified];
}

function isNumber(x: unknown): x is number {
  return typeof x === 'number';
}

// todo come up with better detector
function isES6Class(x: unknown): x is ((...args: any[]) => any) {
  return typeof x === 'function' && /^\s*class\s+/.test(x.toString());
}

@injectable()
export abstract class Route implements IRoute {

  @inject(RequestSymbol)
  protected readonly request!: IHttpRequest;

  @inject(ResponseSymbol)
  protected readonly response!: IHttpResponse;

  // noinspection JSUnusedGlobalSymbols
  protected redirect(url: string): Promise<void>;
  protected redirect(url: string, statusCode: number): Promise<void>;
  protected redirect(url: string, html: true): Promise<void>;
  protected redirect(url: string, javascript: string): Promise<void>;
  protected async redirect(url: string, statusCode: boolean | number | string = StatusCode.TemporaryRedirect): Promise<void> {
    this.ensureCacheControl();
    this.sendProfilingData();

    if (statusCode === true || typeof statusCode === 'string') {
      return this.profileResponse('redirect', async () => {
        this.response
          .status(StatusCode.OK)
          .send(`<!DOCTYPE html><html lang="en"><head>
<meta http-equiv="refresh" content="${statusCode === true ? 0 : 1}; URL=${url}" /><title>Redirecting...</title>
<script type="application/javascript">${typeof statusCode === 'string' ? statusCode : ''}</script>
</head><body><p>If you are not redirected, <a href="${url}">click here</a>.</p></body></html>`);
      });
    }

    if (typeof statusCode !== 'number') {
      throw new Error(`Unexpected status code ${JSON.stringify(statusCode)}`)
    }

    this.response.redirect(statusCode, url);
  }

  // noinspection JSUnusedGlobalSymbols
  protected async empty(statusCode: number = StatusCode.NoContent): Promise<void> {
    this.ensureCacheControl();
    this.sendProfilingData();

    this.response
      .status(statusCode)
      .send();
  }

  // noinspection JSUnusedGlobalSymbols
  protected jsonAsync(content: Promise<readonly unknown[]>, statusCode?: StatusCode): Promise<void>;
  protected jsonAsync(content: Promise<unknown>, statusCode?: StatusCode): Promise<void>;
  protected jsonAsync(content: Promise<readonly unknown[]>, Model: [Class]): Promise<void>;
  protected jsonAsync(content: Promise<unknown>, Model: Class): Promise<void>;
  protected jsonAsync(content: Promise<readonly unknown[]>, statusCode: StatusCode, Model: [Class]): Promise<void>;
  protected jsonAsync(content: Promise<unknown>, statusCode: StatusCode, Model: Class): Promise<void>;
  protected async jsonAsync(promise: Promise<any>, ...args: unknown[]): Promise<void> {
    return this.json(await promise, ...args as any);
  }

  // noinspection JSUnusedGlobalSymbols
  protected json(content: readonly unknown[], Model: [Class]): Promise<void>;
  protected json(content: unknown, Model: Class): Promise<void>;
  protected json(content: readonly unknown[], statusCode: StatusCode, Model: [Class]): Promise<void>;
  protected json(content: unknown, statusCode: StatusCode, Model: Class): Promise<void>;
  protected json(content: unknown, statusCode?: StatusCode): Promise<void>;
  /** @deprecated */
  protected json(content: unknown, sanitizers: (string | Sanitizer<unknown, unknown>)[]): Promise<void>;
  /** @deprecated */
  protected json(content: unknown, statusCode: StatusCode, sanitizers: (string | Sanitizer<unknown, unknown>)[]): Promise<void>;
  protected json(content: unknown, ...args: unknown[]): Promise<void> {
    if (content instanceof Promise) {
      throw new Error(`Please use jsonAsync() for async content`);
    }

    const statusCode = isNumber(args[0]) ? args.shift() as number : StatusCode.OK;

    this.ensureCacheControl();
    this.sendProfilingData();
    this.ensureRequestMedia('application/json');
    this.setHeader('Date', new Date().toUTCString());

    if (typeof content === 'string' || typeof content === 'number' || typeof content === 'boolean') {
      return this.profileResponse('json', async () => {
        this.response
          .status(statusCode)
          .json(content);
      });
    }

    let results = content;
    if (!Array.isArray(content) && isES6Class(args[0])) {
      results = read(content, args[0]);
    } else if (Array.isArray(content) && Array.isArray(args[0]) && args[0].length === 1 && isES6Class(args[0][0])) {
      results = read(content, [args[0][0]]);
    } else if (args.length > 1) {
      const [sanitizers] = args as any[];
      const res = this.sanitize(Array.isArray(content) ? content : [content], sanitizers);
      results = Array.isArray(content) ? res : res[0];
    }

    return this.profileResponse('json', async () => {
      this.response
        .status(statusCode)
        .json(results);
    })
  }

  // noinspection JSUnusedGlobalSymbols
  protected text<TResponse extends string>(
    content: TResponse,
    statusCode: StatusCode | number = StatusCode.OK,
  ): Promise<void> {
    this.ensureCacheControl();
    this.sendProfilingData();
    this.ensureRequestMedia('text/plain');
    this.setHeader('Date', new Date().toUTCString());

    return this.profileResponse('text',async () => {
      this.response
        .status(statusCode ?? 200)
        .type('text')
        .send(content)
    });
  }

  // noinspection JSUnusedGlobalSymbols
  protected stream<TResponse extends Readable>(
    content: TResponse,
    size?: number,
    contentType = 'application/octet-stream',
    statusCode: StatusCode | number = StatusCode.OK,
  ): Promise<void> {
    this.ensureCacheControl();
    this.sendProfilingData();
    this.ensureRequestMedia(contentType);
    if (size != null) {
      this.setHeader('Content-Length', size.toString());
    }

    this.setHeader('Date', new Date().toUTCString());

    this.response
      .status(statusCode ?? 200)
      .type(contentType)

    return this.profileResponse('stream', () => new Promise<void>((resolve, reject) => {
      pipeline(
        content,
        this.response,
        (e) => e != null ? reject(e) : resolve(),
      );
    }));
  }

  private async profileResponse<T>(kind: string, action: (() => Promise<T> | void)): Promise<T | void> {
    if (!this.request.container?.isBound(ProfilingSessionSymbol)) {
      return action();
    }

    const profilingSession = this.request.container.get<IProfilingSession>(ProfilingSessionSymbol);
    return profilingSession.auto(kind, 'response', async () => action())
  }

  // noinspection JSUnusedGlobalSymbols
  protected sanitize<T, X = unknown>(objs: T[], sanitizers?: (string|symbol|Sanitizer<T, unknown>)[]): X[] {
    const { container } = this.request;
    if (container?.isBound(SanitizerSymbol)) {
      sanitizers = sanitizers ?? container.getAll<Sanitizer<T, any>>(SanitizerSymbol);
    }

    if (!Array.isArray(sanitizers)) {
      return objs as any;
    }

    const resolved: Sanitizer<unknown, unknown>[] = sanitizers
      .map(s => typeof s === 'function'
        ? s as Sanitizer<unknown, unknown>
        : container?.getNamed<Sanitizer<unknown, unknown>>(SanitizerSymbol, s) ?? (x => x));

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
  protected getRequestMediaPriority(contentType: string): number | null {
    const { accept } = this.request.headers;
    if (typeof accept !== 'string' || accept.trim() === '*/*') {
      return 0;
    }

    const priority = accept.split(',').findIndex(value => isMatchingRequestMedia(value.trim(), contentType));
    return priority >= 0 ? priority : null;
  }

  // noinspection JSUnusedGlobalSymbols
  protected getPreferredRequestMedia(...contentTypes: string[]): string | null {
    return contentTypes
      .map(value => ({value, priority: this.getRequestMediaPriority(value)}))
      .filter(({priority}) => priority != null)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .shift()?.value ?? null;
  }

  // noinspection JSUnusedGlobalSymbols
  protected ensureCacheControl(): void {
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
  protected isNewerModel(uid: string, lastModified: Date, version = 0): boolean {
    return this.isNewerContent(etag(uid, lastModified, version), lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected isNewerList(list: readonly ETaggable[] | Iterable<ETaggable>): boolean {
    const [etag, lastModified] = etagList(list);
    return this.isNewerContent(etag, lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected ensureETag(uid: string, lastModified: Date, version = 0): void {
    if (!this.isNewerModel(uid, lastModified, version)) {
      throw new RequestError(`Newer content found on server`, 'Precondition Failed', StatusCode.PreconditionFailed);
    }
  }

  // noinspection JSUnusedGlobalSymbols
  /**
   * @deprecated please use setModelETag()
   */
  protected setETag(uid: string, lastModified: Date, version = 0): void {
    this.setModelETag(uid, lastModified, version);
  }

  // noinspection JSUnusedGlobalSymbols
  protected setModelETag(uid: string, lastModified: Date, version = 0): void {
    this.setContentETag(etag(uid, lastModified, version), lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected setListETag(list: readonly ETaggable[] | Iterable<ETaggable>): void {
    const [etag, lastModified] = etagList(list);
    this.setContentETag(etag, lastModified);
  }

  // noinspection JSUnusedGlobalSymbols
  protected setContentETag(etag: string, lastModified?: Date): void {
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
  protected validate(validator: IValidator<any>, value: unknown, message?: string, options: any = {}): void {
    if (Array.isArray(value)) {
      value.forEach(v => {
        this.validate(validator, v);
      })
    }

    let restrictExtraFields = true;
    if (typeof value === 'object' && value != null && hasOwnProperty(value, 'raw')) {
      value = value.raw;
      restrictExtraFields = false;
    }

    const isValid = validator.validate(value, {restrictExtraFields, ...options});
    if (isValid !== true) {
      throw new BadRequestError((message ?? 'Bad request')  + '\n' + isValid.join('\n'));
    }
  }

  private sendProfilingData() {
    if (this.request.container?.isBound(ProfilingSessionSymbol)) {
      const profilingSession = this.request.container.get<IProfilingSession>(ProfilingSessionSymbol);
      if (profilingSession.logs.length > 0 && !this.response.headersSent) {
        this.setHeader('Server-Timing', serverTimingReporter(profilingSession.logs).join(','));
      }
    }
  }

  public abstract handle(...args: any[]): Promise<void>;
}

function hasOwnProperty<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function isMatchingRequestMedia(expected: string, actual: string): boolean {
  if (expected === '*/*') {
    return true;
  }

  if (expected.endsWith('*')) {
    return actual.startsWith(expected.substring(0, expected.length - 1));
  }

  return actual === expected;
}
