import {Server} from "http";
import express, {Application, RequestHandler} from "express";
import {Container} from "inversify";
import {ILogger, ILoggerFactory, LoggerFactorySymbol} from "@ts-awesome/logger";

import {IoCSetup} from "./server";
import {HealthMonitor} from "./health-monitor";
import {HealthStatus, IHealthChecker, IServer} from "./interfaces";
import {HealthExaminationSymbol} from "./symbols";

function healthCheck(check: () => boolean | Promise<boolean> | Promise<HealthStatus>): RequestHandler {
  return async (req, res): Promise<void> => {
    const status = await check();
    if (typeof status === "boolean") {
      res
        .status(status ? 200 : 500)
        .json({
          status: status ? 'UP' : 'DOWN',
          checks: []
        })
        .end();
    } else {
      const {healthy, checks} = status
      res
        .status(healthy ? 200 : 500)
        .json({
          status: healthy ? 'UP' : 'DOWN',
          checks: checks.map(({title, healthy}) => ({title, status: healthy ? 'UP' : 'DOWN'})),
        })
        .end();
    }
  }
}

// noinspection JSUnusedGlobalSymbols
export abstract class BaseApplicationServer implements IServer {

  private _app: Application = express();

  protected readonly resourceManager: HealthMonitor;
  protected readonly container = new Container();
  protected live = false;
  protected ready = false;
  protected server?: Server;

  protected readonly logger: ILogger = console;

  /**
   * prepare your express app
   * @param app
   * @protected
   */
  protected abstract configure(app: Application): void;

  /**
   * make sure app is ready for requests
   * @protected
   */
  protected async startup(): Promise<void> {
    await this.resourceManager.start();
    this.ready = true;
    this.logger.info('Ready to serve');
  }

  /**
   * clean up before app goes down
   * @protected
   */
  protected async cleanup(): Promise<void> {
    await this.resourceManager.stop();
  }

  /**
   * check if app is still alive and ready for requests
   * @protected
   */
  protected async heartbeat(): Promise<HealthStatus> {
    if (!this.live) {
      return {healthy: false, checks: []};
    }

    return await this.resourceManager.healthy();
  }

  protected constructor(
    protected readonly containerConfigurator: IoCSetup,
    protected readonly port: number = 3000,
    protected readonly hostname: string = '0.0.0.0',
  ) {
    this.container.load(...containerConfigurator());

    const self = Object.getPrototypeOf(this)?.constructor?.name ?? BaseApplicationServer.name;
    if (this.container.isBound(LoggerFactorySymbol)) {
      const loggerFactory = this.container.get<ILoggerFactory>(LoggerFactorySymbol);
      this.logger = loggerFactory(self);
    }

    this.resourceManager = new HealthMonitor(this.logger, 'Server');
    this.resourceManager.register(
      ...this.container.getAll<IHealthChecker>(HealthExaminationSymbol)
    )

    setImmediate(() => {
      this.logger.debug('Configuring server');

      this._app.disable('x-powered-by');

      this._app.get('/health/ready', healthCheck(() => this.ready));
      this._app.get('/health/live', healthCheck(() => this.heartbeat()));

      this._app.all('/', (req, res, next) => {
        if (!this.ready) {
          return res.status(503).send('Server is not ready yet').end();
        }

        next();
      })

      this.configure(this._app);
    });
  }

  public async start(): Promise<void> {
    this.live = true;

    await new Promise<void>((done, reject) => {
      setImmediate(() => {
        try {
          this.server = this._app
            .listen(this.port, this.hostname, () => {
              let address = this.server?.address() ?? `${this.hostname}:${this.port}`;
              address = typeof address === 'string' ? address : `${address.family} ${address.address}:${address.port}`
              this.logger.info(`Server is listening ${address}`);
              done();
            });
        } catch (e) {
          reject(e);
        }
      });
    });

    try {
      await this.startup();
    } catch (e) {
      this.logger.error(e as never);

      await this.stop();
    }
  }

  public async stop(): Promise<void> {
    this.live = false;
    this.ready = false;

    try {
      await this.cleanup();
    } catch (e) {
      this.logger.error(e as never);
    }

    await new Promise<void>((res, rej) => {
      this.server?.close(err => err ? rej(err) : res());
      this.server = undefined;
    });

    this.logger.info('Bye');
  }
}

