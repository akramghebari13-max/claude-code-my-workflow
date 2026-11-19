import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deletePersonalData } from "@/lib/myfiles-privacy";
import { friendlyError } from "@/lib/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PersonalPrivacy({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<Record<string, number> | null>(null);
  async function remove() {
    if (word !== "DELETE" || busy) return;
    setBusy(true);
    setError("");
    try {
      const counts = await deletePersonalData(supabase, userId);
      const result: Record<string, number> = {};
      if (counts && typeof counts === "object" && !Array.isArray(counts))
        for (const [key, value] of Object.entries(counts))
          if (typeof value === "number") result[key] = value;
      await qc.cancelQueries({
        predicate: (q) => q.queryKey[0] === "my-files" || q.queryKey[0] === "my-files-preview",
      });
      qc.removeQueries({
        predicate: (q) => q.queryKey[0] === "my-files" || q.queryKey[0] === "my-files-preview",
      });
      setRemoved(result);
      setStep(0);
      setWord("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-6">
      <h2 className="text-xl font-semibold">Privacy</h2>
      {removed && (
        <div role="status" className="space-y-2">
          <p>
            Your personal finance data and saved files were removed. Business accounts and your
            sign-in account are untouched.
          </p>
          <p className="break-words text-sm">
            {Object.entries(removed)
              .map(([key, count]) => `${count} ${key.replaceAll("_", " ")}`)
              .join(" · ")}
          </p>
        </div>
      )}
      <Button
        variant="destructive"
        className="h-auto min-h-11 whitespace-normal text-left"
        onClick={() => {
          setStep(1);
          setError("");
        }}
      >
        Delete all my personal finance data
      </Button>
      <Dialog
        open={step > 0}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setStep(0);
            setWord("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? "Delete all personal finance data?" : "Confirm permanent removal"}
            </DialogTitle>
            <DialogDescription>
              This removes your personal documents, transactions, bills, budgets, goals, categories
              and notifications. Business books and your sign-in account are not deleted. This
              cannot be undone here.
            </DialogDescription>
          </DialogHeader>
          {step === 1 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setStep(2)}>
                Continue to confirmation
              </Button>
            </div>
          ) : (
            <>
              <Label htmlFor="delete-word">Type DELETE to confirm</Label>
              <Input
                id="delete-word"
                autoComplete="off"
                value={word}
                disabled={busy}
                onChange={(e) => setWord(e.target.value)}
              />
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              <Button variant="destructive" disabled={word !== "DELETE" || busy} onClick={remove}>
                {busy ? "Removing personal data…" : "Delete personal data now"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
