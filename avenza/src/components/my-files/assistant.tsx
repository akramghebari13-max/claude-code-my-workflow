import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { askMyFiles } from "@/lib/myfiles-assistant.functions";
import { ASSISTANT_QUESTIONS } from "@/lib/myfiles-assistant";
import { friendlyError } from "@/lib/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Turn = { question: string; answer?: string; generatedAt?: string; error?: string };
export function PersonalAssistant({ hasData }: { hasData: boolean }) {
  const ask = useServerFn(askMyFiles);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  async function send(value: string) {
    if (busy || !value.trim() || value.trim().length > 500) return;
    const index = turns.length;
    setTurns((old) => [...old, { question: value }]);
    setQuestion("");
    setBusy(true);
    try {
      const result = await ask({ data: { question: value } });
      setTurns((old) =>
        old.map((turn, i) =>
          i === index
            ? result.ok
              ? { question: value, answer: result.answer, generatedAt: result.generatedAt }
              : { question: value, error: result.message }
            : turn,
        ),
      );
    } catch (error) {
      setTurns((old) =>
        old.map((turn, i) =>
          i === index ? { question: value, error: friendlyError(error) } : turn,
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <h2 className="text-2xl font-semibold">Ask My Files</h2>
      <p className="text-sm text-muted-foreground">
        Answers come only from the records you've saved here and are information, not financial
        advice.
      </p>
      {!hasData ? (
        <div className="space-y-3 border-y py-6">
          <p>There is nothing saved yet.</p>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link to="/my-files" search={{ view: "documents" }}>
                Documents
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/my-files" search={{ view: "transactions" }}>
                Transactions
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {ASSISTANT_QUESTIONS.map((text) => (
              <Button
                key={text}
                variant="outline"
                className="h-auto min-h-11 min-w-0 justify-start whitespace-normal break-words py-2 text-left"
                disabled={busy}
                onClick={() => send(text)}
              >
                {text}
              </Button>
            ))}
          </div>
          <div aria-live="polite" className="space-y-4">
            {turns.map((turn, index) => (
              <div key={index} className="min-w-0 space-y-2 border-t pt-4">
                <p className="break-words font-medium">{turn.question}</p>
                {turn.answer && (
                  <>
                    <p className="whitespace-pre-wrap break-words" data-assistant-answer>
                      {turn.answer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Based on your records as of{" "}
                      {new Intl.DateTimeFormat("en-GB", {
                        timeZone: "Europe/London",
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(turn.generatedAt ?? ""))}{" "}
                      (UK time)
                    </p>
                  </>
                )}
                {turn.error && (
                  <div role="alert">
                    <p className="break-words text-destructive">{turn.error}</p>
                    <Button variant="outline" disabled={busy} onClick={() => send(turn.question)}>
                      Try again
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {busy && <p role="status">Checking your records…</p>}
          </div>
          <form
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(question);
            }}
          >
            <Input
              aria-label="Ask about your saved records"
              maxLength={500}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={busy}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Send question"
              title="Send question"
              disabled={busy || !question.trim()}
            >
              <Send className="size-4" />
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
