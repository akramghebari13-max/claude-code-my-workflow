import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Storage first. No record-deletion RPC is issued if any listing or removal fails. */
export async function deletePersonalData(sb: SupabaseClient<Database>, userId: string) {
  const auth = await sb.auth.getUser();
  if (auth.error || auth.data.user?.id !== userId)
    throw new Error("Sign in before deleting your own personal data");
  const bucket = sb.storage.from("my-files");
  const paths: string[] = [];
  async function list(prefix: string) {
    if (!prefix.startsWith(`${userId}/`) && prefix !== userId)
      throw new Error("Only your own files can be removed");
    for (let offset = 0; ; offset += 100) {
      const result = await bucket.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (result.error)
        throw new Error("Couldn't list all your saved files. Your records have not been deleted.");
      for (const item of result.data) {
        if (item.name.includes("/") || item.name === "..")
          throw new Error(
            "Couldn't safely check a saved file. Your records have not been deleted.",
          );
        if (item.id) paths.push(`${prefix}/${item.name}`);
        else await list(`${prefix}/${item.name}`);
      }
      if (result.data.length < 100) break;
    }
  }
  await list(userId);
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const result = await bucket.remove(batch);
    if (result.error || result.data.length !== batch.length)
      throw new Error(
        "Some files could not be removed. Some earlier files may already be gone, but your records have been kept. Please try again.",
      );
  }
  // Re-list to catch uploads during removal before deleting their records.
  paths.length = 0;
  await list(userId);
  if (paths.length)
    throw new Error(
      "New files appeared while deleting. Your records have been kept. Please close other My Files tabs and try again.",
    );
  const result = await sb.rpc("pf_delete_all_my_data");
  if (result.error)
    throw new Error(
      "Your files were removed, but the records could not be deleted. Please try again.",
    );
  return result.data;
}
