/**
 * Icevale Archer — unl-065-219 · Unit · Mind · 2 energy (no power) · 2 might
 *
 *   When I attack, you may pay [1] to give a unit here -1 [Might] this turn.
 *
 * Rules: 383.4.e (Attack Trigger: fires when the Archer gains the Attacker designation — i.e. its
 * arrival applied Contested to an ENEMY-OCCUPIED battlefield; never when defending, never on an
 * empty battlefield), 464.2.e (the trigger lands on the combat chain before any Focus play, so it
 * resolves before combat damage — the -1 counts in this very fight), 355.10.c.1 ("pay [1] to …" is a
 * cost within the instruction: unpayable → the option cannot be taken), 359.3 ("here" = the Archer's
 * battlefield, checked on resolution; ANY unit there — friend, foe or the Archer itself), 142.4.b /
 * 143.2.b (lethal = non-zero damage ≥ might; might below 0 counts as 0 in combat), 477 ("this turn"
 * arithmetic modifier, gone after the turn's cleanup).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. Only on ATTACK: defending against a raider, or walking onto an empty enemy battlefield, offers nothing.
 *  2. Optional AND costed: "no" keeps the energy; 0 energy → cannot say yes; exactly 1 energy → 0 after.
 *  3. "a unit HERE": both sides' units at that battlefield (Archer included) are offered; units in
 *     either base or at another battlefield are not.
 *  4. Combat arithmetic where the -1 is decisive: 2-might Archer into a 3-might defender trades only
 *     with the debuff; into a 2-might defender the debuff lets the Archer survive (takes 1 < 2).
 *  5. Stacking: two Archers attacking together → two triggers, two payments, -2 on one defender.
 *  6. Expiry: the -1 is gone once the turn ends.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-065-219";

function attack(foeMight: number, energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "elsewhere")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", CARD, "archer")
    .unit(P1, "base", { might: 1, name: "Benchwarmer" }, "bench");
}

/** Move the Archer (plus companions) into bf1 and drain to its optional prompt (yes/no or the target pick). */
async function attackToPrompt(game: Game, units: string | string[] = "archer"): Promise<void> {
  await game.p1.move(units, "bf1");
  expect(game.chain().some((i) => i.cardId === "archer" && i.triggered && i.controller === P1)).toBe(true);
  // rule 402 (finalization): the optional prompt is asked immediately, before any priority pass
  expect(game.decision()?.seat).toBe(P1);
  expect(["yes-no", "pick"]).toContain(game.decision()?.kind);
}

/** Resolve `count` finalized chain items mid-showdown: both players pass once per item. */
async function resolveChain(game: Game, count = 1): Promise<void> {
  for (let i = 0; i < count; i++) {
    await game.acting().passPriority();
    await game.acting().passPriority();
  }
}

/** Accept the option and debuff `target`, whichever order the engine asks (pay first or choose first). Returns the pick's offered cards. */
async function payAndPick(game: Game, target: string): Promise<string[]> {
  let offered: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.seat !== P1) {
      break;
    }
    if (d.kind === "yes-no") {
      expect(d.canAccept).not.toBe(false);
      await game.p1.yes();
    } else if (d.kind === "pick") {
      offered = d.options.map((o) => o.card ?? o.key).sort();
      await game.p1.pick(target);
    } else {
      break;
    }
  }
  return offered;
}

describe("Icevale Archer (unl-065-219)", () => {
  test("registry payload: ONE optional attack trigger, cost pay 1 energy, effect -1 might this turn to a unit 'here'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 2, might: 2, name: "Icevale Archer" });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { energy: 1 }, type: "pay-cost" },
        effect: { amount: -1, duration: "turn", target: { location: "here", type: "unit" }, type: "modify-might" },
        optional: true,
        trigger: { event: "attack", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 2 energy, no power; enters base exhausted as a 2-might unit; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "archer").build();
    await game.p1.play("archer");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("archer")).toBe("base");
    expect(game.state("archer")).toMatchObject({ isExhausted: true, might: 2 });
    expect((await scenario().resources(P1, { energy: 1, power: { mind: 3 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
  });

  test("attacking puts the trigger on the chain; saying NO keeps the energy and the plain 2-vs-3 fight kills only the Archer", async () => {
    const game = await attack(3).build();
    await attackToPrompt(game);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    } else {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("archer")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").might).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("YES vs a 3-might Foe: pays exactly [1], Foe drops to 2 for the fight → 2 dmg is now lethal and both units die (trade instead of a clean loss)", async () => {
    const game = await attack(3).build();
    await attackToPrompt(game);
    await payAndPick(game, "foe");
    expect(game.p1.energy()).toBe(0); // rule 383.3.b.1: the cost is paid at finalization
    await resolveChain(game);
    expect(game.state("foe").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("archer")).toBe("trash");
    expect(game.p1.points()).toBe(0); // nobody left to conquer
  });

  test("YES vs a 2-might Foe: Foe (→1) deals only 1 back, so the Archer survives, kills it and conquers bf1 (+1 point)", async () => {
    const game = await attack(2).build();
    await attackToPrompt(game);
    await payAndPick(game, "foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("archer")).toBe("bf1");
    expect(game.state("archer").damage).toBe(0); // combat damage is healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("'a unit HERE': offered = exactly the units at bf1 on BOTH sides (Foe, Archer, the co-attacking Benchwarmer) — not Homebody in base, not Elsewhere at bf2", async () => {
    const game = await attack(3).build();
    await attackToPrompt(game, ["archer", "bench"]);
    const offered = await payAndPick(game, "foe");
    expect(offered).toEqual(["archer", "bench", "foe"]);
  });

  test("it may even shrink a FRIENDLY unit here (pointless but legal): Archer picks itself → 1 might, Foe untouched", async () => {
    const game = await attack(3).build();
    await attackToPrompt(game);
    await payAndPick(game, "archer");
    expect(game.p1.energy()).toBe(0);
    await resolveChain(game);
    expect(game.state("archer").might).toBe(1);
    expect(game.state("foe").might).toBe(3);
  });

  test("pay [1] with ZERO energy: the option cannot be accepted — no debuff, Foe stays 3 and wins", async () => {
    const game = await attack(3, 0).build();
    await game.p1.move("archer", "bf1");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    } else if (d?.kind === "pick" && d.seat === P1) {
      // A pick offered before payment must not be completable for free.
      expect((await game.p1.try((p) => p.pick("foe"))).ok).toBe(false);
      await game.p1.decline();
    }
    await game.settle();
    expect(game.state("foe").might).toBe(3);
    expect(game.zoneOf("archer")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
  });

  test("no trigger when DEFENDING: a raider attacking the Archer's battlefield creates no Archer chain item and no prompt", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "archer")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().some((i) => i.cardId === "archer")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("raider")).toBe("trash"); // 2 ≥ 1
    expect(game.locationOf("archer")).toBe("bf1");
  });

  test("no trigger without a combat: moving onto an EMPTY enemy-controlled battlefield just conquers it, energy untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "archer")
      .build();
    await game.p1.move("archer", "bf1");
    expect(game.chain().some((i) => i.cardId === "archer")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("stacking: two Archers attack together → two triggers; paying both puts -2 on the 4-might Foe (→2), so 2+2 kills it and both Archers survive", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
      .unit(P1, "base", CARD, "archer")
      .unit(P1, "base", CARD, "archer2")
      .build();
    await game.p1.move(["archer", "archer2"], "bf1");
    expect(game.chain().filter((i) => i.triggered && (i.cardId === "archer" || i.cardId === "archer2"))).toHaveLength(2);
    // rule 402 (finalization): both triggers ask before any priority pass
    for (let n = 0; n < 2; n++) {
      expect(game.decision()?.seat).toBe(P1);
      await payAndPick(game, "foe");
    }
    expect(game.p1.energy()).toBe(0);
    await resolveChain(game, 2);
    expect(game.state("foe").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    // Foe (2) can kill at most one 2-might Archer; the other conquers.
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'this turn': debuff the 3-might co-attacker (→2); it survives the fight at 2 might and is back to 3 once the turn ends", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Foe" }, "foe")
      .unit(P1, "base", CARD, "archer")
      .unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser")
      .build();
    await attackToPrompt(game, ["archer", "bruiser"]);
    await payAndPick(game, "bruiser");
    await resolveChain(game);
    expect(game.state("bruiser").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 2+2 ≥ 1; Foe's 1 damage kills neither attacker
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.state("bruiser").might).toBe(2); // still this turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("bruiser").might).toBe(3);
    expect(game.state("archer").might).toBe(2);
  });
});
