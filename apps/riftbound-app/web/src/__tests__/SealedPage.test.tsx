/**
 * SealedPage — Slice 6 (RiftAtlas parity).
 *
 * Verifies that the sealed landing page:
 *   - Renders the heading + Open Pool button on mount with no pool
 *   - Clicking "Open Pool" fetches a pool and renders the grid
 *   - Clicking a card toggles its picked state and updates the counter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SealedPage } from "../SealedPage";

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchByPath(
  map: Record<string, { status: number; body?: unknown }>,
) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [k, v] of Object.entries(map)) {
      if (url.startsWith(k)) {
        return new Response(v.body ? JSON.stringify(v.body) : null, {
          headers: { "Content-Type": "application/json" },
          status: v.status,
        });
      }
    }
    return new Response(null, { status: 404 });
  }) as unknown as FetchFn;
}

describe("SealedPage", () => {
  it("renders the heading and open-pool button initially", () => {
    mockFetchByPath({});
    render(<SealedPage />);
    expect(screen.getByTestId("sealed-page")).toBeInTheDocument();
    expect(screen.getByTestId("sealed-open-button")).toBeInTheDocument();
    expect(screen.queryByTestId("sealed-pool-grid")).not.toBeInTheDocument();
  });

  it("opens a pool and renders the grid", async () => {
    mockFetchByPath({
      "/api/sealed/open-pool": {
        body: {
          packs: 6,
          poolCards: [
            { cardId: "c-1", cardType: "unit", name: "Alpha", rarity: "common" },
            { cardId: "c-2", cardType: "spell", name: "Beta", rarity: "rare" },
            { cardId: "c-3", cardType: "unit", name: "Gamma", rarity: "epic" },
          ],
          seed: "test-seed-abc",
        },
        status: 200,
      },
    });
    render(<SealedPage />);
    fireEvent.click(screen.getByTestId("sealed-open-button"));
    await waitFor(() => {
      expect(screen.getByTestId("sealed-pool-grid")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sealed-card-0")).toBeInTheDocument();
    expect(screen.getByTestId("sealed-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("sealed-card-2")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("toggles picked state on click and updates the counter", async () => {
    mockFetchByPath({
      "/api/sealed/open-pool": {
        body: {
          packs: 6,
          poolCards: [
            { cardId: "c-1", cardType: "unit", name: "Alpha", rarity: "common" },
            { cardId: "c-2", cardType: "spell", name: "Beta", rarity: "rare" },
          ],
          seed: "test-seed-abc",
        },
        status: 200,
      },
    });
    render(<SealedPage />);
    fireEvent.click(screen.getByTestId("sealed-open-button"));
    await waitFor(() => {
      expect(screen.getByTestId("sealed-pool-grid")).toBeInTheDocument();
    });
    const counter = screen.getByTestId("sealed-counter");
    expect(counter.textContent).toContain("0 / 30");
    fireEvent.click(screen.getByTestId("sealed-card-0"));
    expect(counter.textContent).toContain("1 / 30");
    fireEvent.click(screen.getByTestId("sealed-card-1"));
    expect(counter.textContent).toContain("2 / 30");
    // Toggle off
    fireEvent.click(screen.getByTestId("sealed-card-0"));
    expect(counter.textContent).toContain("1 / 30");
  });
});
