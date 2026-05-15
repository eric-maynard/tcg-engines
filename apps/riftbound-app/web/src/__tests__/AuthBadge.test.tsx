/**
 * AuthBadge — Slice 0 (RiftAtlas parity).
 *
 * Pins the three states the badge renders based on the `/api/auth/me`
 * response. We stub global.fetch directly because the hook uses the
 * native fetch API; the SPA has no global fetch mock, so each test
 * installs its own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AuthBadge } from "../components/AuthBadge";

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchOnce(response: { status: number; body?: unknown }) {
  globalThis.fetch = vi.fn(async () => new Response(
      response.body ? JSON.stringify(response.body) : null,
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      },
    )) as unknown as FetchFn;
}

describe("AuthBadge", () => {
  it("shows the loading placeholder while /api/auth/me is in flight", () => {
    // Never-resolving fetch keeps us in the loading state.
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as FetchFn;
    render(<AuthBadge />);
    expect(screen.getByTestId("auth-badge")).toHaveClass("auth-badge-loading");
  });

  it("shows the Sign in link when the user is unauthenticated (401)", async () => {
    mockFetchOnce({ status: 401 });
    render(<AuthBadge />);
    await waitFor(() => {
      expect(screen.getByTestId("auth-signin-link")).toBeInTheDocument();
    });
    expect(screen.getByTestId("auth-badge")).toHaveClass("auth-badge-anon");
  });

  it("shows the user's display name when logged in", async () => {
    mockFetchOnce({
      body: {
        user: {
          id: "u-1",
          username: "eric",
          displayName: "Eric M.",
        },
      },
      status: 200,
    });
    render(<AuthBadge />);
    await waitFor(() => {
      expect(screen.getByTestId("auth-display-name")).toHaveTextContent(
        "Eric M.",
      );
    });
    expect(screen.getByTestId("auth-signout")).toBeInTheDocument();
  });

  it("falls back to username when displayName is null", async () => {
    mockFetchOnce({
      body: { user: { id: "u-2", username: "anon42", displayName: null } },
      status: 200,
    });
    render(<AuthBadge />);
    await waitFor(() => {
      expect(screen.getByTestId("auth-display-name")).toHaveTextContent(
        "anon42",
      );
    });
  });
});
