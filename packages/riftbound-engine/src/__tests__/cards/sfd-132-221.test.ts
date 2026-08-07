/**
 * Beast Below — sfd-132-221 · Unit · Chaos · 7 energy + [chaos][chaos] · 8 Might
 *
 *   When you play me, return another friendly unit and an enemy unit to their owners' hands.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - It is a mandatory Play Effect (383.4.a) with TWO targets (355.5/355.7): "another friendly
 *    unit" (never itself) AND "an enemy unit". 402.4: if legal choices cannot be made for BOTH,
 *    the trigger is removed from the chain — a lone enemy (or lone friend) is NOT bounced.
 *    402.4.b: when both exist the controller must choose; there is no "you may".
 *  - With several candidates per role the CONTROLLER chooses (402.2) — the engine must ask,
 *    not pick for them; and the choice is locked before the opponent gets priority.
 *  - "their owners' hands" (rule 108): a unit you control but do not own goes to its OWNER.
 *  - Tokens bounced to a hand cease to exist (186.1) — bouncing an enemy Recruit deletes it.
 *  - No location restriction: base units and battlefield units on either side are all legal;
 *    facedown cards / gear are not units.
 *  - Response window: after targets are locked, the opponent may Gust (ogn-169-298) their own
 *    targeted unit away; Beast Below then bounces only the friendly target and must not
 *    re-target a different enemy (359.3.e.5 / 359.3.e.8).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-132-221";
const GUST = "ogn-169-298"; // [Reaction] Return a unit at a battlefield with 3 Might or less to its owner's hand.

function base(energy = 7, power: Record<string, number> = { chaos: 2 }) {
  return scenario().resources(P1, { energy, power }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "bb");
}

/** Answer Beast Below's target prompt(s) whatever their shape (two sequential picks or one combined). */
async function pickTargets(game: Game, friendly: string, enemy: string): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const cards = d.options.map((o) => o.card ?? o.key);
    const wanted = [friendly, enemy].filter((c) => cards.includes(c));
    await game.p1.pick(...wanted.slice(0, Math.max(1, Math.min(d.max, wanted.length))));
  }
}

describe("Beast Below (sfd-132-221)", () => {
  test("cost & body: 7 energy + [chaos][chaos] are deducted, it enters the base exhausted as an 8-Might unit; 1 chaos or 6 energy is not enough", async () => {
    const game = await base().unit(P1, "base", { might: 1 }, "ally").unit(P2, "base", { might: 1 }, "foe").build();
    await game.p1.play("bb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.state("bb")).toMatchObject({ baseMight: 8, isExhausted: true, might: 8 });
    expect((await base(7, { chaos: 1 }).build()).p1.can("play", "bb")).toBe(false);
    expect((await base(6, { chaos: 2 }).build()).p1.can("play", "bb")).toBe(false);
    // A universal (rainbow) power may stand in for the second chaos pip.
    expect((await base(7, { chaos: 1, rainbow: 1 }).build()).p1.can("play", "bb")).toBe(true);
  });

  test("play effect goes on the chain (opponent gets a priority window), then the other friendly unit AND the enemy unit go back to hand; Beast Below stays", async () => {
    const game = await base().unit(P1, "bf1", { might: 3, name: "Ally" }, "ally").unit(P2, "bf1", { might: 3, name: "Foe" }, "foe").build();
    await game.p1.play("bb");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bb", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await pickTargets(game, "ally", "foe");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ally"]);
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p2.hand()).toEqual(["foe"]);
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.chain()).toHaveLength(0);
    // 323.6: the now-empty battlefield becomes uncontrolled at the next open-state cleanup.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("not optional (402.4.b): with exactly one candidate per role no yes/no is offered and both are bounced", async () => {
    const game = await base().unit(P1, "base", { might: 2 }, "ally").unit(P2, "base", { might: 5 }, "foe").build();
    await game.p1.play("bb");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
  });

  test("no location restriction: a friendly unit at a battlefield and an enemy unit in its base are both legal", async () => {
    const game = await base().unit(P1, "bf1", { might: 2 }, "ally").unit(P2, "base", { might: 5 }, "foe").build();
    await game.p1.play("bb");
    await game.settle();
    expect(game.p1.hand()).toEqual(["ally"]);
    expect(game.p2.hand()).toEqual(["foe"]);
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("'their owners' hands' (rule 108): a unit P1 controls but P2 owns returns to P2's hand", async () => {
    const game = await base()
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P2, zone: "base" })
      .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
      .build();
    expect(game.p1.units()).toContain("stolen"); // it is friendly to P1 right now
    await game.p1.play("bb");
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p2.hand().sort()).toEqual(["foe", "stolen"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("a bounced enemy unit TOKEN ceases to exist instead of reaching a hand (186.1)", async () => {
    const game = await base().unit(P1, "base", { might: 2 }, "ally").unit(P2, "bf1", { might: 1, name: "Recruit" }, "token-recruit-1").build();
    expect(game.state("token-recruit-1").isToken).toBe(true);
    await game.p1.play("bb");
    await game.settle();
    expect(game.has("token-recruit-1")).toBe(false);
    expect(game.p2.hand()).toEqual([]);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.hand()).toEqual(["ally"]);
  });

  test("with two candidates per role the controller must be asked to choose the targets (402.2)", async () => {
    const game = await base()
      .unit(P1, "base", { might: 2, name: "AllyHome" }, "allyHome")
      .unit(P1, "bf1", { might: 3, name: "AllyBf" }, "allyBf")
      .unit(P2, "bf1", { might: 3, name: "FoeBf" }, "foeBf")
      .unit(P2, "base", { might: 1, name: "FoeHome" }, "foeHome")
      .build();
    await game.p1.play("bb");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).not.toContain("bb"); // "another"
    expect(offered).toEqual(expect.arrayContaining(["allyHome", "allyBf"]));
    await pickTargets(game, "allyBf", "foeBf");
    await game.settle();
    expect(game.zoneOf("allyBf")).toBe("hand");
    expect(game.zoneOf("foeBf")).toBe("hand");
    expect(game.zoneOf("allyHome")).toBe("base");
    expect(game.zoneOf("foeHome")).toBe("base");
    expect(game.zoneOf("bb")).toBe("base");
  });

  test("'another' + 402.4 — when Beast Below is your only unit the two-target trigger cannot be legally finalized and is removed, so the enemy unit must NOT be bounced; the engine bounces the enemy anyway", async () => {
    // Expected: no friendly target exists (Beast Below is not "another") → trigger removed (402.4),
    // foe stays at bf1. Actual: the engine resolves the enemy half alone and returns foe to hand.
    const game = await base().unit(P2, "bf1", { might: 3, name: "Foe" }, "foe").gear(P1, { name: "Trinket" }, "trinket").build();
    await game.p1.play("bb");
    await game.settle();
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.zoneOf("trinket")).toBe("base"); // gear is not a unit
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual([]);
  });

  test("402.4 — with no enemy UNIT (only enemy gear) the trigger is removed and your other unit must stay on the board; the engine bounces the friendly unit alone", async () => {
    // Expected: ally stays in base, nothing in P1's hand, enemy gear untouched (not a unit).
    // Actual: ally is returned to P1's hand even though no enemy target could be chosen.
    const game = await base()
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .gear(P2, { name: "Their Trinket" }, "theirGear")
      .build();
    await game.p1.play("bb");
    await game.settle();
    expect(game.zoneOf("theirGear")).toBe("base");
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.p1.hand()).toEqual([]);
  });

  test.failing("BUG: targets must be chosen when the trigger is finalized (402.2), before P2's priority; P2 Gusting its targeted unit away then leaves only the friendly bounced and no re-target (359.3.e.5) — the engine asks nothing and picks at resolution", async () => {
    // Expected: P1 pick prompt right after the play; after Gust removes foeBf, Beast Below returns
    // only ally and foeHome is untouched. Actual: no prompt at finalization (targets are resolved
    // programmatically when the trigger resolves), so the locked-target scenario cannot even start.
    const game = await base()
      .resources(P2, { energy: 1 })
      .hand(P2, GUST, "gust")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 3, name: "FoeBf" }, "foeBf")
      .unit(P2, "base", { might: 6, name: "FoeHome" }, "foeHome")
      .build();
    await game.p1.play("bb");
    // 402.2: choices are made while the trigger is finalized — before anyone gets priority.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await pickTargets(game, "ally", "foeBf");
    // Now the chain is open: P1 passes, P2 answers with Gust on its own targeted unit.
    if (game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "foeBf" });
    await game.settle();
    expect(game.zoneOf("foeBf")).toBe("hand"); // via Gust
    expect(game.zoneOf("ally")).toBe("hand"); // Beast Below's friendly half still resolves (359.3.e.8)
    expect(game.zoneOf("foeHome")).toBe("base"); // never chosen → untouched
    expect(game.zoneOf("bb")).toBe("base");
  });

  test("only YOUR play triggers it: an opponent playing a unit afterwards bounces nothing", async () => {
    const game = await base()
      .resources(P2, { energy: 2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 5 }, "foe")
      .hand(P2, { energyCost: 2, might: 2, name: "Latecomer" }, "late")
      .build();
    await game.p1.play("bb");
    await game.settle();
    expect(game.p1.hand()).toEqual(["ally"]);
    expect(game.p2.hand().sort()).toEqual(["foe", "late"]);
    await game.advanceTurn();
    // rule 429.2: the new turn empties the Rune Pool — P2 exhausts two runes
    // to pay for Latecomer (ready runes are not spent implicitly).
    await game.p2.tapRunes(2);
    await game.p2.play("late");
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("late")).toBe("base");
    expect(game.zoneOf("bb")).toBe("base");
    expect(game.zoneOf("foe")).toBe("hand"); // still in hand (plus P2's draw-step card)
    expect(game.p2.hand()).toHaveLength(2);
    expect(game.p1.hand()).toEqual(["ally"]);
  });

  test("parsed abilities match the printed text: one play-self trigger whose effect is [return another friendly unit, return an enemy unit], no 'optional'", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 7, might: 8, powerCost: ["chaos", "chaos"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: {
        effects: [
          { target: { controller: "friendly", excludeSelf: true, type: "unit" }, type: "return-to-hand" },
          { target: { controller: "enemy", type: "unit" }, type: "return-to-hand" },
        ],
        type: "sequence",
      },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(abilities[0]?.optional).not.toBe(true);
  });
});
