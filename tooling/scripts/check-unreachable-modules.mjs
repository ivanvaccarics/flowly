#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const roots = [
  {
    label: "server",
    source: resolve("apps/server/src"),
    entry: resolve("apps/server/src/index.ts"),
  },
  {
    label: "web",
    source: resolve("apps/web/src"),
    entry: resolve("apps/web/src/main.tsx"),
  },
];

let failed = false;
for (const root of roots) {
  const graph = new Map();
  for (const file of sourceFiles(root.source)) {
    graph.set(file, localImports(file));
  }
  const reachable = new Set();
  const stack = [root.entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (!file || reachable.has(file) || !graph.has(file)) continue;
    reachable.add(file);
    stack.push(...graph.get(file));
  }

  const unreachable = [...graph.keys()]
    .filter((file) => !reachable.has(file))
    .map((file) => relative(process.cwd(), file))
    .sort();
  if (unreachable.length > 0) {
    failed = true;
    console.error(`Unreachable ${root.label} production modules:`);
    for (const file of unreachable) console.error(`  - ${file}`);
  } else {
    console.log(`${root.label}: every production source module is reachable from its entry point`);
  }
}

if (failed) process.exitCode = 1;

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function localImports(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = [];
  const visit = (node) => {
    const specifier =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length === 1 &&
            ts.isStringLiteral(node.arguments[0])
          ? node.arguments[0].text
          : undefined;
    const resolved = specifier ? resolveLocal(file, specifier) : undefined;
    if (resolved) imports.push(resolved);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function resolveLocal(from, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(from), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
