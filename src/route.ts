import {IHttpRequest, IHttpResponse, IRoute} from "./interfaces";
import {inject, injectable} from "inversify";
import Symbols from './symbols';

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

  protected json<TResponse>(content: TResponse, statusCode: number = 200): void {
    this.response.status(statusCode).json(content).end();
  }

  protected setHeader(name: string, value: string): void {
    this.response.setHeader(name, value);
  }

  abstract handle(...args: any[]): Promise<void>;
}
