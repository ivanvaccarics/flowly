import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "../config.js";

/**
 * Serves the built React app from the same origin as the API.
 *
 * The browser never talks to a second host and nothing financial is stored
 * client-side. When the bundle is absent (development, where Vite serves it)
 * the API simply keeps answering on its own.
 */
export function registerStaticApp(app: FastifyInstance, config: ServerConfig): boolean {
  const root = resolve(config.webDir);
  if (!existsSync(resolve(root, "index.html"))) {
    app.log.info({ root }, "no built web bundle found; serving the API only");
    return false;
  }

  void app.register(fastifyStatic, {
    root,
    index: ["index.html"],
    cacheControl: true,
    maxAge: "1h",
    immutable: false,
    // Hashed assets can be cached, but the shell must never be: otherwise a
    // rebuilt image keeps serving yesterday's bundle from the browser cache.
    setHeaders: (reply, path) => {
      if (path.endsWith("index.html")) reply.header("cache-control", "no-cache");
    },
  });
  return true;
}
