import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Archive, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/app";
import type { PersonalCategory } from "@/lib/myfiles-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function Categories({ categories }: { categories: PersonalCategory[] }) {
  const [editing, setEditing] = useState<PersonalCategory | null>(null);
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (
      action:
        | { type: "save" }
        | { type: "archive"; category: PersonalCategory }
        | { type: "move"; category: PersonalCategory; direction: number },
    ) => {
      if (action.type === "save") {
        const trimmed = name.trim();
        if (!trimmed || trimmed.length > 60)
          throw new Error("Choose a category name between 1 and 60 characters");
        if (
          categories.some(
            (category) =>
              category.id !== editing?.id &&
              category.name.toLocaleLowerCase("en-GB") === trimmed.toLocaleLowerCase("en-GB"),
          )
        )
          throw new Error("That category name already exists. Choose another name.");
        const result = editing
          ? await supabase
              .from("pf_categories")
              .update({ name: trimmed })
              .eq("id", editing.id)
              .select("id")
              .single()
          : await supabase
              .from("pf_categories")
              .insert({
                name: trimmed,
                sort_order: Math.max(0, ...categories.map((category) => category.sort_order)) + 1,
              })
              .select("id")
              .single();
        if (result.error) throw result.error;
        setEditing(null);
        setName("");
      } else if (action.type === "archive") {
        const { error } = await supabase
          .from("pf_categories")
          .update({ archived: !action.category.archived })
          .eq("id", action.category.id)
          .select("id")
          .single();
        if (error) throw error;
      } else {
        const index = categories.findIndex((category) => category.id === action.category.id);
        const other = categories[index + action.direction];
        if (!other) return;
        // One statement swaps both positions; it cannot leave a half-completed reorder.
        const rows = [action.category, other].map((category) => ({
          ...category,
          sort_order:
            category.id === action.category.id ? other.sort_order : action.category.sort_order,
        }));
        const { error } = await supabase.from("pf_categories").upsert(rows);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      toast.success("Categories updated");
    },
  });
  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ type: "save" });
        }}
      >
        <div className="w-full max-w-sm">
          <Label htmlFor="category-name">{editing ? "Rename category" : "New category"}</Label>
          <Input
            id="category-name"
            maxLength={60}
            value={name}
            required
            disabled={mutation.isPending}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : editing ? "Save name" : "Add category"}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setName("");
            }}
          >
            Cancel
          </Button>
        )}
      </form>
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(mutation.error)}
        </p>
      )}
      <ul className="divide-y rounded-lg border bg-card">
        {categories.map((category, index) => (
          <li
            key={category.id}
            className="grid min-w-0 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0 break-words font-medium">
              {category.name} {category.archived && <Badge variant="secondary">Archived</Badge>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={mutation.isPending || index === 0}
                aria-label={`Move ${category.name} up`}
                title="Move up"
                onClick={() => mutation.mutate({ type: "move", category, direction: -1 })}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={mutation.isPending || index === categories.length - 1}
                aria-label={`Move ${category.name} down`}
                title="Move down"
                onClick={() => mutation.mutate({ type: "move", category, direction: 1 })}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={mutation.isPending}
                aria-label={`Rename ${category.name}`}
                title="Rename"
                onClick={() => {
                  setEditing(category);
                  setName(category.name);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={mutation.isPending}
                aria-label={`${category.archived ? "Restore" : "Archive"} ${category.name}`}
                title={category.archived ? "Restore" : "Archive"}
                onClick={() => mutation.mutate({ type: "archive", category })}
              >
                {category.archived ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
