/**
 * ReplayViewerPage — Slice 7 (RiftAtlas parity).
 *
 * Verifies:
 *   - Loads /api/replays/:gameId and renders the timeline
 *   - Step ▶ advances `step / total` counter
 *   - The currently-selected move shows its moveId + playerId
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReplayViewerPage } from "../ReplayViewerPage";

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchByPath(map: Record<string, { status: number; body?: unknown }>) {
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

const SAMPLE_REPLAY = {
  endedAt: "2026-05-14T01:25:00Z",
  guestUserId: "u2",
  hostUserId: "u1",
  id: "g-1",
  moveCount: 3,
  moveLog: [
    { seq: 1, playerId: "player-1", moveId: "playUnit", params: { cardId: "UNL-001" }, success: true },
    { seq: 2, playerId: "player-2", moveId: "endTurn", params: {}, success: true },
    { seq: 3, playerId: "player-1", moveId: "concede", params: {}, success: true },
  ],
  result: "win" as const,
  roomCode: "ABCDEF",
  sessionId: "sess-1",
  startedAt: "2026-05-14T01:00:00Z",
  winnerUserId: "u1",
};

describe("ReplayViewerPage", () => {
  it("renders the timeline once the replay loads", async () => {
    mockFetchByPath({
      "/api/replays/g-1": { body: SAMPLE_REPLAY, status: 200 },
    });
    render(<ReplayViewerPage gameId="g-1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("replay-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("replay-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("replay-timeline-1")).toBeInTheDocument();
    expect(screen.getByTestId("replay-timeline-2")).toBeInTheDocument();
    expect(screen.getByTestId("replay-timeline-3")).toBeInTheDocument();
    expect(screen.getByTestId("replay-progress")).toHaveTextContent("0 / 3");
  });

  it("Step ▶ advances the current step counter", async () => {
    mockFetchByPath({
      "/api/replays/g-1": { body: SAMPLE_REPLAY, status: 200 },
    });
    render(<ReplayViewerPage gameId="g-1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("replay-step-fwd")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("replay-step-fwd"));
    expect(screen.getByTestId("replay-progress")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("replay-step-card")).toHaveTextContent("playUnit");
  });

  it("shows an error when the replay 404s", async () => {
    mockFetchByPath({
      "/api/replays/missing": { body: { error: "Replay not found" }, status: 404 },
    });
    render(<ReplayViewerPage gameId="missing" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("replay-error")).toBeInTheDocument();
    });
  });
});
