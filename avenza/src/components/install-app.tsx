import { useEffect, useState } from "react";
import { Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isInstalled, isIOS, isNativeApp } from "@/lib/platform";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/**
 * "Install app" for phones and tablets. Android/Chrome shows its own install prompt;
 * iPhone/iPad Safari has none, so we explain Share → Add to Home Screen instead.
 * Hidden once AVENZA is installed, inside the store apps, and where installing isn't possible.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (isInstalled() || isNativeApp()) return;
    setIos(isIOS(navigator.userAgent, navigator.maxTouchPoints));
    setHidden(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!prompt && !ios)) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setHidden(true);
      setPrompt(null);
    } else {
      setHelp(true);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={install}>
        Install app
      </Button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add AVENZA to your Home Screen</DialogTitle>
            <DialogDescription>It opens full-screen, like any other app.</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-3 text-sm">
            <li className="flex items-center gap-3">
              <span className="font-mono text-muted-foreground">1</span>
              Tap the Share button <Share className="size-4" aria-label="Share" /> in Safari.
            </li>
            <li className="flex items-center gap-3">
              <span className="font-mono text-muted-foreground">2</span>
              Choose “Add to Home Screen” <SquarePlus className="size-4" aria-hidden="true" />.
            </li>
            <li className="flex items-center gap-3">
              <span className="font-mono text-muted-foreground">3</span>
              Tap Add. AVENZA appears on your Home Screen.
            </li>
          </ol>
          <Button onClick={() => setHelp(false)}>Got it</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
