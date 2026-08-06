/**
 * Ruling ae63ceaf2b19eed6 — Switcheroo (SFD-145 → sfd-145-221) · Spell · Chaos · 2+[chaos][chaos] · Action, Hidden
 *   "Swap the Might of two units at the same battlefield this turn."
 *
 * Q: How does Switcheroo work?
 * A: It does not exchange Might values directly. It uses Swap (433): take the difference X between the
 *    two units' CURRENT Might at resolution (all modifiers included — buffs, equipment, passives…), then
 *    apply -X to the higher unit and +X to the lower one. Those modifiers last until end of turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";

/**
 * P1's turn with exactly Switcheroo's cost. At bf1: P1's "small" — 2 base Might, BUFFED (+1) → current 3 —
 * and P2's "big" (6). A 9-Might P2 unit sits in base (not at the battlefield; must be unaffected).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small", { buffed: true })
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
    .unit(P2, "base", { might: 9, name: "Elsewhere" }, "elsewhere")
    .hand(P1, SWITCHEROO, "switcheroo");
}

/** Cast Switcheroo on [a, b] — via the targets parameter when the engine exposes one, else a bare cast. */
async function castSwitcheroo(game: Game, a: string, b: string): Promise<void> {
  const opt = game.p1.option("cast", "switcheroo");
  expect(opt).toBeDefined();
  if (opt?.fields.some((f) => f.arg === "targets")) {
    await game.p1.cast("switcheroo", { targets: [a, b] });
  } else {
    await game.p1.cast("switcheroo");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["switcheroo"]);
}

describe("Ruling ae63ceaf2b19eed6 — Switcheroo applies ±X modifiers from CURRENT Might, until end of turn", () => {
  test("premise: small's CURRENT Might is 3 (2 base + buff), big is 6 — the difference X is 3, not 4", async () => {
    const game = await board().build();
    expect(game.state("small")).toMatchObject({ baseMight: 2, isBuffed: true, location: "bf1", might: 3 });
    expect(game.state("big")).toMatchObject({ baseMight: 6, location: "bf1", might: 6 });
  });

  test("resolution: +3 to the lower unit and -3 to the higher (433.1.b) — small 3→6, big 6→3; printed Might is untouched, it is a pair of modifiers", async () => {
    const game = await board().build();
    await castSwitcheroo(game, "small", "big");
    await game.settle();
    expect(game.zoneOf("switcheroo")).toBe("trash");

    const small = game.state("small");
    const big = game.state("big");
    expect(small.might).toBe(6); // 2 base + 1 buff + 3
    expect(big.might).toBe(3); // 6 - 3
    expect(small.baseMight).toBe(2); // not "set to 6"
    expect(big.baseMight).toBe(6); // not "set to 3"
    expect(small.mightModifier).toBe(3);
    expect(big.mightModifier).toBe(-3);
    expect(small.isBuffed).toBe(true); // the buff still exists and is still counted
    expect(game.state("elsewhere").might).toBe(9); // not at the battlefield — untouched
  });

  test("the swap modifiers persist only until end of turn: next turn small is back to 3 and big to 6", async () => {
    const game = await board().build();
    await castSwitcheroo(game, "small", "big");
    await game.settle();
    expect(game.state("small").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("small")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("big")).toMatchObject({ might: 6, mightModifier: 0 });
  });

  // Expected (355.8): "two units at the same battlefield" are caster-chosen targets locked when the spell is
  // played — with three units at bf1 the cast must let P1 name WHICH two (here small + middling: X = 1).
  // Actual: the play offers no target choice at all; on resolution the engine auto-picks the first two
  // units it finds at a battlefield, so P1 cannot direct the swap.
  test.failing("BUG: ruling ae63ceaf2b19eed6 — the caster chooses the two units: with 3 units at bf1, Switcheroo on [small(3), middling(4)] → small 4, middling 3, big untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Small" }, "small", { buffed: true })
      .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
      .unit(P2, "bf1", { might: 4, name: "Middling" }, "middling")
      .hand(P1, SWITCHEROO, "switcheroo")
      .build();
    const field = game.p1.option("cast", "switcheroo")?.fields.find((f) => f.arg === "targets");
    expect(field).toBeDefined();
    await game.p1.cast("switcheroo", { targets: ["small", "middling"] });
    await game.settle();
    expect(game.state("small").might).toBe(4);
    expect(game.state("middling").might).toBe(3);
    expect(game.state("big").might).toBe(6);
  });
});
