#!/usr/bin/env node
/**
 * Exports Caddy's local root certificate and prints how to trust it, so the
 * browser stops warning about the connection to Flowly.
 *
 * The certificate lives in the Caddy data volume, which the Compose stack bind
 * mounts into `data/caddy` — no Docker daemon is needed to read it.
 *
 *   node tooling/scripts/local-ca.mjs            export and print the commands
 *   node tooling/scripts/local-ca.mjs --apply    also run the trust command
 *
 * `--apply` needs sudo, because it writes to the system trust store. Prefer not
 * to touch the system store at all? Put Tailscale in front of the stack instead
 * (docs/DEPLOYMENT.md): it terminates TLS with a real certificate, so there is
 * nothing to trust.
 */
import { copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(
  root,
  "data",
  "caddy",
  "data",
  "caddy",
  "pki",
  "authorities",
  "local",
  "root.crt",
);
const exported = join(root, "data", "flowly-local-ca.crt");
const apply = process.argv.includes("--apply");

if (!existsSync(source)) {
  console.error(
    `Caddy's root certificate is not there yet: ${source}\n` +
      "Start the stack once (docker compose up -d) so Caddy creates its local CA.",
  );
  process.exit(1);
}

copyFileSync(source, exported);
console.log(`Root certificate exported to ${exported}\n`);

const commands = {
  darwin: [
    "sudo",
    "security",
    "add-trusted-cert",
    "-d",
    "-r",
    "trustRoot",
    "-k",
    "/Library/Keychains/System.keychain",
    exported,
  ],
  linux: [
    "sudo",
    "sh",
    "-c",
    `cp "${exported}" /usr/local/share/ca-certificates/flowly-local-ca.crt && update-ca-certificates`,
  ],
};

const command = commands[process.platform];
if (!command) {
  console.log(
    "Trust this certificate in the operating system or browser you use, then reload Flowly.\n" +
      "On Windows: certutil -addstore -user Root data\\flowly-local-ca.crt\n" +
      "In a browser: import the certificate as a trusted root authority.",
  );
  process.exit(0);
}

const printable = command
  .map((part) => (/^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
  .join(" ");
console.log(`Trust it (this asks for your password):\n\n  ${printable}\n`);
console.log(
  "Every desktop that opens Flowly needs the same trust: the system store, or the browser's.\n" +
    "To avoid trusting anything at all, put Tailscale in front of the stack:\n" +
    "  deploy on 127.0.0.1 and run `tailscale serve` — see docs/DEPLOYMENT.md.\n",
);

if (!apply) {
  console.log("Run this script with --apply to execute the command above.");
  process.exit(0);
}

execFileSync(command[0], command.slice(1), { stdio: "inherit" });
console.log("\nDone. Reload Flowly: the certificate warning is gone.");
