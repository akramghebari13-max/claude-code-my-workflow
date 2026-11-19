import { Suspense, useRef, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Eye, FileUp, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/myfiles.functions";
import { buildStoragePath, DOC_TYPES, validateUpload } from "@/lib/myfiles";
import { friendlyError } from "@/lib/app";
import { isStaleProcessing } from "@/lib/myfiles-extraction";
import {
  documentUrlQuery,
  type PersonalCategory,
  type PersonalDocument,
} from "@/lib/myfiles-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { selectClass, TransactionForm } from "./transaction-form";

const STATUS: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Reading",
  needs_review: "Needs your review",
  confirmed: "Confirmed",
  failed: "Couldn't read",
};

function Preview({ userId, document }: { userId: string; document: PersonalDocument }) {
  const { data: url } = useSuspenseQuery(documentUrlQuery(userId, document));
  return (
    <div className="min-w-0">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary underline"
      >
        Open original document
      </a>
      {document.mime_type === "application/pdf" ? (
        <object data={url} type="application/pdf" className="mt-2 h-[420px] w-full">
          <p>Open the original document to view this PDF.</p>
        </object>
      ) : (
        <img
          src={url}
          alt={document.file_name}
          className="mt-2 max-h-[500px] w-full rounded-md border object-contain"
        />
      )}
    </div>
  );
}

export function Documents({
  userId,
  documents,
  categories,
  reviewId,
  onReview,
}: {
  userId: string;
  documents: PersonalDocument[];
  categories: PersonalCategory[];
  reviewId?: string;
  onReview: (id?: string) => void;
}) {
  const qc = useQueryClient();
  const read = useServerFn(extractDocument);
  const input = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("other");
  const [busyFile, setBusyFile] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<PersonalDocument | null>(null);
  const [previewError, setPreviewError] = useState("");
  const selected = documents.find((document) => document.id === reviewId);
  // Per-document read state: a read left pending for one row never disables another row.
  const [readingIds, setReadingIds] = useState<ReadonlySet<string>>(new Set());
  const reading = useMutation({
    mutationFn: (documentId: string) => read({ data: { documentId } }),
    onMutate: (documentId) => setReadingIds((ids) => new Set(ids).add(documentId)),
    onSettled: (_result, _error, documentId) =>
      setReadingIds((ids) => {
        const next = new Set(ids);
        next.delete(documentId);
        return next;
      }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      if (!result.ok) toast.error(result.message);
      else toast.success(result.message);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const failed: File[] = [];
      for (const file of files) {
        setBusyFile(file.name);
        const valid = validateUpload(file);
        if (!valid.ok) {
          failed.push(file);
          toast.error(`${file.name}: ${valid.message}`);
          continue;
        }
        const path = buildStoragePath(userId, file.name);
        let inserted = false;
        try {
          const { error: storageError } = await supabase.storage
            .from("my-files")
            .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
          if (storageError) throw storageError;
          const { data, error } = await supabase
            .from("pf_documents")
            .insert({
              storage_path: path,
              file_name: file.name.slice(0, 200),
              mime_type: file.type,
              size_bytes: file.size,
              doc_type: type,
              status: "uploaded",
            })
            .select("id")
            .single();
          if (error) throw error;
          inserted = true;
          toast.success(`${file.name} uploaded`);
          await qc.invalidateQueries({ queryKey: ["my-files"] });
          // No automatic replay: each new upload or explicit re-read is one AI attempt.
          const result = await read({ data: { documentId: data.id } });
          if (!result.ok) toast.error(result.message);
          await qc.invalidateQueries({ queryKey: ["my-files"] });
        } catch (error) {
          if (!inserted) {
            const { error: cleanupError } = await supabase.storage.from("my-files").remove([path]);
            if (cleanupError)
              toast.error("Upload cleanup failed. Try again when your connection returns.");
            failed.push(file);
          } else {
            await supabase
              .from("pf_documents")
              .update({
                status: "failed",
                error_message: "Reading was interrupted. Enter the details by hand or try again.",
              })
              .eq("storage_path", path)
              .in("status", ["uploaded", "processing"]);
          }
          toast.error(friendlyError(error));
        }
      }
      setRetryFiles(failed);
    },
    onSettled: async () => {
      setBusyFile("");
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      if (input.current) input.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    },
  });
  const remove = useMutation({
    mutationFn: async (document: PersonalDocument) => {
      const { error: storageError } = await supabase.storage
        .from("my-files")
        .remove([document.storage_path]);
      if (storageError)
        throw new Error(
          "Choose Try again: the file could not be deleted. Its document has been kept.",
        );
      const { error } = await supabase
        .from("pf_documents")
        .delete()
        .eq("id", document.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      setDeleting(null);
      onReview();
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      toast.success("Document deleted; any saved transaction has been kept.");
    },
  });
  const view = useMutation({
    mutationFn: async ({ document, tab }: { document: PersonalDocument; tab: Window | null }) => {
      const { data, error } = await supabase.storage
        .from("my-files")
        .createSignedUrl(document.storage_path, 60);
      if (error) {
        tab?.close();
        throw error;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = data.signedUrl;
      } else setPreviewError("Choose View again and allow this document to open in a new tab.");
    },
    onError: (error) => setPreviewError(friendlyError(error)),
  });
  const pending = upload.isPending || reading.isPending;
  return (
    <div className="space-y-6">
      <section
        className={`rounded-lg border-2 border-dashed p-5 ${dragging ? "border-primary bg-muted" : "border-border"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!pending) upload.mutate(Array.from(event.dataTransfer.files));
        }}
      >
        <FileUp className="mb-3 h-8 w-8 text-primary" />
        <h2 className="text-xl font-semibold">Upload a document</h2>
        <div className="my-4 max-w-xs">
          <Label htmlFor="upload-type">Document type</Label>
          <select
            id="upload-type"
            className={selectClass}
            value={type}
            disabled={pending}
            onChange={(event) => setType(event.target.value)}
          >
            {DOC_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,application/pdf"
          className="sr-only"
          aria-label="Upload documents"
          disabled={pending}
          onChange={(event) => upload.mutate(Array.from(event.target.files ?? []))}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="sr-only"
          aria-label="Take a document photo"
          disabled={pending}
          onChange={(event) => upload.mutate(Array.from(event.target.files ?? []))}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => cameraInput.current?.click()}>
            <Camera className="mr-2 h-4 w-4" />
            Take a photo
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" />
            Choose file
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          or drop files here · JPEG, PNG, PDF · 10 MB
        </p>
        {pending && (
          <p role="status" className="mt-3 flex items-center gap-2 break-all text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {busyFile ? `Uploading and reading ${busyFile}` : "Reading document…"}
          </p>
        )}
        {retryFiles.length > 0 && (
          <div role="alert" className="mt-3">
            <p className="text-sm text-destructive">Some files could not be uploaded.</p>
            <Button variant="outline" disabled={pending} onClick={() => upload.mutate(retryFiles)}>
              Try again
            </Button>
          </div>
        )}
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
          Your document is read by AI to fill in the details. You always review before anything is
          saved. Files are private to your account.
        </p>
      </section>
      {previewError && (
        <p role="alert" className="text-sm text-destructive">
          {previewError}
        </p>
      )}
      {documents.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <h3 className="break-all font-medium">{document.file_name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {DOC_TYPES.find(([key]) => key === document.doc_type)?.[1]} ·{" "}
                  {new Date(document.created_at).toLocaleDateString("en-GB", {
                    timeZone: "Europe/London",
                  })}{" "}
                  · {(document.size_bytes / 1024).toFixed(0)} KB
                </p>
                <Badge
                  variant={document.status === "failed" ? "destructive" : "secondary"}
                  className="mt-2"
                >
                  {isStaleProcessing(document)
                    ? "Taking longer than expected"
                    : (STATUS[document.status] ?? document.status)}
                </Badge>
                {document.error_message && (
                  <p className="mt-2 break-words text-sm text-destructive">
                    {document.error_message}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {["needs_review", "failed"].includes(document.status) && (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => onReview(document.id)}
                  >
                    Review
                  </Button>
                )}
                {document.status === "uploaded" && (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => reading.mutate(document.id)}
                  >
                    Read with AI
                  </Button>
                )}
                {isStaleProcessing(document) && (
                  <>
                    <Button
                      variant="outline"
                      disabled={readingIds.has(document.id)}
                      onClick={() => reading.mutate(document.id)}
                    >
                      Try again
                    </Button>
                    <Button
                      variant="outline"
                      disabled={readingIds.has(document.id)}
                      onClick={() => setDeleting(document)}
                    >
                      Discard
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  title="View document"
                  aria-label={`View ${document.file_name}`}
                  disabled={view.isPending}
                  onClick={() => {
                    const tab = window.open("about:blank", "_blank");
                    view.mutate({ document, tab });
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete document"
                  aria-label={`Delete ${document.file_name}`}
                  disabled={
                    isStaleProcessing(document)
                      ? readingIds.has(document.id)
                      : pending || document.status === "processing"
                  }
                  onClick={() => setDeleting(document)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(reviewId)}
        onOpenChange={(open) => {
          if (!open) onReview();
        }}
      >
        <DialogContent className="h-[100dvh] max-h-[100dvh] max-w-4xl overflow-y-auto md:h-auto md:max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>Review document</DialogTitle>
            <DialogDescription>{selected?.file_name ?? "Document unavailable"}</DialogDescription>
          </DialogHeader>
          {selected && ["failed", "needs_review"].includes(selected.status) ? (
            <TransactionForm
              key={`${selected.id}-${selected.updated_at}`}
              categories={categories}
              document={selected}
              busy={reading.isPending}
              onSaved={() => onReview()}
              preview={
                <Suspense fallback={<Skeleton className="h-80 w-full" />}>
                  <Preview userId={userId} document={selected} />
                </Suspense>
              }
              actions={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={reading.isPending}
                    onClick={() => setDeleting(selected)}
                  >
                    Discard
                  </Button>
                  {selected.status === "failed" && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={reading.isPending}
                      onClick={() => reading.mutate(selected.id)}
                    >
                      {reading.isPending ? "Reading…" : "Re-read with AI"}
                    </Button>
                  )}
                </>
              }
            />
          ) : (
            <p>This document is unavailable for review.</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              The file is removed permanently. Any transaction already saved from it will be kept.
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {friendlyError(remove.error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting) remove.mutate(deleting);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
