/**
 * Iter-21 RiftAtlas-parity polish tests (DeckPile stacked-back refresh).
 *
 * Covers iter-21 gaps:
 *   Gap 1 — DeckPile renders three offset card-back layers (back / mid /
 *           top) so the pile reads as a stack of physical cards. The
 *           top tile carries a variant glyph. A pill count badge with
 *           a gold ring floats in the top-right corner.
 *
 *   Gap 2 — Variant tints are color-keyed via the `deck-pile-{variant}`
 *           class and expose `data-variant` for tests.
 *
 *   Gap 3 — When `size === 0` the stack is replaced with an outlined
 *           empty frame containing a strikethrough zero, and the
 *           component carries `data-empty="true"` + a `deck-pile-empty`
 *           modifier so it reads as a depleted pile at a glance.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeckPile } from "../components/DeckPile";

describe("iter-21 — DeckPile stacked card-back refresh", () => {
  it("Gap 1: non-empty pile renders 3 offset card-back layers", () => {
    render(<DeckPile size={30} label="deck" testId="dp" variant="deck" />);
    const root = screen.getByTestId("dp");
    const layers = root.querySelectorAll(".deck-pile-card");
    expect(layers.length).toBe(3);
    // Layers are ordered back -> mid -> top.
    expect(layers[0].getAttribute("data-layer")).toBe("back");
    expect(layers[1].getAttribute("data-layer")).toBe("mid");
    expect(layers[2].getAttribute("data-layer")).toBe("top");
  });

  it("Gap 1: only the top layer carries the variant glyph", () => {
    render(<DeckPile size={5} testId="dp-g" variant="deck" />);
    const root = screen.getByTestId("dp-g");
    const glyphs = root.querySelectorAll(".deck-pile-glyph");
    expect(glyphs.length).toBe(1);
    // Glyph lives inside the top layer.
    const top = root.querySelector(".deck-pile-card-top");
    expect(top?.querySelector(".deck-pile-glyph")).not.toBeNull();
  });

  it("Gap 1: count badge is present with the size value", () => {
    render(<DeckPile size={42} testId="dp-c" />);
    expect(screen.getByTestId("dp-c-count")).toHaveTextContent("42");
    // Count badge sits inside the pile.
    const count = screen.getByTestId("dp-c-count");
    expect(count.className).toContain("deck-pile-count");
  });

  it("Gap 2: variant exposes `data-variant` and class modifier", () => {
    const { rerender } = render(
      <DeckPile size={10} testId="dp-v" variant="deck" />,
    );
    let root = screen.getByTestId("dp-v");
    expect(root).toHaveAttribute("data-variant", "deck");
    expect(root.className).toContain("deck-pile-deck");

    rerender(<DeckPile size={10} testId="dp-v" variant="rune" />);
    root = screen.getByTestId("dp-v");
    expect(root).toHaveAttribute("data-variant", "rune");
    expect(root.className).toContain("deck-pile-rune");

    rerender(<DeckPile size={10} testId="dp-v" variant="trash" />);
    root = screen.getByTestId("dp-v");
    expect(root).toHaveAttribute("data-variant", "trash");
    expect(root.className).toContain("deck-pile-trash");
  });

  it("Gap 2: each variant renders its own glyph character", () => {
    const { rerender } = render(
      <DeckPile size={3} testId="dp-gl" variant="deck" />,
    );
    let glyph = screen
      .getByTestId("dp-gl")
      .querySelector(".deck-pile-glyph") as HTMLElement;
    expect(glyph.textContent).toBe("☼");

    rerender(<DeckPile size={3} testId="dp-gl" variant="rune" />);
    glyph = screen
      .getByTestId("dp-gl")
      .querySelector(".deck-pile-glyph") as HTMLElement;
    expect(glyph.textContent).toBe("⛤");

    rerender(<DeckPile size={3} testId="dp-gl" variant="trash" />);
    glyph = screen
      .getByTestId("dp-gl")
      .querySelector(".deck-pile-glyph") as HTMLElement;
    expect(glyph.textContent).toBe("🗑");
  });

  it("Gap 3: empty pile (size === 0) replaces the stack with an outlined zero", () => {
    render(<DeckPile size={0} testId="dp-empty" variant="trash" />);
    const root = screen.getByTestId("dp-empty");
    expect(root).toHaveAttribute("data-empty", "true");
    expect(root.className).toContain("deck-pile-empty");

    // No stacked card layers when empty.
    expect(root.querySelectorAll(".deck-pile-card").length).toBe(0);

    // Empty frame with a strikethrough zero is rendered instead.
    const empty = screen.getByTestId("dp-empty-empty");
    expect(empty.className).toContain("deck-pile-empty-frame");
    expect(empty.querySelector(".deck-pile-empty-zero")).not.toBeNull();
    expect(empty.querySelector(".deck-pile-empty-zero")?.textContent).toBe("0");

    // Count badge still renders showing 0.
    expect(screen.getByTestId("dp-empty-count")).toHaveTextContent("0");
  });

  it("Gap 3: non-empty pile is NOT marked empty", () => {
    render(<DeckPile size={1} testId="dp-ne" variant="deck" />);
    const root = screen.getByTestId("dp-ne");
    expect(root).toHaveAttribute("data-empty", "false");
    expect(root.className).not.toContain("deck-pile-empty");
    expect(root.querySelector(".deck-pile-empty-frame")).toBeNull();
  });
});
