import { buildApp } from "./api/app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    `Flowly server ${config.nodeEnv} listening on http://${config.host}:${config.port} (vault locked)`,
  );
} catch (error) {
  app.log.error(error, "failed to start Flowly server");
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
