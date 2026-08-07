/**
 * Wind and Ghosts — ven-106-166 · Spell · Chaos · 3 energy + [chaos]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose a unit at a battlefield. If it has 3 [Might] or less, banish it. Otherwise, return it
 *   to its owner's hand.
 *
 * Rules: 316.5 / Action timing (own turn in an open state, or whenever you hold Focus in a showdown —
 * never as a response on the opponent's turn outside a showdown), 355.10 ("choose" = a target fixed
 * when played; legality = any unit AT A BATTLEFIELD, either side), 359.3 (the Might test is made ON
 * RESOLUTION against current Might), 427 (Banish → banishment zone; it is not a kill, so no
 * Deathknell), 425 (return to OWNER's hand — controller ≠ owner matters), 142 (damage never lowers
 * Might; a damaged 5-Might unit is still "more than 3").
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. Boundary: 3 Might → banished; 4 Might → bounced. Both branches from one card, decided late.
 *  2. Decided on resolution: choose a 3-Might unit, its controller answers with Discipline (+2 this
 *     turn) → at resolution it is 5 → it goes to hand, NOT to banishment.
 *  3. Banish is not death: a ≤3 Deathknell unit (Carrion Dredger) that is banished leaves no Bird
 *     token behind and sits in banishment, not the trash.
 *  4. "its OWNER's hand": a 5-Might unit P2 controls but P1 owns returns to P1's hand.
 *  5. Marked damage is irrelevant to the test: 5 Might carrying 3 damage is still bounced, not banished.
 *  6. Targeting/legality: base units are never offered; with no unit at any battlefield the spell is
 *     not playable at all (a targetless cast for 3+[chaos] that does nothing must not be legal).
 *  7. Timing: illegal on the opponent's turn in an open state; legal once P1 holds Focus in a showdown
 *     P2 started; legal in P1's own main phase.
 * Partner/counter cards: Discipline ogn-058-298 (Reaction +2 Might), Carrion Dredger unl-153-219
 * (1-Might Deathknell), Gust ogn-169-298 (the Reaction little sibling: bounce ≤3 only).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-106-166";
const DISCIPLINE = "ogn-058-298"; // [Reaction] Give a unit +2 Might this turn. Draw 1. — 2 energy (calm)
const CARRION_DREDGER = "unl-153-219"; // 1 Might, [Deathknell] play a 1-Might Bird token to your base

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "bf1", { might: 5, name: "Bruised Five" }, "five", { damage: 3 })
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .unit(P1, "base", { might: 1, name: "My Homebody" }, "myhome")
    .hand(P1, CARD, "wg");
}

describe("Wind and Ghosts (ven-106-166)", () => {
  test("registry payload should be an [Action] spell targeting a unit at a battlefield with a might≤3 → banish / else → return-to-owner's-hand branch", async () => {
    // Expected: timing action + a structured conditional effect with a battlefield-unit target.
    // Actual: timing is right but the whole effect is `{ type: "raw", text: … }` with no target.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 3, name: "Wind and Ghosts", powerCost: ["chaos"], timing: "action" });
    const abilities = (def?.abilities ?? []) as { type: string; timing?: string; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ timing: "action", type: "spell" });
    expect(abilities[0]?.effect?.type).not.toBe("raw");
    const json = JSON.stringify(abilities[0]);
    expect(json).toContain('"location":"battlefield"');
    expect(json).toContain("banish");
    expect(json).toMatch(/return-to-hand/);
  });

  test("cost: 3 energy + 1 chaos are deducted and the spell goes to the chain, then the trash; 2 energy or no chaos → not playable", async () => {
    const game = await board().build();
    await game.p1.cast("wg", { answers: ["three"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("wg")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("wg")).toBe("trash");
    expect((await board().resources(P1, { energy: 2, power: { chaos: 2 } }).build()).p1.can("cast", "wg")).toBe(false);
    expect((await board().resources(P1, { energy: 3, power: { chaos: 0, fury: 1 } }).build()).p1.can("cast", "wg")).toBe(false);
  });

  test("'Choose a unit at a battlefield' — the cast offers exactly the five battlefield units (both sides) and never a unit in a base", async () => {
    // Expected: a targets field listing three/four/five/mine (bf) but not home/myhome (base). Actual: no targets at all.
    const game = await board().build();
    const targets = game.p1.option("cast", "wg")?.fields.find((f) => f.arg === "targets")?.options as string[][] | undefined;
    expect(targets).toBeDefined();
    expect((targets ?? []).map((t) => t[0]).sort()).toEqual(["five", "four", "mine", "three"]);
    const t = await game.p1.try((p) => p.cast("wg", { targets: "home" }));
    expect(t.ok).toBe(false);
  });

  test("no unit at ANY battlefield → the spell is not playable (nothing to choose)", async () => {
    // Expected: can("cast") false. Actual: the targetless raw effect lets it be cast into the void for full price.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
      .unit(P1, "base", { might: 1, name: "My Homebody" }, "myhome")
      .hand(P1, CARD, "wg")
      .build();
    expect(game.p1.can("cast", "wg")).toBe(false);
  });

  test("3 Might or less → BANISHED (banishment zone, not trash, not hand)", async () => {
    // Expected: "three" ends in P2's banishment. Actual: cast cannot even name a target / nothing happens.
    const game = await board().build();
    await game.p1.cast("wg", { targets: "three" });
    await game.settle();
    expect(game.zoneOf("three")).toBe("banishment");
    expect(game.p2.trash()).not.toContain("three");
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.zoneOf("wg")).toBe("trash");
  });

  test("boundary — exactly 4 Might is 'otherwise': returned to its owner's (P2's) hand, not banished", async () => {
    // Expected: "four" in P2's hand. Actual: nothing happens.
    const game = await board().build();
    await game.p1.cast("wg", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("hand");
    expect(game.p2.hand()).toContain("four");
    expect(game.p2.banishment()).not.toContain("four");
  });

  test("marked damage does not lower Might — a 5-Might unit carrying 3 damage is bounced to hand, not banished", async () => {
    // Expected: "five" (5 Might, 3 damage) → P2's hand. Actual: nothing happens.
    const game = await board().build();
    expect(game.state("five")).toMatchObject({ damage: 3, might: 5 });
    await game.p1.cast("wg", { targets: "five" });
    await game.settle();
    expect(game.p2.hand()).toContain("five");
  });

  test("your own battlefield unit is a legal choice — a friendly 2-Might unit is banished to YOUR banishment", async () => {
    // Expected: "mine" → P1's banishment. Actual: nothing happens.
    const game = await board().build();
    await game.p1.cast("wg", { targets: "mine" });
    await game.settle();
    expect(game.p1.banishment()).toContain("mine");
  });

  test("'its OWNER's hand' — a 5-Might unit P2 controls but P1 owns goes back to P1's hand", async () => {
    // Expected: "stolen" lands in P1's hand (owner), P2's hand unchanged. Actual: nothing happens.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .card("stolen", { controller: P2, def: { cardType: "unit", might: 5, name: "Turncoat" }, owner: P1, zone: "battlefield-bf1" })
      .hand(P1, CARD, "wg")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P2, owner: P1 });
    const p2HandBefore = game.p2.hand().length;
    await game.p1.cast("wg", { targets: "stolen" });
    await game.settle();
    expect(game.p1.hand()).toContain("stolen");
    expect(game.p2.hand()).toHaveLength(p2HandBefore);
  });

  test("the Might test happens ON RESOLUTION — choose the 3-Might unit, P2 responds with Discipline (+2) → it resolves at 5 and is returned to hand instead of banished", async () => {
    // Expected: chain = [wg, discipline]; Discipline resolves first (three → 5), then wg bounces it. Actual: no target.
    const game = await board().resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.cast("wg", { targets: "three" });
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "three" });
    expect(game.chain()).toHaveLength(2);
    await game.settle();
    expect(game.zoneOf("three")).toBe("hand");
    expect(game.p2.hand()).toContain("three");
    expect(game.p2.banishment()).not.toContain("three");
  });

  test("banish is not a kill — a 1-Might Carrion Dredger that is banished leaves NO Bird token behind (Deathknell needs a death)", async () => {
    // Expected: dredger in banishment, P2's base unchanged (no Bird). Actual: no target / nothing happens.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", CARRION_DREDGER, "dredger")
      .hand(P1, CARD, "wg")
      .build();
    const p2BaseBefore = game.p2.units("base").length;
    await game.p1.cast("wg", { targets: "dredger" });
    await game.settle();
    expect(game.zoneOf("dredger")).toBe("banishment");
    expect(game.p2.units("base")).toHaveLength(p2BaseBefore);
    expect(game.p2.trash()).not.toContain("dredger");
  });

  test("[Action] timing: not playable on the opponent's turn in an open state; playable once P1 holds Focus in a showdown P2 opened; playable in P1's own main phase", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 2, name: "Walker" }, "walker")
      .hand(P1, CARD, "wg")
      .build();
    expect(game.p1.can("cast", "wg")).toBe(false); // P2's open main phase
    await game.p2.move("walker", "bf1"); // combat showdown at bf1, P2 (attacker) has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "wg")).toBe(false); // P1 does not hold Focus yet
    await game.p2.passFocus();
    expect(game.p1.can("cast", "wg")).toBe(true);
    const own = await board().build();
    expect(own.p1.can("cast", "wg")).toBe(true);
  });

  test("[Action] is not [Reaction]: with P2's spell on the chain during P2's turn, P1 (holding priority) still cannot answer with Wind and Ghosts", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
      .hand(P2, DISCIPLINE, "disc")
      .hand(P1, CARD, "wg")
      .build();
    await game.p2.cast("disc", { targets: "mine" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "wg")).toBe(false);
  });
});
