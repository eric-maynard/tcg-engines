/**
 * Iter-20 RiftAtlas-parity polish tests (PowerGlyphs gem refactor).
 *
 * Covers iter-20 gaps:
 *   Gap 1 — Power glyphs render as color-keyed circular gems with a
 *           count overlay and a small identifying mark (★ for energy,
 *           first letter otherwise). Zero-count gems carry the
 *           `power-glyph-dim` modifier so they read as "empty".
 *
 *   Gap 2 — A summary chip ("TOTAL: N energy + M power") renders below
 *           the gem row as a glanceable tally. Pure data-driven.
 *
 *   Gap 3 — When the player is active, the whole row carries
 *           `power-glyphs-active` so a CSS pulse can apply. Inactive
 *           rows do NOT carry the modifier.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PowerGlyphs } from "../components/PowerGlyphs";

describe("iter-20 — PowerGlyphs gem visual upgrade", () => {
  it("Gap 1: each glyph has a gem layer, an identifying mark, and a count", () => {
    render(
      <PowerGlyphs
        energy={3}
        power={{ body: 2, mind: 0 }}
        testId="pg"
      />,
    );
    const energy = screen.getByTestId("pg-energy");
    expect(energy.querySelector(".power-glyph-gem")).not.toBeNull();
    expect(energy.querySelector(".power-glyph-mark")).not.toBeNull();
    expect(energy.querySelector(".power-glyph-count")).toHaveTextContent("3");
    expect(energy).toHaveAttribute("data-kind", "energy");
    expect(energy).toHaveAttribute("data-count", "3");
    // Body gem is not dim (count > 0).
    const body = screen.getByTestId("pg-body");
    expect(body).toHaveAttribute("data-dim", "false");
    // Mind gem is dim (count === 0).
    const mind = screen.getByTestId("pg-mind");
    expect(mind).toHaveAttribute("data-dim", "true");
    expect(mind.className).toContain("power-glyph-dim");
  });

  it("Gap 1: gems carry a per-kind color via the --gem-color CSS variable", () => {
    render(
      <PowerGlyphs energy={1} power={{ body: 1, mind: 1 }} testId="pgc" />,
    );
    const energy = screen.getByTestId("pgc-energy") as HTMLElement;
    const body = screen.getByTestId("pgc-body") as HTMLElement;
    const mind = screen.getByTestId("pgc-mind") as HTMLElement;
    // Inline style assigns --gem-color; the resolved values are the
    // Canonical hex codes from POWER_COLORS.
    expect(energy.style.getPropertyValue("--gem-color")).toBe("#d4af3c");
    expect(body.style.getPropertyValue("--gem-color")).toBe("#c25060");
    expect(mind.style.getPropertyValue("--gem-color")).toBe("#5a8fdf");
  });

  it("Gap 2: summary chip totals energy + sum of power counts", () => {
    render(
      <PowerGlyphs
        energy={3}
        power={{ body: 2, fury: 4, mind: 1 }}
        testId="pgs"
      />,
    );
    const summary = screen.getByTestId("pgs-summary");
    expect(summary).toBeInTheDocument();
    expect(summary.textContent).toContain("3 energy");
    expect(summary.textContent).toContain("7 power");
  });

  it("Gap 2: summary chip works with an empty power map", () => {
    render(<PowerGlyphs energy={0} power={{}} testId="pge" />);
    const summary = screen.getByTestId("pge-summary");
    expect(summary.textContent).toContain("0 energy");
    expect(summary.textContent).toContain("0 power");
  });

  it("Gap 3: active flag adds `power-glyphs-active` modifier; inactive does not", () => {
    const { rerender } = render(
      <PowerGlyphs energy={1} power={{}} active={false} testId="pga" />,
    );
    const row = screen.getByTestId("pga");
    expect(row.className).not.toContain("power-glyphs-active");
    expect(row).toHaveAttribute("data-active", "false");

    rerender(
      <PowerGlyphs energy={1} power={{}} active testId="pga" />,
    );
    const rowActive = screen.getByTestId("pga");
    expect(rowActive.className).toContain("power-glyphs-active");
    expect(rowActive).toHaveAttribute("data-active", "true");
  });
});
