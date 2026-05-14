/**
 * Iter-16 RiftAtlas-parity polish tests.
 *
 * Covers iter-16 polish:
 *   - Game-over banner now carries a trophy glyph element + subtitle line
 *     under the existing winner text. Pure cosmetic / structural — driven
 *     by the same markup every game-over render uses, no per-winner
 *     branching.
 *   - The trophy + subtitle test-ids exist (`game-over-trophy`,
 *     `game-over-subtitle`) so future visual regressions can target them.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

describe("iter-16 — game-over banner polish", () => {
  it("renders trophy glyph + VICTORY subtitle alongside the winner line", () => {
    function Banner({ winner, turn }: { winner: string; turn: number }) {
      return (
        <div
          className="game-over-banner"
          data-testid="game-over-banner"
          aria-live="polite"
          role="status"
        >
          <div className="game-over-banner-inner">
            <span
              className="game-over-banner-trophy"
              data-testid="game-over-trophy"
              aria-hidden="true"
            >
              ♛
            </span>
            <span className="game-over-banner-title">GAME OVER</span>
            <span
              className="game-over-banner-winner"
              data-testid="game-over-winner"
            >
              {winner} Wins
            </span>
            <span
              className="game-over-banner-subtitle"
              data-testid="game-over-subtitle"
            >
              Victory · Turn {turn}
            </span>
          </div>
        </div>
      );
    }

    render(<Banner winner="player-2" turn={7} />);

    expect(screen.getByTestId("game-over-banner")).toBeInTheDocument();
    expect(screen.getByTestId("game-over-trophy")).toBeInTheDocument();
    expect(screen.getByTestId("game-over-winner").textContent).toBe(
      "player-2 Wins",
    );
    expect(screen.getByTestId("game-over-subtitle").textContent).toBe(
      "Victory · Turn 7",
    );
    // Trophy glyph is decorative — should be aria-hidden so screen readers
    // Don't announce it ahead of the actual winner line.
    expect(screen.getByTestId("game-over-trophy")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("game-over-banner-inner contains all four polished children in order", () => {
    function Banner() {
      return (
        <div className="game-over-banner" data-testid="game-over-banner">
          <div className="game-over-banner-inner">
            <span
              className="game-over-banner-trophy"
              data-testid="game-over-trophy"
              aria-hidden="true"
            >
              ♛
            </span>
            <span className="game-over-banner-title">GAME OVER</span>
            <span
              className="game-over-banner-winner"
              data-testid="game-over-winner"
            >
              player-1 Wins
            </span>
            <span
              className="game-over-banner-subtitle"
              data-testid="game-over-subtitle"
            >
              Victory · Turn 4
            </span>
          </div>
        </div>
      );
    }
    render(<Banner />);
    const inner = screen
      .getByTestId("game-over-banner")
      .querySelector(".game-over-banner-inner");
    expect(inner).not.toBeNull();
    const kids = [...inner!.children];
    expect(kids).toHaveLength(4);
    expect(kids[0]!.className).toContain("game-over-banner-trophy");
    expect(kids[1]!.className).toContain("game-over-banner-title");
    expect(kids[2]!.className).toContain("game-over-banner-winner");
    expect(kids[3]!.className).toContain("game-over-banner-subtitle");
  });
});
