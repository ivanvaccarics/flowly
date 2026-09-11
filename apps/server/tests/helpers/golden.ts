import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function readGolden<T>(name: string): T {
  const path = fileURLToPath(
    new URL(`../../../../contracts/expected-results/${name}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readFixture<T>(name: string): T {
  const path = fileURLToPath(
    new URL(`../../../../contracts/fixtures/${name}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
