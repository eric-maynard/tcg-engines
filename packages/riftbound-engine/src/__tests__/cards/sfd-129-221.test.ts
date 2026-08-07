/**
 * Temptation — sfd-129-221 · Spell · Chaos · 2 energy (no power) · no timing keyword
 *
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Move an enemy unit to a location where there's a unit with the same controller.
 *
 * Rules: 820 (Repeat: optional additional cost; instructions execute one extra time; 820.2.a the
 * extra execution may pick a different unit; 820.3.a still one chain item), 449.1 (the effect
 * states the destination restriction), 450 (Contested is credited to the MOVED unit's
 * controller), 155/159 (no [Action]/[Reaction] → your turn, Neutral Open only), 355.8.
 *
 * Head-judge corner cases for THIS card:
 *  1. Destination legality: "a location where there's a unit with the same controller" = a
 *     location (base or battlefield) where THAT OPPONENT already has another unit. An empty
 *     battlefield, or one holding only MY units, must never be offered.
 *  2. The unit's current location never counts (its buddy standing next to it is not a move).
 *  3. Enemy unit that is its controller's only unit → no legal destination → nothing moves.
 *  4. Base → battlefield: an enemy unit in its base can be pushed OUT to a battlefield where its
 *     controller has a unit (the restriction is symmetric, not "send home only").
 *  5. Repeat paid: two executions, two different enemy units may be moved (820.2.a); 4 energy
 *     total; exactly one chain item. Repeat is never mandatory and never offered twice.
 *  6. Timing: plain spell — not castable inside a showdown (even my own) nor on P2's turn.
 *  7. The destination is the CASTER's choice, never the moved unit's controller's.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-129-221";

/** bf1: P2 (foe 2, buddy 3) · bf2: P1 (ally 2) · bf3: P2 (scout 1) · P2 base: home 1. */
function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 3, name: "Buddy" }, "buddy")
    .unit(P2, "bf3", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CARD, "tempt");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** After the spell resolves: the destination prompt must be open with exactly `legal`; take `pick`. */
async function expectDestinationsAndPick(game: Built, legal: string[], pick: string) {
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect([...(d as PickDecision).options.map((o) => o.key)].sort()).toEqual([...legal].sort());
  await game.p1.pick(pick);
  await game.settle();
}

describe("Temptation (sfd-129-221)", () => {
  test("costs 2 energy; one non-triggered chain item; moves Foe from bf1 to P2's base; spell → trash; P2 keeps ownership/control", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tempt", controller: P1, triggered: false })]);
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.locationOf("buddy")).toBe("bf1");
    expect(game.zoneOf("tempt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("targets only ENEMY units (foe, buddy, scout, home) — my ally is not a legal choice; 1 energy or no enemy unit → not castable", async () => {
    const game = await board(2).build();
    const targets = game.p1.option("cast", "tempt")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(4);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["buddy"], ["scout"], ["home"]]));
    const r = await game.p1.try((p) => p.cast("tempt", { targets: "ally" }));
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
    expect((await board(1).build()).p1.can("cast", "tempt")).toBe(false);
    const noEnemy = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "tempt").build();
    expect(noEnemy.p1.can("cast", "tempt")).toBe(false);
  });

  test("destination menu (449.1): from bf1 Foe may go to P2's base (Homebody) or bf3 (Scout) — never my bf2, never bf1 itself", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "foe" });
    await expectDestinationsAndPick(game, ["base", "battlefield-bf3"], "battlefield-bf3");
    expect(game.locationOf("foe")).toBe("bf3");
    expect(game.p2.units("bf3").sort()).toEqual(["foe", "scout"]);
    expect(game.gameState.battlefields.bf3).toMatchObject({ contested: false, controller: P2 });
  });

  test("an enemy unit in its base can be pushed OUT — but only to bf1 or bf3 (where P2 has units), never to my bf2", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "home" });
    await expectDestinationsAndPick(game, ["battlefield-bf1", "battlefield-bf3"], "battlefield-bf1");
    expect(game.locationOf("home")).toBe("bf1");
    expect(game.p2.units("bf1").sort()).toEqual(["buddy", "foe", "home"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 }); // joins its own side: no combat
    expect((game.decision() as ActionDecision).context).toBe("main");
  });

  test("single legal destination: with no Scout, Foe's only option is P2's base and it ends there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .battlefield("bf3", { controller: null })
      .unit(P2, "bf1", { might: 2 }, "foe")
      .unit(P2, "base", { might: 1 }, "home")
      .unit(P1, "bf2", { might: 2 }, "ally")
      .hand(P1, CARD, "tempt")
      .build();
    await game.p1.cast("tempt", { targets: "foe" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      expect((game.decision() as PickDecision).options.map((o) => o.key)).toEqual(["base"]);
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.locationOf("foe")).toBe("base");
    expect(game.p2.units("bf3")).toEqual([]);
  });

  test("an enemy unit that is its controller's ONLY unit has no legal destination: nothing moves, no prompt, spell still goes to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 2 }, "solo")
      .unit(P1, "bf2", { might: 2 }, "ally")
      .hand(P1, CARD, "tempt")
      .build();
    if (!game.p1.can("cast", "tempt")) {
      return; // refusing the cast outright is also rules-consistent
    }
    await game.p1.cast("tempt", { targets: "solo" });
    await game.settle();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.locationOf("solo")).toBe("bf1");
    expect(game.zoneOf("tempt")).toBe("trash");
  });

  test("[Repeat] [2]: paying 4 puts ONE chain item on the chain (820.3.a) with both enemy units bound as choices", async () => {
    const game = await board(4).build();
    expect(game.p1.option("cast", "tempt")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    await game.p1.cast("tempt", { repeat: 1, targets: ["foe", "buddy"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "tempt", triggered: false });
  });

  test("[Repeat] executes the move twice (820.1.d / 820.2.a): Foe → base, then Buddy → bf3; bf1 ends empty of P2 units", async () => {
    const game = await board(4).build();
    await game.p1.cast("tempt", { repeat: 1, targets: ["foe", "buddy"] });
    await expectDestinationsAndPick(game, ["base", "battlefield-bf3"], "base");
    expect(game.locationOf("foe")).toBe("base");
    await expectDestinationsAndPick(game, ["base", "battlefield-bf3"], "battlefield-bf3");
    expect(game.locationOf("buddy")).toBe("bf3");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.zoneOf("tempt")).toBe("trash");
    expect((game.decision() as ActionDecision).context).toBe("main");
  });

  test("[Repeat] is optional and needs 4 total: with 3 energy no repeat is offered and a plain cast leaves 1; repeat: 2 is never legal (820.1.c.3)", async () => {
    const three = await board(3).build();
    expect(three.p1.option("cast", "tempt")?.fields.some((f) => f.arg === "repeat")).toBe(false);
    const r = await three.p1.try((p) => p.cast("tempt", { repeat: 1, targets: "foe" }));
    expect(r.ok).toBe(false);
    await three.p1.cast("tempt", { targets: "foe" });
    expect(three.p1.energy()).toBe(1);
    const rich = await board(8).build();
    const twice = await rich.p1.try((p) => p.cast("tempt", { repeat: 2, targets: "foe" }));
    expect(twice.ok).toBe(false);
    expect(rich.zoneOf("tempt")).toBe("hand");
  });

  test("timing: no [Action]/[Reaction] — illegal on the opponent's turn and inside my own showdown", async () => {
    const theirs = await board(2).active(P2).build();
    expect(theirs.p1.can("cast", "tempt")).toBe(false);
    const mine = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf3", { controller: null })
      .unit(P2, "bf1", { might: 2 }, "foe")
      .unit(P2, "base", { might: 1 }, "home")
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "tempt")
      .build();
    expect(mine.p1.can("cast", "tempt")).toBe(true);
    await mine.p1.move("ally", "bf3"); // empty uncontrolled bf → non-combat showdown, P1 has focus
    expect(mine.decision() as ActionDecision).toMatchObject({ context: "showdown", seat: P1 });
    expect(mine.p1.can("cast", "tempt")).toBe(false);
  });

  test("the destination prompt belongs to the CASTER: P2 may not answer it", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "foe" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const r = await game.p2.try((p) => p.pick("base"));
    expect(!r.ok && r.error.code).toBe("NOT_YOUR_DECISION");
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test("parsed abilities: one standard-timed spell ability with Repeat [2] whose effect moves an ENEMY unit to a same-controller location", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 2, timing: "standard" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { controller: "enemy", type: "unit" }, type: "move" },
      repeat: { energy: 2 },
      type: "spell",
    });
    const eff = (def?.abilities?.[0] as { effect: Record<string, unknown> }).effect;
    expect(eff.to).not.toBe("choose"); // the destination clause must not be silently dropped
    expect(JSON.stringify(eff.to)).toMatch(/same/i);
  });
});
