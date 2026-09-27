import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatStamp } from "./stamps.js";

describe("instants from the vault", () => {
  const previousZone = process.env.TZ;

  // A fixed zone keeps the expectations about local time from depending on the
  // machine running the suite. Rome is UTC+2 in September, UTC+1 in January.
  beforeAll(() => {
    process.env.TZ = "Europe/Rome";
  });
  afterAll(() => {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  });

  it("writes a stored instant in the reader's own zone", () => {
    expect(formatStamp("2026-09-27T21:03:00.000Z")).toBe("2026-09-27 23:03");
  });

  it("follows the zone's own daylight saving", () => {
    expect(formatStamp("2026-01-15T21:03:00.000Z")).toBe("2026-01-15 22:03");
  });

  it("hands back a value it cannot read instead of throwing", () => {
    expect(formatStamp("not a stamp")).toBe("not a stamp");
  });
});
