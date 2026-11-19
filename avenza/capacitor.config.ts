import type { CapacitorConfig } from "@capacitor/cli";

/**
 * App Store / Google Play apps for AVENZA.
 *
 * AVENZA is server-rendered (pages, sign-in, HMRC and Stripe all run on the server), so the
 * store apps load the live site rather than bundling a copy. Set AVENZA_URL to the site's
 * public address before `npx cap sync`; it defaults to the current Lovable address.
 * mobile-shell/ only holds the page shown if the live site can't be reached.
 */
const url = process.env["AVENZA_URL"] ?? "https://pixel-perfect-replay-43351.lovable.app";

const config: CapacitorConfig = {
  appId: "uk.avenza.app",
  appName: "AVENZA",
  webDir: "mobile-shell",
  // Lets the site recognise the store apps (src/lib/platform.ts) and hide outside payments.
  appendUserAgent: "AvenzaApp",
  backgroundColor: "#F7F3EA",
  server: {
    url: `${url.replace(/\/+$/, "")}/dashboard`,
    errorPath: "index.html",
    cleartext: false,
  },
  ios: { contentInset: "automatic" },
  android: { allowMixedContent: false },
};

export default config;
