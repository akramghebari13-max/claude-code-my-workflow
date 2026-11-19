import { describe, expect, it } from "vitest";
import {
  deleteAccountEverywhere,
  emptyFolder,
  type AccountDeps,
  type StorageLike,
} from "./account.server";

function fakeStorage(files: Record<string, string[]>, log: string[]): StorageLike {
  return {
    from: (bucket) => ({
      list: async (prefix, { limit }) => ({
        data: files[`${bucket}/${prefix}`]!.slice(0, limit).map((name) => ({ name })),
        error: null,
      }),
      remove: async (paths) => {
        for (const p of paths) {
          const [folder, name] = [p.slice(0, p.lastIndexOf("/")), p.slice(p.lastIndexOf("/") + 1)];
          const key = `${bucket}/${folder}`;
          files[key] = files[key]!.filter((n) => n !== name);
          log.push(`rm ${bucket}/${p}`);
        }
        return { error: null };
      },
    }),
  };
}

function deps(log: string[], over: Partial<AccountDeps> = {}): AccountDeps {
  return {
    userId: "u1",
    stripeCustomerId: "cus_1",
    deleteStripeCustomer: async (id) => void log.push(`stripe ${id}`),
    businessesToDelete: async () => ["b1"],
    storage: fakeStorage({ "receipts/b1": ["r.pdf"], "my-files/u1": ["p.png"] }, log),
    deleteData: async () => void log.push("data"),
    deleteLogin: async () => void log.push("login"),
    ...over,
  };
}

describe("deleting an account", () => {
  it("stops billing first, then removes files, records and the login", async () => {
    const log: string[] = [];
    await deleteAccountEverywhere(deps(log));
    expect(log).toEqual([
      "stripe cus_1",
      "rm receipts/b1/r.pdf",
      "rm my-files/u1/p.png",
      "data",
      "login",
    ]);
  });

  it("deletes nothing if the subscription can't be cancelled", async () => {
    const log: string[] = [];
    const failing = deps(log, {
      deleteStripeCustomer: async () => {
        throw new Error("Stripe down");
      },
    });
    await expect(deleteAccountEverywhere(failing)).rejects.toThrow("Stripe down");
    expect(log).toEqual([]);
    await expect(
      deleteAccountEverywhere(deps(log, { deleteStripeCustomer: null })),
    ).rejects.toThrow("can't be cancelled");
    expect(log).toEqual([]);
  });

  it("works for someone who never started checkout", async () => {
    const log: string[] = [];
    await deleteAccountEverywhere(
      deps(log, { stripeCustomerId: null, deleteStripeCustomer: null }),
    );
    expect(log.at(-1)).toBe("login");
  });

  it("empties folders with more files than one listing returns", async () => {
    const log: string[] = [];
    const names = Array.from({ length: 250 }, (_, i) => `f${i}.pdf`);
    const files = { "receipts/b1": [...names] };
    await emptyFolder(fakeStorage(files, log), "receipts", "b1");
    expect(files["receipts/b1"]).toEqual([]);
    expect(log).toHaveLength(250);
  });
});
