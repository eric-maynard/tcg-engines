/**
 * Ruling 27546ebadb98960a — Kha'Zix, Mutating Horror (UNL-143 → unl-143-219, 4 + [chaos], 4 Might)
 *   "[Ambush] When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP."
 *   × Spectral Centaur (UNL-068 → unl-068-219, 5 Might) — my attacker   × "Master Yi" — his lone defender
 *   × Forbidding Waste (UNL-210 → unl-210-219) "While a unit here is defending alone, it has -2 [Might]."
 *
 * Q: My Centaur attacks his lone Master Yi at Forbidding Waste. I Ambush Kha'Zix in (Yi is alone → trigger). He responds
 *    by Ambushing HIS Kha'Zix. When the chain finishes we both have 2 units — does my Kha'Zix still get +2 and 2 XP?
 * A: Yes. The condition "an enemy unit is alone here" was true when my Kha'Zix gained its Attacker designation and the
 *    trigger was put on the chain; his Kha'Zix arriving before it resolves doesn't matter. (His own Kha'Zix sees two
 *    enemy units — no bonus for it.)
 * Rules: 383 (trigger condition evaluated when the ability triggers), 340 (LIFO), 800 (Ambush = play as a Reaction to a
 *        battlefield where you have units), 740.2.a ("alone").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-143-219";
const SPECTRAL_CENTAUR = "unl-068-219";
const FORBIDDING_WASTE = "unl-210-219";

/**
 * P1's turn. P2 holds Forbidding Waste (live) with a lone 5-Might "Master Yi". P1: Spectral Centaur ready in base and
 * Kha'Zix in hand; P2: its own Kha'Zix in hand; each has exactly 4 + [chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("fw", { controller: P2, def: FORBIDDING_WASTE, inert: false, owner: P2 })
    .unit(P2, "fw", { might: 5, name: "Master Yi" }, "yi")
    .unit(P1, "base", SPECTRAL_CENTAUR, "centaur")
    .hand(P1, KHAZIX, "myKz")
    .hand(P2, KHAZIX, "hisKz");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Centaur attacks Yi; P1 (Focus) Ambushes Kha'Zix into the Waste → its attack trigger is on the chain. */
async function ambushMine(game: Game): Promise<void> {
  await game.p1.move("centaur", "fw");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "fw", defendingPlayer: P2, isCombatShowdown: true });
  expect(game.state("yi").might).toBe(3); // Forbidding Waste: defending alone → -2
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("play", "myKz")).toBe(true); // Ambush: playable as a Reaction to a battlefield where P1 has units
  await game.p1.play("myKz", { to: "fw" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
}

describe("Ruling 27546ebadb98960a — Kha'Zix's 'enemy alone here' is locked in when it triggers; a responding Ambush doesn't undo it", () => {
  test("my Kha'Zix enters the Waste as an ATTACKER while Yi is the only enemy there → its trigger goes on the chain (P1's item); nothing granted yet", async () => {
    const game = await board().build();
    await ambushMine(game);
    expect(game.locationOf("myKz")).toBe("fw");
    expect(game.state("myKz")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.p2.units("fw")).toEqual(["yi"]); // the enemy IS alone right now
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "myKz", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0);
  });

  test("P2 responds by Ambushing his own Kha'Zix: it is at the Waste (a defender) BEFORE my trigger resolves — Yi is no longer alone (his -2 switches off) — and his Kha'Zix gets no trigger of its own (two enemy units here)", async () => {
    const game = await board().build();
    await ambushMine(game);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("play", "hisKz")).toBe(true);
    await game.p2.play("hisKz", { to: "fw" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.locationOf("hisKz")).toBe("fw");
    expect(game.state("hisKz").combatRole).toBe("defender");
    expect(game.p2.units("fw").sort()).toEqual(["hisKz", "yi"]);
    expect(game.state("yi").might).toBe(5);
    // My trigger is still pending; his Kha'Zix added none (Centaur + my Kha'Zix: no enemy is alone for it).
    expect(game.chain().filter((c) => c.triggered).map((c) => c.cardId)).toEqual(["myKz"]);
    expect(game.state("myKz").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });

  test("my trigger then resolves and STILL pays out although both sides now have two units: my Kha'Zix is 6 this turn and I gain 2 XP; his Kha'Zix stays 4 with 0 XP", async () => {
    const game = await board().build();
    await ambushMine(game);
    await game.p1.passPriority();
    await game.p2.play("hisKz", { to: "fw" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("myKz")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
    expect(game.state("hisKz")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p2.xp()).toBe(0);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "fw", isCombatShowdown: true });
    expect(game.violations()).toEqual([]);
  });
});
