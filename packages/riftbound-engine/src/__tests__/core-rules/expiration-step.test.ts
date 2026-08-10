/**
 * Core rules — the Ending Phase's EXPIRATION STEP as an ordered, re-looping procedure.
 *
 * Rules covered (riftbound-rules ids):
 *   317.1          Ending Step ("at end of turn" effects) happens BEFORE the Expiration Step
 *   317.2.a–d      Ending Special Cleanup: 3c heal all units → 3d all "this turn" effects expire
 *                  SIMULTANEOUSLY → 3e every Rune Pool empties (Energy AND Power lost, 167.1)
 *   423.1.a.2      Stunned ends at 3d
 *   709 / 710      [Mighty] reads CURRENT Might — a -N "this turn" lapsing at 3d can make a unit
 *                  BECOME Mighty (the rule's own example is an expiry at end of turn)
 *   320 / 320.1    during a cleanup Pending Items may be added but are not finalized: the trigger
 *                  is finalized (opt-in / cost) only after 3e — with the pool already empty
 *   317.2.e–f      any item that underwent FEPR → return to the START of the Expiration Step; a
 *                  "this turn" effect created by that chain lapses in the SECOND 3d pass
 *   317.3          only then does the next player become Turn Player
 * DESIGN (DESIGN.md §Paying costs): an unpayable optional trigger cost is still SHOWN
 * (canAccept:false); the player may add runes and then accept.
 *
 * The flow records every pass on `game.trace().expiration`
 * (`{ pass, steps: ["heal","expire","empty-pools"], healed, expired, events, poolsEmptied, itemsProcessed }`).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { MAX_EXPIRATION_PASSES } from "../../game-definition/flow/expiration-step";

function spell(name: string, effect: Record<string, unknown>, energyCost = 0) {
  return { abilities: [{ effect, timing: "action", type: "spell" }], cardType: "spell", energyCost, name, timing: "action" };
}

/** "Give a unit +2 [Might] this turn." */
const PUMP2 = spell("Pump", { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" });
/** "Give a unit -3 [Might] this turn." */
const SHRINK3 = spell("Shrink", { amount: -3, duration: "turn", target: { type: "unit" }, type: "modify-might" });
/** "Give a unit -1 [Might] this turn." */
const SHRINK1 = spell("Nick", { amount: -1, duration: "turn", target: { type: "unit" }, type: "modify-might" });
/** "Deal 3 to a unit." */
const BOLT3 = spell("Bolt", { amount: 3, target: { type: "unit" }, type: "damage" });
/** "Stun a unit." */
const STUN = spell("Zap", { target: { type: "unit" }, type: "stun" });

/** Unit · 1 Might · "When a friendly unit becomes [Mighty], give it +2 [Might] this turn." (mandatory) */
const CHEERLEADER = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "trigger-source" }, type: "modify-might" },
      trigger: { event: "become-mighty", on: "friendly-units" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  energyCost: 0,
  might: 1,
  name: "Filler Cheerleader",
};

/** Unit · 1 Might · "When a friendly unit becomes [Mighty], you may pay [1] to draw 1." */
const PAID_ADMIRER = {
  abilities: [
    {
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "become-mighty", on: "friendly-units" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  energyCost: 0,
  might: 1,
  name: "Filler Paid Admirer",
};

/** Unit · 5 Might · "When I become [Mighty], give me -1 [Might] this turn." — re-arms every pass. */
const SISYPHUS = {
  abilities: [
    {
      effect: { amount: -1, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "become-mighty", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  energyCost: 0,
  might: 5,
  name: "Filler Sisyphus",
};

describe("317.2.b before 317.2.c — 3c heals every unit BEFORE 3d strips the 'this turn' Might", () => {
  test("a 3-Might unit at +2 this turn carrying 3 damage survives the turn end: healed first, then back to 3 Might", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .hand(P1, PUMP2, "pump")
      .hand(P1, BOLT3, "bolt")
      .build();
    await game.p1.cast("pump", { targets: "squire" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "squire" });
    await game.settle();
    expect(game.state("squire")).toMatchObject({ damage: 3, might: 5, zone: "base" });
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("squire")).toMatchObject({ damage: 0, might: 3, mightModifier: 0, zone: "base" });
    const [pass] = game.trace().expiration;
    expect(pass?.steps).toEqual(["heal", "expire", "empty-pools"]);
    expect(pass?.healed).toEqual(["squire"]);
    expect(pass?.expired).toContain("mightModifier:squire");
  });

  test("a unit alive ONLY because of the pump (2 Might +2, 3 damage — more damage than its printed Might) does NOT die at end of turn", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 2, name: "Page" }, "page")
      .hand(P1, PUMP2, "pump")
      .hand(P1, BOLT3, "bolt")
      .build();
    await game.p1.cast("pump", { targets: "page" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "page" });
    await game.settle();
    expect(game.state("page")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    await game.advanceTurn();
    expect(game.zoneOf("page")).toBe("base");
    expect(game.state("page")).toMatchObject({ damage: 0, might: 2 });
    expect(game.p1.trash()).not.toContain("page");
  });
});

describe("423.1.a.2 — Stunned ends in step 3d", () => {
  test("a unit stunned this turn is no longer stunned once the turn has passed; the trace lists the lapse", async () => {
    const game = await scenario()
      .unit(P2, "base", { might: 3, name: "Target" }, "foe")
      .hand(P1, STUN, "zap")
      .build();
    await game.p1.cast("zap", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.trace().expiration).toHaveLength(1);
    expect(game.trace().expiration[0]?.expired).toContain("stun:foe");
  });
});

describe("317.2.d / 167.1 — 3e empties every pool (Energy AND Power); no trigger → exactly one pass", () => {
  test("floating energy and power of BOTH players are lost; the single pass records what was emptied and processed no item", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 6, name: "Giant" }, "giant") // already Mighty: nothing "becomes" anything
      .build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.energy()).toBe(0);
    const passes = game.trace().expiration;
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      itemsProcessed: 0,
      pass: 1,
      poolsEmptied: { [P1]: { energy: 2, power: { fury: 1 } }, [P2]: { energy: 1, power: {} } },
      steps: ["heal", "expire", "empty-pools"],
    });
    expect(passes[0]?.events).toEqual([]);
  });
});

describe("710 + 320.1 + 317.2.f — a -N lapsing at 3d makes a unit BECOME Mighty: the trigger fires once, resolves, and the step runs a SECOND pass", () => {
  async function shrunkGiantWithCheerleader() {
    const game = await scenario()
      .unit(P1, "base", CHEERLEADER, "cheer")
      .unit(P1, "base", { might: 5, name: "Giant" }, "giant")
      .hand(P1, SHRINK3, "shrink")
      .build();
    await game.p1.cast("shrink", { targets: "giant" });
    await game.settle();
    expect(game.state("giant").might).toBe(2);
    return game;
  }

  test("right after endTurn the Cheerleader trigger sits on the chain INSIDE P1's Ending Phase — P2's turn has not begun (317.3 waits)", async () => {
    const game = await shrunkGiantWithCheerleader();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cheer"]);
    expect(game.state("giant").might).toBe(5); // the -3 already lapsed when the item was queued
    const passes = game.trace().expiration;
    expect(passes).toHaveLength(1);
    expect(passes[0]?.events).toEqual(["become-mighty:giant"]);
    expect(passes[0]?.itemsProcessed).toBeGreaterThanOrEqual(1);
  });

  test("resolving it gives +2 THIS turn (7) — then pass 2's 3d strips that +2: P2's turn opens with the Giant at exactly 5, chain clear, 2 passes traced", async () => {
    const game = await shrunkGiantWithCheerleader();
    await game.p1.endTurn();
    // Resolve the trigger by passing priority around, and look before the second pass… we
    // cannot: the second pass runs in the same step the chain empties. So check the end state.
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.state("giant")).toMatchObject({ might: 5, mightModifier: 0 });
    const passes = game.trace().expiration;
    expect(passes).toHaveLength(2);
    expect(passes[0]).toMatchObject({ events: ["become-mighty:giant"], pass: 1 });
    expect(passes[0]?.expired).toContain("mightModifier:giant");
    expect(passes[1]).toMatchObject({ events: [], itemsProcessed: 0, pass: 2, steps: ["heal", "expire", "empty-pools"] });
    expect(passes[1]?.expired).toContain("mightModifier:giant"); // the +2 granted during the first chain
    expect(game.violations()).toEqual([]);
  });

  test("exactly ONE trigger: 5 → 7 on resolution is not a second 'becomes Mighty', and pass 2 (7 → 5, still Mighty) queues nothing", async () => {
    const game = await shrunkGiantWithCheerleader();
    await game.p1.endTurn();
    let cheerItems = 0;
    for (let i = 0; i < 8 && game.turnPlayer() === P1; i++) {
      cheerItems = Math.max(cheerItems, game.chain().filter((c) => c.cardId === "cheer").length);
      if (game.chain().length === 0) {
        break;
      }
      await game.acting().passPriority();
    }
    expect(cheerItems).toBe(1);
    await game.settle();
    const events = game.trace().expiration.flatMap((p) => p.events);
    expect(events).toEqual(["become-mighty:giant"]);
  });
});

describe("320 / 317.2.d before finalization — the trigger queued at 3d is FINALIZED only after 3e emptied the pool", () => {
  async function admirerBoard() {
    const game = await scenario()
      .unit(P1, "base", PAID_ADMIRER, "admirer")
      .unit(P1, "base", { might: 5, name: "Giant" }, "giant")
      .rune(P1, "fury", { alias: "r1" })
      .rune(P1, "fury", { alias: "r2" })
      .hand(P1, SHRINK3, "shrink")
      .build();
    await game.p1.cast("shrink", { targets: "giant" });
    await game.settle();
    await game.p1.tapRune("r1"); // float [1] — it will NOT survive 3e
    expect(game.p1.energy()).toBe(1);
    await game.p1.endTurn();
    return game;
  }

  test("the 'you may pay [1]' prompt is put to P1 with the floated energy already gone (pool 0) → shown but canAccept:false (DESIGN manual-pay); the pass trace shows the lost energy", async () => {
    const game = await admirerBoard();
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, source: { cardId: "admirer" } });
    expect(game.p1.energy()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.trace().expiration[0]?.poolsEmptied[P1]).toEqual({ energy: 1, power: {} });
    // The ready rune is offered alongside the question so the cost can still be paid (357.1.a).
    expect((d?.kind === "yes-no" ? d.actions ?? [] : []).some((o) => o.moveId === "exhaustRune" && o.card === "r2")).toBe(true);
  });

  test("P1 taps r2 while the prompt is open → canAccept, accepts, the draw resolves inside P1's Ending Phase; then a second (empty) pass and P2's turn — the energy tapped for it is gone too", async () => {
    const game = await admirerBoard();
    const hand0 = game.p1.hand().length;
    await game.p1.tapRune("r2");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0); // paid
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.trace().expiration.map((p) => p.pass)).toEqual([1, 2]);
    expect(game.trace().expiration[1]?.itemsProcessed).toBe(0);
  });

  test("declining removes the item with nothing paid; the step still re-runs once (an item was processed) and the turn passes", async () => {
    const game = await admirerBoard();
    const hand0 = game.p1.hand().length;
    await game.p1.no();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.runes({ ready: true })).toEqual(["r2"]);
    expect(game.trace().expiration).toHaveLength(2);
  });
});

describe("317.2.f loop guard", () => {
  test(`a trigger that re-arms a 'this turn' penalty every pass is cut off after ${MAX_EXPIRATION_PASSES} passes and the turn still passes`, async () => {
    const game = await scenario()
      .unit(P1, "base", SISYPHUS, "sisyphus")
      .hand(P1, SHRINK1, "nick")
      .build();
    await game.p1.cast("nick", { targets: "sisyphus" });
    await game.settle();
    expect(game.state("sisyphus").might).toBe(4);
    await game.p1.endTurn();
    const r = await game.settle({ maxSteps: 200 });
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    const passes = game.trace().expiration;
    expect(passes).toHaveLength(MAX_EXPIRATION_PASSES);
    expect(passes.every((p) => p.events.length === 1)).toBe(true);
    expect(passes[passes.length - 1]?.guardTripped).toBe(true);
    expect(game.chain()).toEqual([]);
  });
});

describe("317.1 before 317.2 — the trace is per Ending Phase", () => {
  test("each turn's Ending Phase starts a fresh expiration trace", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).build();
    await game.advanceTurn();
    expect(game.trace().expiration).toHaveLength(1);
    expect(game.trace().expiration[0]?.poolsEmptied[P1]).toEqual({ energy: 1, power: {} });
    await game.advanceTurn();
    expect(game.trace().expiration).toHaveLength(1);
    expect(game.trace().expiration[0]?.poolsEmptied).toEqual({});
  });
});
