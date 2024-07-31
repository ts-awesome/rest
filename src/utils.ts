import {IServer} from "./interfaces";

// noinspection JSUnusedGlobalSymbols
export function startDevServer(server: IServer): void {
  server
    .start()
    .catch(panic);

  let force = false;

  const handler = (): void => {
    if (force) {
      process.exit(1);
      return;
    }

    server
      .stop()
      .catch(panic);

    force = true;
  }

  // Ctrl+c or kill $pid
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)

  process.on('unhandledRejection', panic)
}

// noinspection JSUnusedGlobalSymbols
export function startPm2Server(server: IServer): void {
  server
    .start()
    .catch(panic)

  const stop = () => { server.stop().catch(panic) };

  // Ctrl+c or kill $pid
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  // PM2 sends IPC message for graceful shutdown
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      stop()
    }
  })

  process.on('unhandledRejection', (err) => {
    // eslint-disable-next-line no-console
    console.error('unhandledRejection', err);
  })
}

function panic(err) {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
