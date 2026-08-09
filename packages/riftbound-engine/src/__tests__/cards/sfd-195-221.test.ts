/**
 * Blade Dancer — sfd-195-221 · Legend (Irelia) · Calm/Chaos
 *
 *   When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it.
 *   When you conquer, you may pay [1] to ready me.
 *
 * Rules: 383.4.b (a Targeting Effect: "when you choose" = when YOUR spell or ability TARGETS a friendly
 * unit; the trigger is put on the chain right after that spell/ability is finalized, i.e. ABOVE it, and
 * resolves first), 383.3.a/383.3.b (a leading "you may [cost] to …": the yes/no and the payment happen
 * as the trigger is finalized; "no" or an unpayable cost removes it), 135.2.e.5.a ([rainbow] = one power
 * of ANY domain), 355.10.d ("ready your units" chooses nothing), 144/446 (a Standard Move is not a
 * choice), 818.1.b.1 (an [Equip] target IS a choice — this card does not say "with a spell"), 383.4.c
 * (Conquer Effect for the conquering player), 108 ("friendly" = a unit you control).
 *
 * Head-judge checklist for THIS card:
 *  1. Ordering: the ready lands BEFORE the choosing spell resolves (chain [spell, bd] → bd first).
 *  2. Costs are real: no floating power → cannot accept; legend already exhausted → cannot accept; the
 *     rainbow is any domain (chaos, calm, fury… all fine); declining keeps legend + power.
 *  3. Friendly + you: your spell on an ENEMY unit, or the OPPONENT's spell on your unit → nothing.
 *  4. Not a choice: playing a unit, moving a unit → nothing. An [Equip] onto a friendly unit IS.
 *  5. Two friendly targets in one spell (Defiant Dance) → two triggers, ONE exhaust → exactly one ready.
 *  6. Second line: conquering (empty-battlefield showdown or combat) offers "pay [1]"; yes readies an
 *     exhausted Blade Dancer; 0 energy → cannot accept. The full Irelia loop in one turn: choose → ready
 *     the unit (legend exhausts) → it ganks, conquers → pay [1] → legend ready again.
 *  7. Partner Irelia, Fervent ("When you choose or ready me, +1"): one Discipline = choose (+1) + Blade
 *     Dancer ready (+1) + the spell (+2) → 8 and ready.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-195-221";
const CLEAVE = "ogn-004-298"; // Fury Action · 1 · Give a unit [Assault 3] this turn.
const DISCIPLINE = "ogn-058-298"; // Calm Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const DEFIANT_DANCE = "sfd-196-221"; // Calm/Chaos Reaction · 1 + [rainbow] · +2 to a unit, −2 to another unit this turn.
const REBUKE = "ogn-172-298"; // Chaos Action · 2 + [chaos][chaos] · Return a unit at a battlefield to its owner's hand.
const DORANS_SHIELD = "sfd-033-221"; // Calm Equipment · [Equip] [calm]
const IRELIA_FERVENT = "sfd-057-221"; // Calm unit · 5 · 4 Might · [Deflect] When you choose or ready me, give me +1 Might this turn.

function legend(meta?: { exhausted?: boolean }) {
  return scenario().card("bd", { def: CARD, meta, owner: P1, zone: "legendZone" });
}

const isBdPrompt = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "bd";

/** Pass priority/focus for whoever holds it until a non-action prompt or the open main phase; returns the pending decision. */
async function drain(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return d;
    }
    await game.seat(d.seat).pass();
  }
  return game.decision();
}

describe("Blade Dancer (sfd-195-221)", () => {
  test("registry payload: Irelia Calm/Chaos legend with two optional pay-cost triggers — choose-friendly-unit (exhaust + [rainbow] → ready it) and conquer ([1] → ready me)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Irelia", domain: ["calm", "chaos"], name: "Blade Dancer" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { exhaust: true, power: ["rainbow"] }, type: "pay-cost" },
        effect: { target: { type: "trigger-source" }, type: "ready" },
        optional: true,
        trigger: { event: "choose", on: { cardType: "unit", controller: "friendly" } },
        type: "triggered",
      },
      {
        condition: { cost: { energy: 1 }, type: "pay-cost" },
        effect: { target: "self", type: "ready" },
        optional: true,
        trigger: { event: "conquer", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("choose → asked at finalization; 'yes' exhausts the legend and spends one power of ANY domain (chaos) at once; the trigger sits ABOVE Discipline and readies the unit before the +2 lands", async () => {
    const game = await legend().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P1, "base", { might: 3 }, "ally", { exhausted: true }).hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([
      ["disc", false],
      ["bd", true],
    ]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "bd" } });
    expect(game.state("bd").isReady).toBe(true);
    await game.p1.yes();
    expect(game.state("bd").isExhausted).toBe(true); // cost paid on finalize (383.3.b.1)
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("ally").isExhausted).toBe(true); // not yet resolved
    await game.p1.passPriority();
    await game.p2.passPriority(); // bd resolves
    expect(game.state("ally")).toMatchObject({ isReady: true, might: 3 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    await game.settle();
    expect(game.state("ally")).toMatchObject({ isReady: true, might: 5 });
    expect(game.p1.hand()).toHaveLength(1); // Discipline's draw
    expect(game.violations()).toEqual([]);
  });

  test("declining: the item vanishes, legend stays ready, power kept, the unit stays exhausted and the spell still resolves", async () => {
    const game = await legend().resources(P1, { energy: 1, power: { calm: 1 } }).unit(P1, "base", { might: 3 }, "ally", { exhausted: true }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "ally" });
    expect(isBdPrompt(game.decision())).toBe(true);
    await game.p1.no();
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    await game.settle();
    expect(game.state("bd").isReady).toBe(true);
    expect(game.p1.power("calm")).toBe(1);
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [{ duration: "turn", keyword: "Assault", value: 3 }], isExhausted: true });
  });

  test("unpayable: with no floating power the offer cannot be accepted; with the legend already exhausted likewise — the unit stays exhausted either way", async () => {
    const broke = await legend().resources(P1, { energy: 1 }).unit(P1, "base", { might: 3 }, "ally", { exhausted: true }).hand(P1, CLEAVE, "cleave").build();
    await broke.p1.cast("cleave", { targets: "ally" });
    if (isBdPrompt(broke.decision())) {
      expect(broke.decision()).toMatchObject({ canAccept: false, kind: "yes-no" });
      expect((await broke.p1.try((p) => p.yes())).ok).toBe(false);
      await broke.p1.no();
    }
    await broke.settle();
    expect(broke.state("ally").isExhausted).toBe(true);
    expect(broke.state("bd").isReady).toBe(true);

    const tired = await legend({ exhausted: true }).resources(P1, { energy: 1, power: { chaos: 2 } }).unit(P1, "base", { might: 3 }, "ally", { exhausted: true }).hand(P1, CLEAVE, "cleave").build();
    await tired.p1.cast("cleave", { targets: "ally" });
    if (isBdPrompt(tired.decision())) {
      expect(tired.decision()).toMatchObject({ canAccept: false, kind: "yes-no" });
      await tired.p1.no();
    }
    await tired.settle();
    expect(tired.state("ally").isExhausted).toBe(true);
    expect(tired.p1.power("chaos")).toBe(2);
  });

  test("'friendly' and 'you': my Cleave on an ENEMY unit asks nothing; the OPPONENT's Rebuke choosing my unit asks nobody", async () => {
    const mine = await legend()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .unit(P2, "base", { might: 3 }, "foe", { exhausted: true })
      .hand(P1, CLEAVE, "cleave")
      .build();
    await mine.p1.cast("cleave", { targets: "foe" });
    expect(mine.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(isBdPrompt(mine.decision())).toBe(false);
    await mine.settle();
    expect(mine.state("foe").isExhausted).toBe(true);
    expect(mine.state("bd").isReady).toBe(true);

    const theirs = await legend()
      .active(P2)
      .resources(P1, { power: { chaos: 1 } })
      .resources(P2, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "ally", { exhausted: true })
      .hand(P2, REBUKE, "rebuke")
      .build();
    await theirs.p2.cast("rebuke", { targets: "ally" });
    expect(theirs.chain().map((c) => c.cardId)).toEqual(["rebuke"]);
    const d = await drain(theirs);
    expect(isBdPrompt(d)).toBe(false);
    expect(d?.seat === P2 && d.kind === "yes-no").toBe(false);
    await theirs.settle();
    expect(theirs.zoneOf("ally")).toBe("hand");
    expect(theirs.state("bd").isReady).toBe(true);
    expect(theirs.p1.power("chaos")).toBe(1);
  });

  test("not a choice: PLAYING a unit and a Standard MOVE never ask (355.10 / 446)", async () => {
    const game = await legend()
      .resources(P1, { energy: 2, power: { calm: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 3 }, "walker")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Rookie" }, "rookie")
      .build();
    await game.p1.play("rookie", { to: "base" });
    await game.settle();
    expect(isBdPrompt(game.decision())).toBe(false);
    await game.p1.move("walker", "bf1");
    await game.settle();
    expect(isBdPrompt(game.decision())).toBe(false);
    expect(game.state("walker").isExhausted).toBe(true);
    expect(game.state("bd").isReady).toBe(true);
    expect(game.p1.power("calm")).toBe(2);
  });

  test("an [Equip] onto a friendly unit is a targeted ABILITY choosing it (818.1.b.1 / 383.4.b) — Blade Dancer should offer to ready the wearer", async () => {
    // Expected: after Doran's Shield's Equip (a targeted activated ability — this legend does not say "with a
    // spell") is finalized on the exhausted ally, P1 gets the Blade Dancer yes/no; yes → ally ready, legend
    // exhausted, both calm spent. Actual: equipCard never emits the choose event; no prompt appears.
    const eq = await legend()
      .resources(P1, { power: { calm: 2 } })
      .unit(P1, "base", { might: 3 }, "ally", { exhausted: true })
      .gear(P1, DORANS_SHIELD, "shield")
      .build();
    await eq.p1.choose("equipCard:-", { params: { equipmentId: "shield", unitId: "ally" } });
    for (let i = 0; i < 8 && !isBdPrompt(eq.decision()); i++) {
      const d = eq.decision();
      if (!d || d.kind !== "action" || d.context === "main") {
        break;
      }
      await eq.seat(d.seat).pass();
    }
    expect(isBdPrompt(eq.decision())).toBe(true);
    await eq.p1.yes();
    await eq.settle();
    expect(eq.state("shield").attachedTo).toBe("ally");
    expect(eq.state("ally").isReady).toBe(true);
    expect(eq.state("bd").isExhausted).toBe(true);
    expect(eq.p1.power("calm")).toBe(0); // one for Equip, one for Blade Dancer
  });

  test("two friendly units chosen by ONE Defiant Dance → two triggers, but the legend exhausts once: exactly one of them is readied", async () => {
    const game = await legend()
      .resources(P1, { energy: 1, power: { chaos: 3 } })
      .unit(P1, "base", { might: 4, name: "A" }, "a", { exhausted: true })
      .unit(P1, "base", { might: 4, name: "B" }, "b", { exhausted: true })
      .hand(P1, DEFIANT_DANCE, "dance")
      .build();
    await game.p1.cast("dance", { targets: ["a", "b"] });
    expect(game.chain().filter((c) => c.cardId === "bd")).toHaveLength(2);
    let accepted = 0;
    for (let i = 0; i < 24; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        if (d.canAccept === false) {
          await game.p1.no();
        } else {
          await game.p1.yes();
          accepted += 1;
        }
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(accepted).toBe(1);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.power("chaos")).toBe(1); // 1 for the Dance pip, 1 for the single accepted trigger
    expect([game.state("a").isReady, game.state("b").isReady].filter(Boolean)).toHaveLength(1);
    expect([game.state("a").might, game.state("b").might]).toEqual([6, 2]);
  });

  test("When you conquer, you may pay [1] to ready me: taking an empty battlefield asks; 'yes' spends 1 energy and readies the exhausted legend", async () => {
    const game = await legend({ exhausted: true }).resources(P1, { energy: 1 }).battlefield("bf1").unit(P1, "base", { might: 3 }, "ally").build();
    await game.p1.move("ally", "bf1");
    const d = await drain(game);
    expect(isBdPrompt(d)).toBe(true);
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no" });
    expect(game.p1.points()).toBe(1); // the point is already scored when the Conquer Effect is offered (383.4.c.2.b)
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("bd").isReady).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("conquer negatives: 0 energy → cannot accept (legend stays exhausted, point still scored); declining with energy keeps the energy; the OPPONENT conquering asks me nothing", async () => {
    const broke = await legend({ exhausted: true }).battlefield("bf1").unit(P1, "base", { might: 3 }, "ally").build();
    await broke.p1.move("ally", "bf1");
    const d = await drain(broke);
    if (isBdPrompt(d)) {
      expect(d).toMatchObject({ canAccept: false });
      await broke.p1.no();
    }
    await broke.settle();
    expect(broke.state("bd").isExhausted).toBe(true);
    expect(broke.p1.points()).toBe(1);

    const shrug = await legend({ exhausted: true }).resources(P1, { energy: 1 }).battlefield("bf1").unit(P1, "base", { might: 3 }, "ally").build();
    await shrug.p1.move("ally", "bf1");
    expect(isBdPrompt(await drain(shrug))).toBe(true);
    await shrug.p1.no();
    await shrug.settle();
    expect(shrug.state("bd").isExhausted).toBe(true);
    expect(shrug.p1.energy()).toBe(1);

    const opp = await legend({ exhausted: true }).active(P2).resources(P1, { energy: 1 }).resources(P2, { energy: 1 }).battlefield("bf1").unit(P2, "base", { might: 3 }, "raider").build();
    await opp.p2.move("raider", "bf1");
    const od = await drain(opp);
    expect(isBdPrompt(od)).toBe(false);
    expect(od?.kind === "yes-no" && od.seat === P2).toBe(false);
    await opp.settle();
    expect(opp.p2.points()).toBe(1);
    expect(opp.state("bd").isExhausted).toBe(true);
    expect(opp.p1.energy()).toBe(1);
  });

  test("the Irelia loop in one turn: Cleave chooses the exhausted Ganker → legend exhausts to ready it → it ganks into a 2-Might defender with Assault 3, conquers → pay [1] → legend ready again", async () => {
    const game = await legend()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { keywords: ["Ganking"], might: 3, name: "Ganker" }, "ganker", { exhausted: true })
      .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "ganker" });
    expect(isBdPrompt(game.decision())).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.state("ganker")).toMatchObject({ grantedKeywords: [{ duration: "turn", keyword: "Assault", value: 3 }], isReady: true });
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0 } });
    await game.p1.gank("ganker", "bf2");
    const d = await drain(game);
    expect(game.zoneOf("sentry")).toBe("trash"); // 3 + 3 Assault = 6 ≥ 2
    expect(game.locationOf("ganker")).toBe("bf2"); // took 2 < 3
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(isBdPrompt(d)).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("bd").isReady).toBe(true); // ready to do it all again
  });

  test("partner Irelia, Fervent (exhausted, 4): one Discipline = choose (+1) → Blade Dancer readies her (+1 'ready me') → +2 → 8 Might and ready this turn; 4 again next turn", async () => {
    const game = await legend().resources(P1, { energy: 2, power: { calm: 1 } }).unit(P1, "base", IRELIA_FERVENT, "ire", { exhausted: true }).hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "ire" });
    for (let i = 0; i < 24; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (isBdPrompt(d)) {
        await game.p1.yes();
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 8 });
    await game.advanceTurn();
    expect(game.state("ire").might).toBe(4);
  });
});
