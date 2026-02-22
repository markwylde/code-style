import http from "node:http";
import type { Socket } from "node:net";
import { createContext } from "./createContext.ts";
import { routes } from "./routes.ts";
import type { Config, Context } from "./types.ts";
import { createRouter } from "./utils/createRouter.ts";
import { waitForHealth } from "./utils/waitForHealth.ts";

export type AppServer = {
  context: Context;
  servers: {
    api: http.Server;
  };
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
};

export function createServer(config: Config): AppServer {
  const context = createContext(config);
  const apiServer = http.createServer((request, response) => {
    createRouter(context, routes, request, response);
  });

  const sockets = new Set<Socket>();

  const bindSocketTracking = () => {
    apiServer.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => {
        sockets.delete(socket);
      });
    });
  };

  bindSocketTracking();

  const app: AppServer = {
    context,
    servers: {
      api: apiServer,
    },
    start: async () => {
      context.lifecycle.alive = true;

      await new Promise<void>((resolve, reject) => {
        apiServer.once("error", reject);
        apiServer.listen(config.todoApiPort, () => {
          apiServer.off("error", reject);
          resolve();
        });
      });

      await waitForHealth(config);
    },
    stop: async () => {
      context.lifecycle.alive = false;

      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();

      await new Promise<void>((resolve, reject) => {
        apiServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      await context.destroy();
    },
    restart: async () => {
      await app.stop();
      await app.start();
    },
  };

  return app;
}

export default createServer;
