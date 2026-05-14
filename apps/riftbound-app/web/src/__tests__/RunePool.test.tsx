/**
 * RunePool — Iter-RunePoolUI.
 *
 * Players need to SEE each rune as an individual clickable chip and CLICK
 * to tap (exhaust) it — instead of the prior "12" count pill. These tests
 * pin the chip rendering, exhausted styling, click dispatch, domain colors,
 * and the opponent read-only mode.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RunePool, type RunePoolItem } from "../components/RunePool";

function makeRune(
  overrides: Partial<RunePoolItem> & { id: string; owner: string },
): RunePoolItem {
  return {
    definitionId: overrides.definitionId ?? `def-${overrides.id}`,
    domain: overrides.domain ?? "body",
    exhausted: overrides.exhausted,
    id: overrides.id,
    imageUrl: overrides.imageUrl,
    name: overrides.name,
    owner: overrides.owner,
  };
}

describe("RunePool", () => {
  it("renders one chip per rune in runesInPool for the given player", () => {
    const runes: RunePoolItem[] = [
      makeRune({ domain: "body", id: "r1", owner: "player-1" }),
      makeRune({ domain: "mind", id: "r2", owner: "player-1" }),
      makeRune({ domain: "fury", id: "r3", owner: "player-1" }),
      // Other-player rune should NOT render in player-1's pool.
      makeRune({ domain: "calm", id: "r4", owner: "player-2" }),
    ];
    render(
      <RunePool
        runes={runes}
        playerId="player-1"
        isLocalPlayer
        onExhaust={() => {}}
      />,
    );
    expect(screen.getByTestId("rune-chip-r1")).toBeInTheDocument();
    expect(screen.getByTestId("rune-chip-r2")).toBeInTheDocument();
    expect(screen.getByTestId("rune-chip-r3")).toBeInTheDocument();
    // Opponent's rune is filtered out of player-1's pool.
    expect(screen.queryByTestId("rune-chip-r4")).toBeNull();
    // Pool's data attributes reflect the count.
    const pool = screen.getByTestId("rune-pool-player-1");
    expect(pool.getAttribute("data-rune-count")).toBe("3");
    expect(pool.getAttribute("data-ready-count")).toBe("3");
  });

  it("applies .rune-chip-exhausted class to exhausted runes", () => {
    const runes: RunePoolItem[] = [
      makeRune({ domain: "body", exhausted: true, id: "r1", owner: "player-1" }),
      makeRune({ domain: "body", id: "r2", owner: "player-1" }),
    ];
    render(
      <RunePool
        runes={runes}
        playerId="player-1"
        isLocalPlayer
        onExhaust={() => {}}
      />,
    );
    const exhausted = screen.getByTestId("rune-chip-r1");
    expect(exhausted.className).toContain("rune-chip-exhausted");
    expect(exhausted.getAttribute("data-exhausted")).toBe("true");
    const ready = screen.getByTestId("rune-chip-r2");
    expect(ready.className).not.toContain("rune-chip-exhausted");
    expect(ready.getAttribute("data-exhausted")).toBe("false");
    // Ready-count reflects only the non-exhausted chip.
    const pool = screen.getByTestId("rune-pool-player-1");
    expect(pool.getAttribute("data-ready-count")).toBe("1");
    expect(pool.getAttribute("data-rune-count")).toBe("2");
  });

  it("dispatches onExhaust(runeId) when a ready friendly chip is clicked", () => {
    const onExhaust = vi.fn();
    const runes: RunePoolItem[] = [
      makeRune({ domain: "body", id: "r1", owner: "player-1" }),
    ];
    render(
      <RunePool
        runes={runes}
        playerId="player-1"
        isLocalPlayer
        onExhaust={onExhaust}
      />,
    );
    fireEvent.click(screen.getByTestId("rune-chip-r1"));
    expect(onExhaust).toHaveBeenCalledTimes(1);
    expect(onExhaust).toHaveBeenCalledWith("r1");
  });

  it("does not dispatch onExhaust when an exhausted chip is clicked", () => {
    const onExhaust = vi.fn();
    const runes: RunePoolItem[] = [
      makeRune({ domain: "body", exhausted: true, id: "r1", owner: "player-1" }),
    ];
    render(
      <RunePool
        runes={runes}
        playerId="player-1"
        isLocalPlayer
        onExhaust={onExhaust}
      />,
    );
    const chip = screen.getByTestId("rune-chip-r1");
    // Disabled buttons swallow synthetic clicks — assert disabled + no callback.
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(onExhaust).not.toHaveBeenCalled();
  });

  it("does not dispatch onExhaust when an opponent chip is clicked", () => {
    const onExhaust = vi.fn();
    const runes: RunePoolItem[] = [
      makeRune({ domain: "body", id: "r1", owner: "player-2" }),
    ];
    render(
      <RunePool
        runes={runes}
        playerId="player-2"
        isLocalPlayer={false}
        onExhaust={onExhaust}
      />,
    );
    const chip = screen.getByTestId("rune-chip-r1");
    expect(chip.className).toContain("rune-chip-opponent");
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(onExhaust).not.toHaveBeenCalled();
  });

  it("applies the correct domain-color class for each of the 6 domains", () => {
    const domains = ["body", "mind", "chaos", "calm", "fury", "order"] as const;
    const runes: RunePoolItem[] = domains.map((d, i) =>
      makeRune({ domain: d, id: `r${i}`, owner: "player-1" }),
    );
    render(
      <RunePool
        runes={runes}
        playerId="player-1"
        isLocalPlayer
        onExhaust={() => {}}
      />,
    );
    for (const [i, d] of domains.entries()) {
      const chip = screen.getByTestId(`rune-chip-r${i}`);
      expect(chip.className).toContain(`rune-chip-${d}`);
      expect(chip.getAttribute("data-domain")).toBe(d);
    }
  });

  it("renders an empty-state when the player has no runes", () => {
    render(
      <RunePool
        runes={[]}
        playerId="player-1"
        isLocalPlayer
        onExhaust={() => {}}
      />,
    );
    expect(screen.getByTestId("rune-pool-empty-player-1")).toBeInTheDocument();
  });

  it("normalises uppercase domain strings via lowercase data-domain", () => {
    const runes: RunePoolItem[] = [
      // Simulate engine slip where domain came through capitalised; the
      // Component should still pick the right CSS class via lowercase compare.
      makeRune({ domain: "Body", id: "r1", owner: "player-1" }),
    ];
    render(
      <RunePool
        runes={runes}
        playerId="player-1"
        isLocalPlayer
        onExhaust={() => {}}
      />,
    );
    const chip = screen.getByTestId("rune-chip-r1");
    expect(chip.className).toContain("rune-chip-body");
    expect(chip.getAttribute("data-domain")).toBe("body");
  });
});
