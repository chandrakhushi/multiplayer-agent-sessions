/**
 * Create WeTTY server
 * @module WeTTy
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Gauge, collectDefaultMetrics } from 'prom-client';
import { observeGC } from './server/metrics.js';
import { createBroker } from './server/session-broker.js';
import { server } from './server/socketServer.js';
import {
  sshDefault,
  serverDefault,
  forceSSHDefault,
  defaultCommand,
} from './shared/defaults.js';
import { logger as getLogger } from './shared/logger.js';
import type { SSH, SSL, Server } from './shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';

export * from './shared/interfaces.js';
export { logger as getLogger } from './shared/logger.js';

const wettyConnections = new Gauge({
  name: 'wetty_connections',
  help: 'number of active socket connections to wetty',
});

/**
 * Starts WeTTy Server
 * @name startServer
 * @returns Promise that resolves SocketIO server
 */
export const start = (
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  command: string = defaultCommand,
  forcessh: boolean = forceSSHDefault,
  ssl?: SSL,
): Promise<SocketIO.Server> =>
  decorateServerWithSsh(express(), ssh, serverConf, command, forcessh, ssl);

export async function decorateServerWithSsh(
  app: Express,
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  // unused since the broker replaced getCommand+spawn; kept for API compat
  _command: string = defaultCommand,
  _forcessh: boolean = forceSSHDefault,
  ssl?: SSL,
): Promise<SocketIO.Server> {
  const logger = getLogger();
  if (ssh.key) {
    logger.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
! Password-less auth enabled using private key from ${ssh.key}.
! This is dangerous, anything that reaches the wetty server
! will be able to run remote operations without authentication.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
  }

  collectDefaultMetrics();
  observeGC();

  const io = await server(app, serverConf, ssl);
  // build/server.js -> build/agent/agent-stub.js
  const attach = createBroker(
    resolve(dirname(fileURLToPath(import.meta.url)), 'agent', 'agent-stub.js'),
  );
  /**
   * Wetty server connected too
   * @fires WeTTy#connnection
   */
  io.on('connection', (socket: SocketIO.Socket) => {
    /**
     * @event wetty#connection
     * @name connection
     */
    logger.info('Connection accepted.');
    wettyConnections.inc();

    socket.on('disconnect', () => {
      wettyConnections.dec();
    });
    attach(socket);
  });
  return io;
}
