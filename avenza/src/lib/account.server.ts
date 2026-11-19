// Server-only: deleting an account everywhere. Kept apart from the server function so the order
// of steps can be tested with fakes (account.server.test.ts).

/** What has to be typed to confirm. */
export const DELETE_WORD = "DELETE";

type Removed = { error: { message: string } | null };
export type StorageLike = {
  from(bucket: string): {
    list(
      prefix: string,
      opts: { limit: number; offset: number },
    ): Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
    remove(paths: string[]): Promise<Removed>;
  };
};
export type AccountDeps = {
  userId: string;
  /** Stripe customer for this person, if they ever started checkout. */
  stripeCustomerId: string | null;
  /** Deletes the Stripe customer, which ends any subscription at once and removes saved cards. */
  deleteStripeCustomer: ((id: string) => Promise<void>) | null;
  businessesToDelete: () => Promise<string[]>;
  storage: StorageLike;
  deleteData: () => Promise<void>;
  deleteLogin: () => Promise<void>;
};

const PAGE = 100;

/** Removes every file directly in `folder` (uploads are stored one level deep). */
export async function emptyFolder(storage: StorageLike, bucket: string, folder: string) {
  for (;;) {
    const { data, error } = await storage.from(bucket).list(folder, { limit: PAGE, offset: 0 });
    if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
    if (!data?.length) return;
    const { error: rmErr } = await storage
      .from(bucket)
      .remove(data.map((f) => `${folder}/${f.name}`));
    if (rmErr) throw new Error(`remove ${bucket}/${folder}: ${rmErr.message}`);
    if (data.length < PAGE) return;
  }
}

/**
 * Order matters: billing stops first (so nobody is charged for an account that's gone), then files,
 * then records, then the login. If a step fails, it stops there and can be run again safely:
 * every step skips what's already gone.
 */
export async function deleteAccountEverywhere(d: AccountDeps): Promise<void> {
  if (d.stripeCustomerId) {
    if (!d.deleteStripeCustomer)
      throw new Error("Stripe isn't configured, so the subscription can't be cancelled");
    await d.deleteStripeCustomer(d.stripeCustomerId);
  }
  for (const id of await d.businessesToDelete()) await emptyFolder(d.storage, "receipts", id);
  await emptyFolder(d.storage, "my-files", d.userId);
  await d.deleteData();
  await d.deleteLogin();
}
