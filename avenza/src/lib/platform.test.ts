import { describe, expect, it } from "vitest";
import { isIOS, isNativeApp, NATIVE_APP_UA } from "./platform";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

describe("platform detection", () => {
  it("recognises iPhones and iPads, including iPads that say they are Macs", () => {
    expect(isIOS(IPHONE)).toBe(true);
    expect(isIOS(IPAD_AS_MAC, 5)).toBe(true);
  });
  it("does not treat Android or a desktop Mac as iOS", () => {
    expect(isIOS(ANDROID, 5)).toBe(false);
    expect(isIOS(IPAD_AS_MAC, 0)).toBe(false);
  });
  it("recognises the store app by its user agent marker", () => {
    expect(isNativeApp()).toBe(false);
    Object.defineProperty(navigator, "userAgent", {
      value: `${ANDROID} ${NATIVE_APP_UA}`,
      configurable: true,
    });
    expect(isNativeApp()).toBe(true);
  });
});
