// The delete-account flow on /account, with the server and sign-in faked.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const remove = vi.fn();
const signOut = vi.fn();
const navigate = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/account.functions", () => ({ deleteMyAccount: (a: unknown) => remove(a) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: (a: unknown) => signOut(a) } },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: object) => ({
    ...opts,
    useRouteContext: () => ({ user: { email: "me@example.com" } }),
  }),
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  useNavigate: () => navigate,
}));

import { Route } from "@/routes/account";

function show() {
  const Page = (Route as unknown as { component: () => React.ReactElement }).component;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
}

describe("Delete your account", () => {
  beforeEach(() => {
    remove.mockReset();
    signOut.mockReset();
    navigate.mockReset();
  });

  it("only deletes after DELETE is typed, then signs out and leaves", async () => {
    remove.mockResolvedValue({ ok: true });
    show();
    const button = screen.getByRole("button", { name: "Delete my account permanently" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "delete" },
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(button);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(remove).toHaveBeenCalledWith({ data: { confirm: "DELETE" } });
    expect(signOut).toHaveBeenCalled();
  });

  it("shows the server's message and stays signed in if deletion stops", async () => {
    remove.mockResolvedValue({
      error: "Your account couldn't be fully deleted. Please try again.",
    });
    show();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account permanently" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be fully deleted");
    expect(signOut).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("links to the privacy policy and warns about keeping records", () => {
    show();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByText("Keep your records first.")).toBeInTheDocument();
  });
});
