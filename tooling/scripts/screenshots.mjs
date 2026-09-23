#!/usr/bin/env node
/**
 * Captures the README screenshots from a running Flowly server.
 *
 *   node tooling/scripts/screenshots.mjs [baseUrl] [--chrome=/path/to/chrome]
 *
 * It expects a scratch vault seeded with `tooling/scripts/seed-demo.mjs` and
 * unlocked with FLOWLY_DEMO_PASSPHRASE (the same passphrase the seed printed).
 * The passphrase is only typed into a throwaway vault: the images always come
 * from synthetic data.
 *
 * The script drives headless Chrome over the DevTools protocol — nothing but
 * Node's own WebSocket is used — and writes one 1440x900 PNG per section into
 * docs/images/.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const baseUrl = args.find((argument) => argument.startsWith("http")) ?? "http://127.0.0.1:8787";
const chromeArgument = args.find((argument) => argument.startsWith("--chrome="));
const passphrase = process.env.FLOWLY_DEMO_PASSPHRASE ?? "flowly demo passphrase 2026";
const port = Number(process.env.FLOWLY_SCREENSHOT_PORT ?? 9333);
/** Viewport height; the dashboard is a long page, so the default is tall. */
const height = Number(process.env.FLOWLY_SCREENSHOT_HEIGHT ?? 1400);

const here = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(here, "..", "..", "docs", "images");

/** The sections the README shows, in the order they are captured. */
const SECTIONS = [
  {
    file: "dashboard.png",
    nav: "Dashboard",
    title: "Financial overview",
    // The dashboard opens on the current month; the screenshot shows a trend.
    prepare: "3 months",
    // The dashboard opens with its metric cards rather than a section banner.
    ready: ".kpi-row",
    // Taller than the rest: the metric row, three card rows and the backup
    // strip all belong in one picture of the page.
    height: 2300,
  },
  { file: "accounts.png", nav: "Accounts", title: "Accounts & resources" },
  { file: "transactions.png", nav: "Transactions", title: "Transactions" },
  // The tag directory is a workbench of its own, not a banner and an intro.
  { file: "tags.png", nav: "Tags", title: "Tags", ready: ".tag-workbench" },
  { file: "rules.png", nav: "Rules", title: "Tagging & automation" },
  { file: "settings.png", nav: "Settings", title: "Settings & vault data" },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChrome() {
  const candidates = [
    chromeArgument?.slice("--chrome=".length),
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) {
    throw new Error(
      "no Chrome or Chromium binary found; pass --chrome=/path/to/chrome or set CHROME_PATH",
    );
  }
  return found;
}

/** A minimal DevTools-protocol client over Node's built-in WebSocket. */
class Devtools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const thrown = result.exceptionDetails.exception?.description ?? "evaluation failed";
      throw new Error(thrown);
    }
    return result.result?.value;
  }

  async waitFor(expression, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this.evaluate(expression)) return;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${expression}`);
      await delay(150);
    }
  }
}

async function connect(debugPort) {
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.addEventListener("open", resolve, { once: true });
          socket.addEventListener("error", () => reject(new Error("chrome socket failed")), {
            once: true,
          });
        });
        return new Devtools(socket);
      }
    } catch {
      // Chrome is still starting: retry until the deadline.
    }
    if (Date.now() > deadline) throw new Error("headless Chrome never opened a page target");
    await delay(300);
  }
}

async function main() {
  const health = await fetch(`${baseUrl}/api/health`).catch(() => undefined);
  if (!health?.ok) {
    throw new Error(
      `${baseUrl} did not answer /api/health. Start the scratch server (see docs/RUNNING.md) ` +
        "and seed it with tooling/scripts/seed-demo.mjs first.",
    );
  }

  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), "flowly-shots-"));
  mkdirSync(outDir, { recursive: true });
  console.log(`Flowly screenshots from ${baseUrl}`);
  console.log(`  chrome: ${chrome}`);
  console.log(`  output: ${outDir}\n`);

  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=1440,${height}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let devtools;
  try {
    devtools = await connect(port);
    await devtools.send("Page.enable");
    await devtools.send("Runtime.enable");
    await devtools.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Unlock the scratch vault in the browser's own session, then reload, so
    // every screenshot is taken with the app in its normal, unlocked state.
    await devtools.send("Page.navigate", { url: baseUrl });
    await devtools.waitFor("document.readyState === 'complete'");
    const unlocked = await devtools.evaluate(`fetch("/api/vault/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: ${JSON.stringify(passphrase)} })
    }).then((response) => response.status)`);
    if (unlocked !== 200) {
      throw new Error(
        `unlocking the scratch vault returned ${unlocked}; re-seed it with ` +
          "tooling/scripts/seed-demo.mjs (or set FLOWLY_DEMO_PASSPHRASE)",
      );
    }

    await devtools.send("Page.navigate", { url: baseUrl });
    await devtools.waitFor("!!document.querySelector('.sidebar')");
    await devtools.waitFor("!!document.querySelector('.topbar')");

    for (const section of SECTIONS) {
      if (section.height && section.height !== height) {
        await devtools.send("Emulation.setDeviceMetricsOverride", {
          width: 1440,
          height: section.height,
          deviceScaleFactor: 1,
          mobile: false,
        });
      } else {
        await devtools.send("Emulation.setDeviceMetricsOverride", {
          width: 1440,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        });
      }
      await devtools.evaluate(`(() => {
        const button = [...document.querySelectorAll(".nav button")]
          .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(section.nav)});
        if (!button) throw new Error("no nav entry for ${section.nav}");
        button.click();
      })()`);
      await devtools.waitFor(
        `[...document.querySelectorAll("h1")].some((heading) => heading.textContent.trim() === ${JSON.stringify(
          section.title,
        )})`,
      );
      await devtools.waitFor(`!!document.querySelector('${section.ready ?? ".section-banner"}')`);
      if (section.prepare) {
        await devtools.evaluate(`(() => {
          const button = [...document.querySelectorAll("button")]
            .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(section.prepare)});
          if (!button) throw new Error("no control named ${section.prepare}");
          button.click();
        })()`);
        await delay(600);
      }
      // The charts and the live reads settle a moment after the first paint.
      await delay(800);
      const shot = await devtools.send("Page.captureScreenshot", { format: "png" });
      const file = join(outDir, section.file);
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      const size = Math.round(statSync(file).size / 1024);
      console.log(`  ok   ${section.file} (${size} KB)`);
    }
  } finally {
    try {
      await devtools?.send("Browser.close");
    } catch {
      // Closing the socket is enough when the browser is already gone.
    }
    browser.kill();
    await delay(300);
    rmSync(profile, { recursive: true, force: true });
  }

  console.log(`\nWrote ${SECTIONS.length} screenshots to docs/images.`);
}

await main();
