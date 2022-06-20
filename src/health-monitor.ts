import {ILogger} from "@ts-awesome/logger";
import {HealthCheckStatus, HealthStatus, IManagedResource, IHealthChecker, IServer} from "./interfaces";

export class HealthMonitor implements IHealthChecker, IServer {
  private examinations: (IHealthChecker | IManagedResource)[] = [];

  public constructor(
    private readonly logger: ILogger = console,
    public readonly title = HealthMonitor.name,
  ) {
  }

  public register(...examinations: (IHealthChecker | IManagedResource)[]): void {
    this.examinations.push(...examinations);
  }

  public async start(): Promise<void> {
    this.logger.info(`${this.title} starting...`);
    const promises: Promise<void>[] = []
    for (const examination of this.examinations) {
      if ('start' in examination) {
        this.logger.log(`${examination.title} starting...`);
        promises.push(examination
          .start()
          .catch(e => {
            this.logger.error(`${examination.title} start failed: ${e}`);
          })
        );
      }
    }

    if (promises.length === 0) {
      return;
    }

    await Promise.allSettled(promises);
  }

  public async stop(): Promise<void> {
    this.logger.info(`${this.title} stopping...`);
    const promises: Promise<void>[] = []
    for (const examination of this.examinations) {
      if ('stop' in examination) {
        this.logger.log(`${examination.title} stopping...`);
        promises.push(examination
          .stop()
          .catch(e => {
            this.logger.error(`${examination.title} end failed: ${e}`);
          })
        );
      }
    }

    if (promises.length === 0) {
      return;
    }

    await Promise.allSettled(promises);
  }

  public async healthy(): Promise<HealthStatus> {
    if (this.examinations.length === 0) {
      return {healthy: true, checks: []};
    }

    this.logger.debug(`${this.title} health check...`);

    const promises: Promise<boolean | HealthStatus>[] = []
    const titles: string[] = [];
    for (const examination of this.examinations) {
      titles.push(examination.title);
      promises.push(examination
        .healthy()
        .catch(() => false)
      );
    }

    const statuses = await Promise.all(promises);
    const healthy = statuses.every(x => typeof x === 'boolean' ? x : x.healthy);
    this.logger.debug(`${this.title} is ${healthy ? 'UP' : 'DOWN'}`);

    const checks = unpackHealthChecks(statuses, titles);
    return {
      healthy,
      checks,
    };
  }
}

function unpackHealthChecks(statuses: readonly (boolean | HealthStatus)[], titles: readonly string[] ): readonly HealthCheckStatus[] {
  const result: HealthCheckStatus[] = [];
  let index = 0;
  while(index < statuses.length) {
    const healthy = statuses[index];
    index++;

    if (typeof healthy === 'boolean') {
      result.push({
        title: titles[index],
        healthy,
      })
    } else {
      result.push(...healthy.checks);
    }
  }
  return result;
}
