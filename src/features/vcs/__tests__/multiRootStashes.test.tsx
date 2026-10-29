import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
const apply = vi.hoisted(() => vi.fn());
vi.mock("@/platform/ipc", async (original) => {
  const real = await original<typeof import("@/platform/ipc")>();
  return {
    ...real,
    commands: {
      ...real.commands,
      vcsStashes: (repo: string) =>
        Promise.resolve({
          status: "ok",
          data: [{ index: 0, message: `On main: ${repo.endsWith("front") ? "First" : "Second"}`, timeMs: 0 }],
        }),
    },
  };
});
vi.mock("../changeOps", async (original) => ({
  ...(await original<typeof import("../changeOps")>()),
  applyStash: apply,
}));
import { StashesPanel } from "../CommitView";
import { useVcs } from "../store";

beforeEach(() => {
  apply.mockReset();
  useVcs.setState({ root: "/p", roots: ["/p/front", "/p/back"], repo: "/p/front" });
});

it("lists stashes from every root and applies the selected row in its own repository", async () => {
  render(<StashesPanel />);
  expect(await screen.findByText("front · First")).toBeInTheDocument();
  expect(await screen.findByText("back · Second")).toBeInTheDocument();
  act(() => useVcs.setState({ repo: "/p/back" }));
  await screen.findByText("front · First");
  fireEvent.click(screen.getByRole("button", { name: "Apply Stash" }));
  expect(apply).toHaveBeenCalledWith(0, false, "/p/front");
});
