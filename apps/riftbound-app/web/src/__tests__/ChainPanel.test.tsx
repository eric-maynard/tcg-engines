/**
 * ChainPanel — Phase B batch 25 EEE.
 *
 * Asserts LIFO render order (top of stack rendered first) and that a
 * countered item is flagged via `data-countered`.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ChainPanel } from "../components/ChainPanel";
import type { ActionsLegal, ChainView } from "../lib/api";

const ALL_LEGAL: ActionsLegal = {
  assignAttacker: false,
  assignDefender: false,
  contestBattlefield: false,
  endTurn: true,
  passChainPriority: true,
  passShowdownFocus: false,
  resolveCombat: false,
  startShowdown: false,
  stepBot: false,
};

describe("ChainPanel", () => {
  it("renders 2-item chain in LIFO order with source names", () => {
    const chain: ChainView = {
      focusOwner: "player-2",
      items: [
        {
          countered: false,
          id: "chain-1",
          source: {
            cardId: "card-bottom",
            cardName: "Burn 3",
            playerId: "player-1",
          },
          summary: "[Spell] Burn 3",
          type: "spell",
        },
        {
          countered: true,
          id: "chain-2",
          source: {
            cardId: "card-top",
            cardName: "Counterspell",
            playerId: "player-2",
          },
          summary: "[Ability] Counterspell",
          type: "ability",
        },
      ],
    };

    render(<ChainPanel chain={chain} />);
    expect(screen.getByTestId("chain-panel")).toBeInTheDocument();
    // Both items render.
    const item1 = screen.getByTestId("chain-item-chain-1");
    const item2 = screen.getByTestId("chain-item-chain-2");
    expect(item1).toBeInTheDocument();
    expect(item2).toBeInTheDocument();
    // LIFO: chain-2 (top of stack) should render FIRST.
    expect(item2.getAttribute("data-lifo-index")).toBe("0");
    expect(item1.getAttribute("data-lifo-index")).toBe("1");
    // Counter flag plumbed through.
    expect(item2.getAttribute("data-countered")).toBe("true");
    expect(item1.getAttribute("data-countered")).toBe("false");
    // Source names rendered (text is split across summary + source spans, so
    // Assert via the items' aggregated textContent).
    expect(item2.textContent ?? "").toContain("Counterspell");
    expect(item1.textContent ?? "").toContain("Burn 3");
    // Focus owner surfaced.
    expect(screen.getByTestId("chain-focus").textContent).toContain("player-2");
  });

  it("renders nothing when chain is undefined", () => {
    const { container } = render(<ChainPanel chain={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when chain has no items", () => {
    const { container } = render(
      <ChainPanel chain={{ focusOwner: "", items: [] }} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("Pass Priority button fires onPassPriority when local seat has focus + legal", () => {
    const chain: ChainView = {
      focusOwner: "player-1",
      items: [
        {
          countered: false,
          id: "c1",
          source: { cardId: "c", playerId: "player-1" },
          summary: "[Spell] x",
          type: "spell",
        },
      ],
    };
    const onPassPriority = vi.fn();
    render(
      <ChainPanel
        chain={chain}
        localPlayerId="player-1"
        actionsLegal={ALL_LEGAL}
        onPassPriority={onPassPriority}
      />,
    );
    const btn = screen.getByTestId("chain-pass-priority");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onPassPriority).toHaveBeenCalledTimes(1);
  });

  it("Pass Priority button is disabled when opponent has focus", () => {
    const chain: ChainView = {
      focusOwner: "player-2",
      items: [
        {
          countered: false,
          id: "c1",
          source: { cardId: "c", playerId: "player-1" },
          summary: "[Spell] x",
          type: "spell",
        },
      ],
    };
    const onPassPriority = vi.fn();
    render(
      <ChainPanel
        chain={chain}
        localPlayerId="player-1"
        actionsLegal={ALL_LEGAL}
        onPassPriority={onPassPriority}
      />,
    );
    const btn = screen.getByTestId("chain-pass-priority");
    expect(btn).toBeDisabled();
  });

  it("renders '(resolving)' fallback when focusOwner is empty string", () => {
    const chain: ChainView = {
      focusOwner: "",
      items: [
        {
          countered: false,
          id: "c1",
          source: { cardId: "c", playerId: "player-1" },
          summary: "[Spell] x",
          type: "spell",
        },
      ],
    };
    render(<ChainPanel chain={chain} />);
    expect(screen.getByTestId("chain-focus").textContent).toContain(
      "(resolving)",
    );
  });
});
