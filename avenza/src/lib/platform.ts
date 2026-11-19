// Where AVENZA is running: a normal browser, installed to the home screen, or inside the
// App Store / Google Play app (Capacitor). Browser-only; every check returns false on the server.

/** Added to the user agent by capacitor.config.ts, so the store apps can be recognised. */
export const NATIVE_APP_UA = "AvenzaApp";

type CapacitorWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as CapacitorWindow).Capacitor?.isNativePlatform?.()) return true;
  return navigator.userAgent.includes(NATIVE_APP_UA);
}

/** Opened from a home-screen icon rather than a browser tab. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone or iPad, including iPads that report a Mac user agent. */
export function isIOS(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}
