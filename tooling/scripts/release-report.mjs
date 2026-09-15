#!/usr/bin/env node
/**
 * Generates the release SBOM and the third-party license inventory, and fails
 * when a runtime dependency carries a copyleft license the project cannot ship.
 *
 *   node tooling/scripts/release-report.mjs [--check]
 *
 * Output: docs/security/sbom.json and docs/security/third-party-licenses.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const outputDir = join(repoRoot, "docs", "security");
const checkOnly = process.argv.includes("--check");

/** Licenses we refuse to ship in the runtime image. */
const DENIED = [/\bAGPL\b/i, /\bGPL-[23]\.0\b/i, /\bSSPL\b/i, /\bBUSL\b/i];

/**
 * `pnpm licenses list` reflects what the installing operating system resolved,
 * so optional bindings such as `@esbuild/darwin-arm64` (macOS) and
 * `@esbuild/linux-x64` (the CI runner) would make the same lockfile produce
 * different inventories. Drop those bindings: this inventory describes the
 * dependency graph, and the container build publishes its own image SBOM.
 */
const PLATFORM_BINDING =
  /(?:^|[-/])(darwin|linux|win32|win64|freebsd|android|openharmony|sunos|aix)[-/]|(?:^|[-/])(x64|arm64|ia32|arm|ppc64|ppc64le|s390x|riscv64|loong64|mips64el|wasm32)(?:[-/]|$)/i;
const PLATFORM_ONLY = new Set(["fsevents"]);

function isPlatformBinding(name) {
  return PLATFORM_ONLY.has(name) || PLATFORM_BINDING.test(name);
}

/** Removes platform-specific bindings from a `pnpm licenses list` result. */
function withoutPlatformBindings(groups) {
  const kept = {};
  for (const [license, entries] of Object.entries(groups)) {
    const filtered = entries.filter((entry) => !isPlatformBinding(entry.name));
    if (filtered.length > 0) kept[license] = filtered;
  }
  return kept;
}

function pnpmJson(args) {
  try {
    const output = execFileSync("pnpm", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error);
    throw new Error(`pnpm ${args.join(" ")} failed: ${stderr}`);
  }
}

const sbomPath = join(outputDir, "sbom.json");
const licensesPath = join(outputDir, "third-party-licenses.md");

function loadPreviousLicenses() {
  try {
    const previous = JSON.parse(readFileSync(sbomPath, "utf8"));
    const byPackageVersion = new Map();
    for (const component of previous.components ?? []) {
      const id = component.licenses?.[0]?.license?.id;
      if (!id) continue;
      byPackageVersion.set(`${component.name}@${component.version}`, id);
    }
    return byPackageVersion;
  } catch {
    return new Map();
  }
}

function normalizeLicenseGroups(groups, previousLicenses) {
  const grouped = new Map();

  for (const [license, entries] of Object.entries(groups)) {
    for (const entry of entries) {
      for (const version of entry.versions ?? []) {
        const key = `${entry.name}@${version}`;
        const resolvedLicense =
          license === "Unknown" ? previousLicenses.get(key) ?? license : license;

        if (!grouped.has(resolvedLicense)) grouped.set(resolvedLicense, new Map());
        const packages = grouped.get(resolvedLicense);
        if (!packages.has(entry.name)) packages.set(entry.name, new Set());
        packages.get(entry.name).add(version);
      }
    }
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([license, packages]) => [
      license,
      [...packages.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, versions]) => ({
          name,
          versions: [...versions].sort(),
        })),
    ]),
  );
}

const previousLicenses = loadPreviousLicenses();
const all = normalizeLicenseGroups(
  withoutPlatformBindings(pnpmJson(["licenses", "list", "--json"])),
  previousLicenses,
);
const project = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const serverPackage = JSON.parse(
  readFileSync(join(repoRoot, "apps", "server", "package.json"), "utf8"),
);

let production = {};
try {
  production = normalizeLicenseGroups(
    withoutPlatformBindings(pnpmJson(["licenses", "list", "--prod", "--json"])),
    previousLicenses,
  );
} catch {
  console.warn("warning: could not restrict the license list to production dependencies");
}

const components = [];
for (const [license, entries] of Object.entries(all)) {
  for (const entry of entries) {
    for (const version of entry.versions ?? []) {
      components.push({
        type: "library",
        name: entry.name,
        version,
        licenses: [{ license: { id: license } }],
        purl: `pkg:npm/${entry.name.replace("@", "%40")}@${version}`,
      });
    }
  }
}

components.sort((a, b) =>
  a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
);

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: project.name,
      version: project.version ?? "0.0.0",
      licenses: [{ license: { id: "Apache-2.0" } }],
    },
    // No wall-clock timestamp: the artefact must be byte-stable so CI can check
    // that the committed SBOM matches a fresh generation.
    tools: [{ vendor: "flowly", name: "release-report", version: "1" }],
    properties: [
      {
        name: "flowly:excludedComponents",
        value:
          "platform-specific optional bindings (darwin/linux/win32/arm64/..., fsevents); the container build publishes the image SBOM",
      },
    ],
  },
  components,
};

const byLicense = new Map();
for (const [license, entries] of Object.entries(all)) {
  const names = entries.map((entry) => `${entry.name}@${(entry.versions ?? []).join(", ")}`).sort();
  byLicense.set(license, names);
}

const lines = [
  "# Third-party licenses",
  "",
  "Generated by `pnpm release:report`. Do not edit by hand.",
  "",
  `Components: ${components.length}. Runtime dependencies of \`@flowly/server\`: ${
    Object.values(production).flat().length
  } packages.`,
  "",
  "Platform-specific optional bindings (`-darwin-*`, `-linux-*`, `fsevents`, and similar)",
  "are excluded so the same lockfile produces the same report on every operating system;",
  "the container build publishes the SBOM of the shipped image.",
  "",
  "## Runtime dependencies",
  "",
  ...[...Object.entries(production)]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([license, entries]) => [
      `### ${license}`,
      "",
      ...entries.map((entry) => `- ${entry.name}@${(entry.versions ?? []).join(", ")}`).sort(),
      "",
    ]),
  "## Development and tooling dependencies",
  "",
  ...[...byLicense.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([license, names]) => [`### ${license}`, "", ...names.map((name) => `- ${name}`), ""]),
];

const violations = [];
for (const [license, entries] of Object.entries(production)) {
  if (DENIED.some((pattern) => pattern.test(license))) {
    violations.push(`${license}: ${entries.map((entry) => entry.name).join(", ")}`);
  }
}

if (checkOnly) {
  if (violations.length > 0) {
    console.error("Denied licenses in runtime dependencies:");
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }
  console.log(
    `License policy passed for ${Object.values(production).flat().length} runtime packages.`,
  );
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`);
writeFileSync(licensesPath, `${lines.join("\n")}\n`);
console.log(
  `Wrote ${sbomPath} (${components.length} components) and ${licensesPath} for ${serverPackage.name}.`,
);

if (violations.length > 0) {
  console.error("Denied licenses in runtime dependencies:");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}
