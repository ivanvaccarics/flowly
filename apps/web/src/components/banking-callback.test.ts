import { afterEach, describe, expect, it } from "vitest";
import { callbackMismatch, currentCallbackUrl, parseRedirect } from "./banking-callback.js";

const originalUrl = window.location.href;

afterEach(() => {
  window.history.replaceState({}, "", originalUrl);
});

describe("bank callback helpers", () => {
  it("reads code, state and provider errors from full or partial URLs", () => {
    expect(parseRedirect("https://flowly.test/callback?code=test-code&state=test-state")).toEqual({
      code: "test-code",
      state: "test-state",
    });
    expect(parseRedirect("?error=access_denied&error_description=Cancelled")).toEqual({
      error: "access_denied",
      description: "Cancelled",
    });
    expect(parseRedirect("code=TEST_CODE&state=TEST_STATE")).toEqual({
      code: "TEST_CODE",
      state: "TEST_STATE",
    });
  });

  it("compares origins and derives the current callback", () => {
    window.history.replaceState({}, "", "http://localhost:3000/");
    expect(currentCallbackUrl()).toBe("http://localhost:3000/enablebanking/auth_callback");
    expect(callbackMismatch("http://localhost:3000/enablebanking/auth_callback")).toBeUndefined();
    expect(callbackMismatch("https://flowly.test/enablebanking/auth_callback")).toContain(
      "flowly.test",
    );
  });
});
