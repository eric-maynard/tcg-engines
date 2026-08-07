/**
 * Dragon Form — ven-116-166 · Spell · Order · 3 energy
 *
 *   Choose a unit. Its base Might becomes 5 this turn.
 *   [Flow] [3] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "base Might BECOMES 5" is a SET, not a +N: a 2 goes UP to 5, an 8 comes DOWN to 5 — it is removal
 *     as much as it is a pump. Everything layered on top of base Might (buff counter, "+N this turn",
 *     static auras) still applies on top of the new base: a buffed 2 (=3) becomes 5+1 = 6.
 *  2. 142.4.b / 143.2.a — lethal damage is re-evaluated against the new Might: an 8-Might unit carrying
 *     6 damage that becomes base 5 now has lethal damage and is killed in the next Cleanup.
 *  3. "a unit": ANY unit — friendly or enemy, base or battlefield; no unit anywhere → unplayable (355).
 *  4. "this turn": across the turn boundary the printed base returns (2 is 2 again, 8 is 8 again).
 *  5. Flow (829): from the trash for [3] (coincidentally the same as the hand cost), same standard timing
 *     (not on the opponent's turn, not in a showdown), then BANISHED — each copy Flows once; the hand
 *     cast lands in the trash and can Flow later the same turn (6 energy for two uses).
 *  6. Combat relevance: cast on your 2-Might attacker BEFORE moving in (standard speed) → it fights at 5
 *     and beats a 4-Might defender it would otherwise lose to.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-116-166";

/** P1's turn, 6 energy; P1: Cub(2) in base; P2: Giant(8) at bf1, Guard(4) at bf2; Dragon Form in hand + a copy in trash. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Cub" }, "cub")
    .unit(P2, "bf1", { might: 8, name: "Giant" }, "giant")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .hand(P1, CARD, "form")
    .trash(P1, CARD, "formTrash");
}

const targetsOf = (game: Game, card: string) => game.p1.option("cast", card)?.fields.find((f) => f.arg === "targets")?.options;

describe("Dragon Form (ven-116-166)", () => {
  test("affordability: 3 energy, no power — castable at 3, not at 2; standard speed → not on the opponent's turn", async () => {
    expect((await board().resources(P1, { energy: 3 }).build()).p1.can("cast", "form")).toBe(true);
    expect((await board().resources(P1, { energy: 2 }).build()).p1.can("cast", "form")).toBe(false);
    expect((await board().active(P2).build()).p1.can("cast", "form")).toBe(false);
  });

  // BUG — expected: "Choose a unit" is a play-time target over EVERY unit on the board (both sides, base and
  // battlefields); casting on the Cub deducts 3 and puts one item on the chain. Actual: the effect parsed as
  // a `raw` static, so the spell has no target at all and `targets: "cub"` is rejected.
  test("targets any unit (cub | giant | guard); cast on Cub pays exactly 3 energy and goes on the chain", async () => {
    const game = await board().build();
    expect(targetsOf(game, "form")).toHaveLength(3);
    expect(targetsOf(game, "form")).toEqual(expect.arrayContaining([["cub"], ["giant"], ["guard"]]));
    await game.p1.cast("form", { targets: "cub" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "form", controller: P1, triggered: false })]);
  });

  // BUG — expected: the 2-Might Cub's base Might becomes 5 → it reads 5; spell to trash. Actual: no target / no effect.
  test("a 2-Might unit becomes 5 this turn; the spell goes to the trash", async () => {
    const game = await board().build();
    await game.p1.cast("form", { targets: "cub" });
    await game.settle();
    expect(game.state("cub").might).toBe(5);
    expect(game.zoneOf("form")).toBe("trash");
  });

  // BUG — expected: SET semantics — the enemy 8-Might Giant becomes 5 (a reduction), usable on enemy units.
  test("'becomes 5' also SHRINKS — the enemy 8-Might Giant reads 5 after resolution", async () => {
    const game = await board().build();
    await game.p1.cast("form", { targets: "giant" });
    await game.settle();
    expect(game.state("giant").might).toBe(5);
    expect(game.zoneOf("giant")).toBe("battlefield-bf1"); // undamaged → merely smaller, not dead
  });

  // BUG — expected: modifiers stack on the new base: buffed (+1) Cub → 5 + 1 = 6; a Cub with "+2 this turn" → 7.
  test("layers on top of base survive — a buffed Cub becomes 6, a Cub at +2 this turn becomes 7", async () => {
    const buffed = await board().unit(P1, "base", { might: 2, name: "Buffed Cub" }, "bcub", { buffed: true }).build();
    expect(buffed.state("bcub").might).toBe(3);
    await buffed.p1.cast("form", { targets: "bcub" });
    await buffed.settle();
    expect(buffed.state("bcub").might).toBe(6);
    const pumped = await board().unit(P1, "base", { might: 2, name: "Pumped Cub" }, "pcub", { mightModifier: 2 }).build();
    expect(pumped.state("pcub").might).toBe(4);
    await pumped.p1.cast("form", { targets: "pcub" });
    await pumped.settle();
    expect(pumped.state("pcub").might).toBe(7);
  });

  // BUG — expected (142.4.b example / 143.2.a / 323.5): the Giant (8) carrying 6 damage becomes base 5 → 6 ≥ 5
  // is lethal → killed in the Cleanup right after the spell resolves and put in its OWNER's (P2's) trash.
  test("shrinking below marked damage kills — Giant (8) with 6 damage becomes 5 and dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 8, name: "Giant" }, "giant", { damage: 6 })
      .hand(P1, CARD, "form")
      .build();
    expect(game.state("giant")).toMatchObject({ damage: 6, might: 8 });
    await game.p1.cast("form", { targets: "giant" });
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.p2.trash()).toContain("giant");
  });

  // BUG — expected: "this turn" — next turn the Cub is 2 again and the Giant 8 again.
  test("expires at end of turn — Cub back to 2 on the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.cast("form", { targets: "cub" });
    await game.settle();
    expect(game.state("cub").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("cub").might).toBe(2);
  });

  // BUG — expected: the real use — Form the Cub (2→5) in the Neutral Open state, THEN attack the lone 4-Might
  // Guard: 5 v 4, Guard dies, Cub survives with 4 damage and conquers bf2 for a point.
  test("Form then attack — the 5-Might Cub kills the 4-Might Guard and conquers bf2", async () => {
    const game = await board().build();
    await game.p1.cast("form", { targets: "cub" });
    await game.settle();
    await game.p1.move("cub", "bf2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("cub")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative control (no spell): the un-Formed 2-Might Cub attacking the 4-Might Guard just dies", async () => {
    const game = await board().build();
    await game.p1.move("cub", "bf2");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  // BUG — expected (355): with no unit anywhere on the board there is nothing to choose → not castable.
  // Actual: castable (no target descriptor at all).
  test("no unit on the board → not castable", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "form").build();
    expect(game.p1.can("cast", "form")).toBe(false);
  });

  test("Flow is offered from the trash for [3]; with 2 energy it is not; never on the opponent's turn or inside a showdown (829.1.b.2)", async () => {
    const game = await board().resources(P1, { energy: 3 }).build();
    expect(game.p1.can("cast", "formTrash")).toBe(true);
    expect(game.p1.option("cast", "formTrash")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    expect((await board().resources(P1, { energy: 2 }).build()).p1.can("cast", "formTrash")).toBe(false);
    expect((await board().active(P2).build()).p1.can("cast", "formTrash")).toBe(false);
    const sd = await board().build();
    await sd.p1.move("cub", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("cast", "form")).toBe(false);
    expect(sd.p1.can("cast", "formTrash")).toBe(false);
  });

  // BUG — expected (829): Flow from trash for 3 → Cub becomes 5 → card BANISHED (not trashed) and gone for good;
  // then the hand copy for 3 more onto the Giant → lands in the trash (Flow-able later). 6 energy total.
  test("Flow — trash copy for [3] resolves and is banished; the hand copy afterwards goes to the trash; both effects apply", async () => {
    const game = await board().build();
    await game.p1.cast("formTrash", { flow: true, targets: "cub" });
    expect(game.p1.energy()).toBe(3);
    await game.settle();
    expect(game.state("cub").might).toBe(5);
    expect(game.zoneOf("formTrash")).toBe("banishment");
    expect(game.p1.can("cast", "formTrash")).toBe(false);
    await game.p1.cast("form", { targets: "giant" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("giant").might).toBe(5);
    expect(game.zoneOf("form")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("registry payload — 3-energy Order spell at standard timing with Flow [3] as its keyword ability", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 3, name: "Dragon Form", timing: "standard" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[1]).toEqual({ cost: { energy: 3 }, keyword: "Flow", type: "keyword" });
  });

  // BUG (parse) — expected: the first ability is a `spell` effect that targets a unit and sets its base Might
  // to 5 for the turn. Actual: `{type:"static", effect:{type:"raw", text:"Choose a unit. Its base Might becomes 5 this turn."}}`.
  test("registry payload — main ability must be a targeted spell effect (set base Might 5, duration turn), not a raw static", async () => {
    const pool = await loadDefaultCardPool();
    const main = pool.get(CARD)?.abilities?.[0] as { type?: string; effect?: { type?: string; target?: unknown; duration?: string } } | undefined;
    expect(main?.type).toBe("spell");
    expect(main?.effect?.type).not.toBe("raw");
    expect(main?.effect?.target).toMatchObject({ type: "unit" });
    expect(JSON.stringify(main)).toContain("5");
    expect(JSON.stringify(main)).toContain('"turn"');
  });
});
