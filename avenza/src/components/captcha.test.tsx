// The human check, with Cloudflare's widget replaced by a stand-in.
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Captcha, TURNSTILE_SCRIPT } from "./captcha";

function fakeTurnstile() {
  const t = {
    opts: null as null | Record<string, (token?: string) => void>,
    render: vi.fn((_el: HTMLElement, opts: Record<string, (token?: string) => void>) => {
      t.opts = opts;
      return "w1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = t as never;
  return t;
}
afterEach(() => {
  delete window.turnstile;
});

describe("human check", () => {
  it("renders with the site key and reports the token, expiry and failures", async () => {
    const t = fakeTurnstile();
    const onToken = vi.fn();
    render(<Captcha onToken={onToken} resetKey={0} siteKey="site-key-1" />);
    await waitFor(() => expect(t.render).toHaveBeenCalled());
    expect(t.render.mock.calls[0]![1]).toMatchObject({ sitekey: "site-key-1" });
    t.opts!["callback"]!("tok-1");
    expect(onToken).toHaveBeenLastCalledWith("tok-1");
    t.opts!["expired-callback"]!();
    expect(onToken).toHaveBeenLastCalledWith(null);
    t.opts!["error-callback"]!();
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("gets a fresh check after each attempt and cleans up", async () => {
    const t = fakeTurnstile();
    const onToken = vi.fn();
    const { rerender, unmount } = render(<Captcha onToken={onToken} resetKey={0} siteKey="k" />);
    await waitFor(() => expect(t.render).toHaveBeenCalled());
    rerender(<Captcha onToken={onToken} resetKey={1} siteKey="k" />);
    expect(t.reset).toHaveBeenCalledWith("w1");
    expect(onToken).toHaveBeenLastCalledWith(null);
    unmount();
    expect(t.remove).toHaveBeenCalledWith("w1");
  });

  it("loads Cloudflare's script only when needed", () => {
    expect(TURNSTILE_SCRIPT).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
  });
});
