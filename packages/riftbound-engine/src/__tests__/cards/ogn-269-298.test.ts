/**
 * The Boss — ogn-269-298 · Legend · Body/Order · Sett
 *
 *   If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to
 *   heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)
 *   When you conquer, ready me.
 *
 * Rules: 371.2 / 371.2.a / 371.2.b (an optional "you may … instead" replacement is offered to its
 * controller when the event occurs; declining leaves the event unmodified), 370.1.a.1 (a replaced death
 * never happened — no Deathknell, unit stays a Game Object), 702.2.b (spending a buff removes it),
 * 135.2.e.5.a ([rainbow] = one Power of any Domain), 107.4.c (the Champion Legend in the Legend Zone is
 * a Game Object whose passive text is live).
 *
 * DESIGN (DESIGN.md §Paying costs): manual pay — the [rainbow] must already be in the pool when the
 * unit would die; the payment is Power, never Energy, so an empty ENERGY pool never blocks it.
 */

import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, scenario } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "ogn-269-298";

/** Inline 1-energy action spell: deal 4 to a unit — lethal for the 2(+1)-Might ally. */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/**
 * P1: The Boss (legend), a BUFFED 2-Might ally at bf1, an unbuffed 2-Might grunt at bf1, one Bolt in
 * hand and exactly 1 energy for it. `power` is P1's Power pool (default: 1 body).
 */
function board(opts: { power?: Record<string, number>; legendExhausted?: boolean } = {}) {
  const s = opts.legendExhausted
    ? scenario().card("boss", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    : scenario().legend(P1, CARD, "boss");
  return s
    .resources(P1, { energy: 1, power: opts.power ?? { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Buffed Ally" }, "ally", { buffed: true })
    .unit(P1, "bf1", { might: 2, name: "Plain Grunt" }, "grunt")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, BOLT, "bolt");
}

describe("The Boss (ogn-269-298)", () => {
  test("setup: the legend carries a live optional die replacement + the conquer trigger; the ally is buffed (3 Might)", async () => {
    const game = await board().build();
    expect(game.zoneOf("boss")).toBe("legendZone");
    const abilities = (getGlobalCardRegistry().getAbilities("boss") ?? []) as { type: string }[];
    expect(abilities.map((a) => a.type)).toEqual(["replacement", "triggered"]);
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").might).toBe(3);
  });

  test("a buffed friendly unit taking lethal damage → P1 is ASKED (yes/no, acceptable) before anything dies; the offer is enumerated with 0 energy because the cost is [rainbow] Power + [Exhaust] (371.2.a)", async () => {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "ally" });
    expect(game.p1.energy()).toBe(0); // the bolt took the last energy — the shield needs none
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as Decision;
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect((d as { canAccept?: boolean }).canAccept).not.toBe(false);
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // nothing has died while the question is open (370.1.c)
  });

  test("accepting pays exactly 1 Power (no Energy), exhausts The Boss, spends the ally's buff, and the ally is healed, exhausted and recalled to base instead of dying (371.2, 702.2.b, 370.1.a.1)", async () => {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.p1.trash()).not.toContain("ally");
    expect(game.violations()).toEqual([]);
  });

  test("[rainbow] is any Domain: a single ORDER power pays it just as well", async () => {
    const game = await board({ power: { order: 1 } }).build();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("declining: the ally simply dies to the trash, The Boss stays ready and the power is kept (371.2.b)", async () => {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "ally" });
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.power("body")).toBe(1);
  });

  test("an UNBUFFED friendly unit is not covered: the grunt dies with no question asked", async () => {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "grunt" });
    const r = await game.settle();
    expect(r.reason).not.toBe("unanswered");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.power("body")).toBe(1);
  });

  test("no Power in the pool → the cost is unpayable, so P1 is never asked and the buffed ally dies (DESIGN: manual pay — nothing is auto-added)", async () => {
    const game = await board({ power: {} }).build();
    await game.p1.cast("bolt", { targets: "ally" });
    const r = await game.settle();
    expect(r.reason).not.toBe("unanswered");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
  });

  test("an already EXHAUSTED Boss cannot pay '[Exhaust] me' → never asked, the buffed ally dies, power kept", async () => {
    const game = await board({ legendExhausted: true }).build();
    expect(game.state("boss").isExhausted).toBe(true);
    await game.p1.cast("bolt", { targets: "ally" });
    const r = await game.settle();
    expect(r.reason).not.toBe("unanswered");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.p1.power("body")).toBe(1);
  });

  test("an enemy unit dying is never The Boss's business", async () => {
    const game = await board().unit(P2, "bf1", { might: 1, name: "Weakling" }, "weak", { buffed: true }).resources(P2, { power: { body: 1 } }).build();
    await game.p1.cast("bolt", { targets: "weak" });
    const r = await game.settle();
    expect(r.reason).not.toBe("unanswered");
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.p1.power("body")).toBe(1);
  });

  test("When you conquer, ready me: an exhausted Boss readies when P1 conquers a battlefield", async () => {
    const game = await scenario()
      .card("boss", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.state("boss").isExhausted).toBe(true);
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("boss").isReady).toBe(true);
  });
});
