/**
 * Sinister Poro — unl-137-219 · Unit · Chaos · 2 energy + [chaos] · 1 Might · Poro
 *
 *   When I attack, you may pay [1] to move an enemy unit here to its base.
 *
 * Rules: 383.4.e (Attack Trigger — fires once when the Poro gains the Attacker designation, i.e. its
 * arrival contested an ENEMY-OCCUPIED battlefield; never when defending, never on an empty one),
 * 464.2.e (the trigger goes on the combat chain and resolves BEFORE combat damage), 383.3.b ("you may
 * pay [1] to …" — a cost within the instruction: unpayable → cannot accept), 359.3 ("here" = the
 * Poro's battlefield; "enemy" = not controlled by the ability's controller), 445–447 (a Move to base is
 * a move, not a kill/recall: the unit keeps existing, undamaged by a fight that never happened),
 * 465.1 / 466.3.a / 466.5 (if no defender remains there is no damage step; the attacker alone remains
 * → wins → establishes control → conquers).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The lone defender bounced home: NO combat damage at all, the 1-Might Poro conquers a battlefield
 *     it could never win by force; the bounced unit sits in its owner's base unharmed.
 *  2. Optional AND costed: "no" keeps the energy and the Poro just dies 1-vs-3; with 0 energy "yes" is
 *     not acceptable; with exactly 1 it drops to 0.
 *  3. "an ENEMY unit HERE": only P2's units at THIS battlefield are offered — not P2's base dweller, not
 *     P2's unit on another battlefield, never a friendly co-attacker or the Poro itself.
 *  4. Two defenders: bounce the big one, fight the small one with help — the trigger reshapes the combat.
 *  5. Only on ATTACK: defending against a raider, or walking onto an empty enemy battlefield → nothing.
 *  6. Partner (Chaos): Blast Cone — "When you move an enemy unit, you may exhaust this to Stun it" —
 *     the Poro's bounce IS me moving an enemy unit, so the Cone should offer its stun on the way home.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-137-219";
const BLAST_CONE = "unl-133-219"; // Chaos gear: … When you move an enemy unit, you may exhaust this to [Stun] it.

function attack(foeMight: number, energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "base", CARD, "poro")
    .unit(P1, "base", { might: 3, name: "Buddy" }, "buddy");
}

/** Move the Poro (plus companions) into bf1 and drain to its optional prompt. */
async function attackToPrompt(game: Game, units: string | string[] = "poro"): Promise<void> {
  await game.p1.move(units, "bf1");
  expect(game.chain().some((i) => i.cardId === "poro" && i.triggered && i.controller === P1)).toBe(true);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()?.seat).toBe(P1);
  expect(["yes-no", "pick"]).toContain(game.decision()?.kind);
}

/** Accept and bounce `target`, whichever order the engine asks (pay first or choose first). Returns the offered cards. */
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

async function sayNo(game: Game): Promise<void> {
  if (game.decision()?.kind === "yes-no") {
    await game.p1.no();
  } else {
    await game.p1.decline();
  }
}

describe("Sinister Poro (unl-137-219)", () => {
  test("registry payload: ONE optional attack trigger, cost pay 1 energy, effect move an ENEMY unit 'here' to base; 2+[chaos], 1 Might, Poro tag", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 2, might: 1, name: "Sinister Poro", tags: ["Poro"] });
    expect(def?.powerCost).toEqual(["chaos"]);
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { energy: 1 }, type: "pay-cost" },
        effect: { target: { controller: "enemy", location: "here", type: "unit" }, to: "base", type: "move" },
        optional: true,
        trigger: { event: "attack", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 2 energy + 1 chaos; enters the base exhausted as a 1-Might Poro; no chaos or only 1 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("poro")).toMatchObject({ isExhausted: true, might: 1, zone: "base" });
    expect(game.chain()).toEqual([]); // no play trigger
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "p").build()).p1.can("play", "p")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { chaos: 2 } }).hand(P1, CARD, "p").build()).p1.can("play", "p")).toBe(false);
  });

  test("YES vs a lone 3-Might Foe: pays exactly [1], Foe is moved to P2's base unharmed, no combat damage happens and the 1-Might Poro conquers bf1 (+1 point)", async () => {
    const game = await attack(3).build();
    await attackToPrompt(game);
    await payAndPick(game, "foe");
    expect(game.p1.energy()).toBe(0); // rule 383.3.b.1: cost paid at finalization
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("foe")).toBe("base");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe")).toMatchObject({ damage: 0, owner: P2 });
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("poro").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("NO keeps the energy: the plain 1-vs-3 fight kills only the Poro and P2 keeps bf1", async () => {
    const game = await attack(3).build();
    await attackToPrompt(game);
    await sayNo(game);
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("pay [1] with ZERO energy: the option cannot be accepted — Foe stays, the Poro dies", async () => {
    const game = await attack(3, 0).build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    } else if (d?.kind === "pick" && d.seat === P1) {
      expect((await game.p1.try((p) => p.pick("foe"))).ok).toBe(false);
      await game.p1.decline();
    }
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("'an ENEMY unit HERE': offered = exactly the two P2 units at bf1 — not Homebody (P2 base), not Elsewhere (bf2), not the friendly co-attacker Buddy, not the Poro", async () => {
    const game = await attack(3).unit(P2, "bf1", { might: 1, name: "Foe Two" }, "foe2").build();
    await attackToPrompt(game, ["poro", "buddy"]);
    const offered = await payAndPick(game, "foe");
    expect(offered).toEqual(["foe", "foe2"]);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.zoneOf("foe2")).toBe("trash"); // 1+3 vs the remaining 1-Might Foe Two
    expect(game.locationOf("buddy")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // With a single enemy here the choice is forced — no pick is even shown, Foe just goes home.
    const solo = await attack(3).build();
    await attackToPrompt(solo, ["poro", "buddy"]);
    expect(await payAndPick(solo, "foe")).toEqual([]);
    await solo.acting().passPriority();
    await solo.acting().passPriority();
    expect(solo.zoneOf("foe")).toBe("base");
    expect(solo.locationOf("buddy")).toBe("bf1"); // never a candidate
  });

  test("two defenders (5 and 2): bounce the 5 home, then Poro+Buddy (1+3) kill the 2 and take bf1 — the trigger reshapes the combat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { might: 3, name: "Buddy" }, "buddy")
      .build();
    await attackToPrompt(game, ["poro", "buddy"]);
    const offered = await payAndPick(game, "big");
    expect(offered).toEqual(["big", "small"]);
    await game.settle();
    expect(game.zoneOf("big")).toBe("base");
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.locationOf("buddy")).toBe("bf1"); // Small's 2 damage cannot kill the 3-Might Buddy
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("no trigger when DEFENDING: a raider attacking the Poro's battlefield creates no Poro chain item and no prompt; energy untouched", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().some((i) => i.cardId === "poro")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("no trigger without a combat: moving onto an EMPTY enemy-controlled battlefield just conquers it, no prompt, energy untouched", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "poro").build();
    await game.p1.move("poro", "bf1");
    expect(game.chain().some((i) => i.cardId === "poro")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.energy()).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("the bounced unit is MOVED, not killed or reset: an exhausted, Deathknell-free Foe arrives in base still exhausted and P2's trash stays empty", async () => {
    const g2 = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe", { exhausted: true })
      .unit(P1, "base", CARD, "poro")
      .build();
    await attackToPrompt(g2);
    await payAndPick(g2, "foe");
    await g2.settle();
    expect(g2.zoneOf("foe")).toBe("base");
    expect(g2.state("foe").isExhausted).toBe(true);
    expect(g2.p2.trash()).toEqual([]);
    expect(g2.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("partner — Blast Cone: the Poro's bounce is 'you move an enemy unit' → the Cone offers to exhaust itself and Stun the bounced Foe", async () => {
    const game = await attack(3).gear(P1, BLAST_CONE, "cone").build();
    await attackToPrompt(game);
    await payAndPick(game, "foe");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("foe")).toBe("base");
    // The Cone's move trigger: an optional exhaust-to-stun aimed at the moved unit.
    let asked = false;
    for (let i = 0; i < 6 && !asked; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "yes-no") {
        asked = true;
        await game.p1.yes();
      } else if (d?.seat === P1 && d.kind === "pick" && d.options.some((o) => o.card === "foe")) {
        asked = true;
        await game.p1.pick("foe");
      } else if (d?.kind === "action" && (d.context === "chain" || d.context === "showdown")) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(asked).toBe(true);
    await game.settle({ policy: "first" });
    expect(game.state("cone").isExhausted).toBe(true);
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
