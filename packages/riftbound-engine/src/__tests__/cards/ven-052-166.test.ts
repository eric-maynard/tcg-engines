/**
 * Mesmerize — ven-052-166 · Spell · Mind · 1 energy + [mind] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose one — Return a friendly unit to its owner's hand. · Give an enemy unit -2 [Might] this turn.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. Two modes with OPPOSITE targeting sides: mode A only ever offers friendly units, mode B only enemy
 *      units; each mode has exactly one target and the other mode's effect must not also happen.
 *   2. Mode B on a DAMAGED unit is removal: a 3-Might unit carrying 1 damage drops to 1 Might with nonzero
 *      damage ≥ Might → killed on the spot (143.2.a). On an undamaged 2-Might unit it is NOT (0 Might, but
 *      no damage marked); Might below 0 reads as 0 (143.2.b). "-2 this turn" is gone after the turn ends.
 *   3. Reaction in combat (813): the defender, on the OPPONENT's turn, shrinks a 4-Might attacker to 2 →
 *      the 3-Might defender survives (2 < 3) and kills it (3 ≥ 2) → no conquer.
 *   4. Mode A as a save: in response to an enemy bolt, bounce the target — the bolt has no legal target
 *      left and does nothing; the unit is safe in hand (LIFO).
 *   5. Reaction ≠ "any time at all" (316.5.b): in the opponent's neutral open state P1 holds no priority.
 *   6. 355.3 / 355.5: the mode AND its target are locked in AS the spell is played, before anyone can
 *      respond — `cast(c, {mode, targets})`, or a bare `cast(c)` that is asked mode → target at once.
 *   7. Cost: exactly 1 energy + 1 mind.
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-052-166";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P1's turn: friendly Ally(2)@bf1 + Home(2)@base; enemy Foe(3, 1 damage)@bf1 + Tiny(2)@P2 base; Mesmerize + 1/[mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe", { damage: 1 })
    .unit(P2, "base", { might: 2, name: "Tiny" }, "tiny")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally", { damage: 1, exhausted: true })
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .hand(P1, CARD, "mes");
}

/**
 * Cast Mesmerize bare: the mode prompt comes AT ONCE (rule 355.3), labelled with the printed bullets;
 * choose `mode`; returns the target prompt that follows (355.5) — all before anyone gets priority.
 */
async function castMode(game: Game, mode: 0 | 1): Promise<PickDecision> {
  await game.p1.cast("mes");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "mode", timing: "FIN" });
  expect(d.options.map((o) => o.label)).toEqual(["Return a friendly unit to its owner's hand", "Give an enemy unit -2 [Might] this turn"]);
  await game.p1.chooseMode(mode);
  const t = game.decision() as PickDecision;
  expect(t).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
  return t;
}

/** Answer the play-time target prompt, check it rides on the chain item, then let the spell resolve. */
async function pickAndResolve(game: Game, target: string): Promise<void> {
  await game.p1.pick(target);
  expect(game.chain().at(-1)).toMatchObject({ cardId: "mes", targets: [target] });
  await game.settle();
}

describe("Mesmerize (ven-052-166)", () => {
  test("registry payload matches the printed text: Reaction, 1 + [mind], choice of [return friendly unit to hand | enemy unit -2 Might this turn]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 1, name: "Mesmerize", powerCost: ["mind"], timing: "reaction" });
    expect(def?.abilities).toEqual([
      {
        effect: {
          options: [
            { effect: { target: { controller: "friendly", type: "unit" }, type: "return-to-hand" }, label: "Return a friendly unit to its owner's hand" },
            { effect: { amount: -2, duration: "turn", target: { controller: "enemy", type: "unit" }, type: "modify-might" }, label: "Give an enemy unit -2 [Might] this turn" },
          ],
          type: "choice",
        },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("cost: exactly 1 energy + 1 mind is deducted on cast; missing either piece → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("mes", { mode: 1, targets: "tiny" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mes", controller: P1, mode: 1, targets: ["tiny"], triggered: false })]);
    const noMind = await board().resources(P1, { energy: 3, power: { mind: 0, fury: 2 } }).build();
    expect(noMind.p1.can("cast", "mes")).toBe(false);
    const noEnergy = await board().resources(P1, { energy: 0, power: { mind: 2 } }).build();
    expect(noEnergy.p1.can("cast", "mes")).toBe(false);
  });

  test("mode A offers ONLY friendly units; returning the exhausted, damaged Ally puts it in P1's hand clean; Foe untouched; spell → trash", async () => {
    const game = await board().build();
    const t = await castMode(game, 0);
    expect(t.options.map((o) => o.card).sort()).toEqual(["ally", "home"]);
    await pickAndResolve(game, "ally");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toContain("ally");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: false });
    expect(game.state("foe")).toMatchObject({ damage: 1, might: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("mes")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("mode B offers ONLY enemy units; on undamaged 2-Might Tiny: Might reads 0 (143.2.b) but it is NOT killed (no damage marked); nobody bounced", async () => {
    const game = await board().build();
    const t = await castMode(game, 1);
    expect(t.options.map((o) => o.card).sort()).toEqual(["foe", "tiny"]);
    await pickAndResolve(game, "tiny");
    expect(game.state("tiny")).toMatchObject({ might: 0, mightModifier: -2, zone: "base" });
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // the other mode did not also happen
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("mes")).toBe("trash");
  });

  test("'this turn': the -2 is gone once the turn ends (Tiny is back to 2 on P2's turn)", async () => {
    const game = await board().build();
    await castMode(game, 1);
    await pickAndResolve(game, "tiny");
    expect(game.state("tiny").might).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("tiny")).toMatchObject({ might: 2, mightModifier: 0 });
  });

  test("mode B as removal: Foe (3 Might, 1 damage) at -2 has nonzero damage ≥ Might → killed immediately (143.2.a)", async () => {
    const game = await board().build();
    // rule 355.3 — the same choices named on the play itself: nothing is asked.
    await game.p1.cast("mes", { mode: 1, targets: "foe" });
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("tiny")).toBe("base");
  });

  test("Reaction in combat on the OPPONENT's turn: shrink the 4-Might attacker to 2 → my 3-Might defender survives and kills it; bf1 stays mine, no point for P2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "mes")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("cast", "mes")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("mes");
    await game.p1.chooseMode(1); // Raider is the only enemy unit → bound without a further prompt
    expect(game.chain().at(-1)).toMatchObject({ cardId: "mes", mode: 1, targets: ["raider"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mesmerize resolves inside the showdown
    expect(game.state("raider")).toMatchObject({ might: 2, mightModifier: -2 });
    expect(game.state("holder").might).toBe(3); // a friendly unit is never a mode-B target
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("mes")).toBe("trash");
  });

  test("mode A as a save (LIFO): P2 bolts Home for 3; P1 responds by bouncing Home → Mesmerize resolves first, the bolt finds nothing, Home sits in hand", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    expect(game.p1.can("cast", "mes")).toBe(false); // 316.5.b: no priority in P2's neutral open state
    await game.p2.cast("bolt", { targets: "home" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "mes")).toBe(true);
    await game.p1.cast("mes", { mode: 0, targets: "home" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "mes"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mesmerize resolves (LIFO)
    expect(game.zoneOf("home")).toBe("hand");
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("home")).toBe("hand");
    expect(game.state("home").damage).toBe(0);
    expect(game.zoneOf("mes")).toBe("trash");
  });

  test("mode B mid-chain does not stop the enemy spell: shrink Tiny in response, then the bolt still deals 3 to Home and kills it", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    await game.p2.cast("bolt", { targets: "home" });
    await game.p2.passPriority();
    await game.p1.cast("mes", { mode: 1, targets: "tiny" });
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.state("tiny").might).toBe(0);
  });

  // rule 355.3: "For Spells … with a bulleted list of modes to choose from, make the appropriate choices
  // now" — the mode (and its target, 355.5) is fixed while Mesmerize is being played, before priority.
  test("the mode is chosen as Mesmerize is played (355.3), before anyone can respond", async () => {
    const game = await board().build();
    // Either the play bundle itself carries a mode/target choice …
    const choseAtPlay = (game.p1.option("cast", "mes")?.fields ?? []).some((f) => f.arg === "targets" || /mode/i.test(f.name));
    await game.p1.cast("mes").catch(() => undefined); // (would throw AMBIGUOUS_ACTION if a mode field existed)
    // … or the very next decision, before P2 ever holds priority, is P1's mode pick.
    const d = game.decision();
    const askedNow = d?.kind === "pick" && d.seat === P1 && d.semantics === "mode";
    expect(choseAtPlay || askedNow).toBe(true);
  });
});
