/**
 * Ruling 87840cfc387e711a — Drag Under (SFD-164 → sfd-164-221) · Action · Order · [5][order]
 *   "I cost [2] less to play from anywhere other than your hand. Kill a unit at a battlefield."
 *   × Glasc Mixologist (sfd-165-221) "[Deathknell] — You may play a UNIT with cost no more than [3] and no
 *     more than [rainbow] from your trash, ignoring its cost."
 *   × Sacrifice (unl-173-219) — used only to kill the Mixologist as an additional cost.
 *
 * Q: Does the Mixologist's Deathknell work with Drag Under?
 * A: No, twice over: Drag Under is a spell, not a unit, and its cost is the PRINTED [5][order] — the card's
 *    own "[2] less from anywhere other than your hand" discount does not lower the number the Deathknell reads.
 * Rules: 206 (cost checks use the printed cost), 419.2 (the effect's own type/cost filter).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const MIXOLOGIST = "sfd-165-221";
const DRAG_UNDER = "sfd-164-221";
const SACRIFICE = "unl-173-219";
const RECRUIT = { cardType: "unit", energyCost: 1, might: 2, name: "Recruit" };

/** P1's turn: a 5-Might (so [Mighty]) Mixologist in base, Sacrifice in hand, Drag Under + a Recruit in the trash. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", MIXOLOGIST, "mixo")
    .hand(P1, SACRIFICE, "sac")
    .trash(P1, DRAG_UNDER, "drag")
    .trash(P1, RECRUIT, "recruit");
}

describe("Ruling 87840cfc387e711a — Glasc Mixologist's Deathknell never offers Drag Under", () => {
  test("Drag Under's printed cost is [5] + one Power pip even though it would cost [2] less from the trash", async () => {
    const game = await board().build();
    expect(game.state("drag").energyCost).toBe(5);
    expect(game.state("drag").cardType).toBe("spell");
  });

  test("killing the Mixologist offers only the Recruit — Drag Under is neither a unit nor within the printed [3]", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "mixo" });
    expect(game.zoneOf("mixo")).toBe("trash");

    let offered: string[] | undefined;
    for (let i = 0; i < 12; i++) {
      const stop = await game.settle();
      const d: Decision | null = game.decision();
      if (stop.reason !== "unanswered" || !d) break;
      if (d.kind === "yes-no") {
        await game.seat(d.seat).yes();
      } else if (d.kind === "pick") {
        if (d.semantics === "from-revealed") offered = d.options.map((o) => o.card ?? o.key);
        await game.seat(d.seat).pick(d.options.find((o) => (o.card ?? o.key) === "recruit")?.key ?? d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(offered).toBeDefined();
    expect(offered).not.toContain("drag");
    expect(offered).toContain("recruit");

    await game.settle();
    expect(game.zoneOf("drag")).toBe("trash"); // untouched
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
