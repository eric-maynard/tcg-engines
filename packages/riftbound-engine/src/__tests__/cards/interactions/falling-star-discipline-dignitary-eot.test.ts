/**
 * Interaction: Falling Star (ogn-029-298 · Spell · Fury · 2 + [fury][fury] · Action)
 *     "Deal 3 to a unit. Deal 3 to a unit."
 *   × Discipline (ogn-058-298 · Spell · Calm · 2 · Reaction)
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *   × Black Rose Dignitary (unl-152-219 · Unit · Order · 3 · 2 Might)
 *     "[Assault] [Deathknell] → Channel 1 rune exhausted."
 *
 * Rules: 317.2.b/c/d (Expiration Step = Ending Special Cleanup with 3c heal all units, THEN 3d all
 * 'this turn' effects expire simultaneously, THEN 3e rune pools empty), 323.4 / 323.5 (cleanup 3a/3b:
 * Deathknell triggers for, then kills, units with lethal damage — evaluated BEFORE 3c/3d), 142.4.b
 * (lethal = non-zero damage ≥ Might), 143.2.a, 808.1.c (Deathknell = "When I die"), 710 (units are
 * evaluated at CURRENT Might), 319.5 (a Cleanup follows every chain item leaving the chain).
 *
 * Question: P2's turn. P2's Falling Star names P1's Dignitary (2 Might) for one 3-damage instance; in
 * response P1 Disciplines the Dignitary (+2 → 4). Falling Star resolves: 3 damage on 4 Might, it
 * lives. P2 ends the turn.
 *  (a) Discipline was cast on P2's turn — does it expire at the end of P2's turn or P1's?  → P2's.
 *  (b) At end of turn the Dignitary is alive only because of the pump — does it die (Deathknell →
 *      rune) when the pump expires?  → No: 3a/3b see 3 < 4, 3c heals to 0, only then 3d drops the
 *      pump. It enters P1's turn at 2 Might, undamaged; no Deathknell, no extra rune.
 *  Contrast: without Discipline it dies in the Cleanup right after Falling Star resolves (mid-turn,
 *  on P2's turn) and the Deathknell channels then — not in the Ending Phase.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const DISCIPLINE = "ogn-058-298";
const DIGNITARY = "unl-152-219";

/** P2's turn 2, Main Phase. P1: Dignitary + a 6-Might Decoy in base, Discipline in hand, 2 energy, 0 runes (12 in the rune deck). P2: Falling Star + exact cost. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .resources(P1, { energy: 2 })
    .unit(P1, "base", DIGNITARY, "dignitary")
    .unit(P1, "base", { might: 6, name: "Decoy" }, "decoy")
    .hand(P2, FALLING_STAR, "star")
    .hand(P1, DISCIPLINE, "discipline");
}

/** P2 casts Falling Star (Dignitary, Decoy); P2 passes; P1 answers with Discipline on the Dignitary. Chain: [Star, Discipline]. */
async function starThenDiscipline(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("star", { targets: ["dignitary", "decoy"] });
  await game.p2.passPriority();
  await game.p1.cast("discipline", { targets: "dignitary" });
  return game;
}

describe("the response — Discipline (Reaction) on P2's turn, above Falling Star", () => {
  test("P1 gets priority on P2's Falling Star and may cast the Reaction; the chain is [Falling Star, Discipline] and Discipline resolves first: Dignitary 2 → 4, P1 draws 1", async () => {
    const game = await board().build();
    expect(game.state("dignitary")).toMatchObject({ damage: 0, might: 2 });
    await game.p2.cast("star", { targets: ["dignitary", "decoy"] });
    expect(game.chain().map((c) => c.name)).toEqual(["Falling Star"]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "discipline")).toBe(true);
    await game.p1.cast("discipline", { targets: "dignitary" });
    expect(game.chain().map((c) => [c.name, c.controller])).toEqual([
      ["Falling Star", P2],
      ["Discipline", P1],
    ]);
    expect(game.p1.energy()).toBe(0);
    const hand = game.p1.hand().length; // 0
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves (LIFO)
    expect(game.chain().map((c) => c.name)).toEqual(["Falling Star"]);
    expect(game.state("dignitary")).toMatchObject({ damage: 0, might: 4 });
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.zoneOf("discipline")).toBe("trash");
  });

  test("Falling Star then resolves: 3 damage on the now-4-Might Dignitary is NOT lethal (142.4.b) — it stays in base with 3 marked; Decoy takes the other 3; no Deathknell, no rune, still P2's turn", async () => {
    const game = await starThenDiscipline();
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("dignitary")).toBe("base");
    expect(game.state("dignitary")).toMatchObject({ damage: 3, might: 4 });
    expect(game.state("decoy")).toMatchObject({ damage: 3, might: 6 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(12);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
  });
});

describe("(a)+(b) P2 ends the turn — Expiration Step order: 3a/3b (no lethal) → 3c heal → 3d expire → 3e empty pools", () => {
  test("the Dignitary SURVIVES into P1's turn: healed to 0 damage first, then the pump expires → 2 Might, still in base, not in the trash", async () => {
    const game = await starThenDiscipline();
    await game.settle();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("dignitary")).toBe("base");
    expect(game.state("dignitary")).toMatchObject({ baseMight: 2, damage: 0, might: 2 });
    expect(game.p1.trash()).not.toContain("dignitary");
    expect(game.state("decoy")).toMatchObject({ damage: 0, might: 6 }); // 3c heals everyone
  });

  test("(a) 'this turn' = the turn it was cast in, whoever cast it: Discipline's +2 is already gone when P1's own turn opens (expired in P2's Expiration Step, 317.2.c) — it does not last through P1's turn", async () => {
    const game = await starThenDiscipline();
    await game.settle();
    expect(game.state("dignitary").might).toBe(4); // live during P2's turn
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.state("dignitary").might).toBe(2); // not 4: nothing left to expire at the end of P1's turn
    expect(game.state("dignitary").mightModifier).toBe(0);
  });

  test("(b) no death at end of turn ⇒ the Deathknell never triggers: nothing hits the chain across the turn change and P1 holds exactly the 2 READY Channel-Phase runes (rune deck 12 → 10) — no exhausted Deathknell rune", async () => {
    const game = await starThenDiscipline();
    await game.settle();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(10);
    expect(game.zoneOf("dignitary")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

describe("contrast — without Discipline the Dignitary dies MID-TURN, in the Cleanup after Falling Star resolves (319.5, 323.4/5), not in the Ending Phase", () => {
  test("Falling Star resolves → Dignitary (2 Might, 3 damage) is killed at once; its Deathknell goes on the chain as P1's trigger while it is still P2's Main Phase", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["dignitary", "decoy"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // no response — the spell resolves
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("dignitary")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, name: "Black Rose Dignitary", triggered: true })]);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(0); // not yet — the trigger is still pending
  });

  test("the Deathknell resolves on P2's turn: P1 channels 1 rune EXHAUSTED (pool 0 → 1, ready 0, rune deck 12 → 11) long before P2's Ending Phase; P2 then ends the turn normally", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["dignitary", "decoy"] });
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("dignitary")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(11);
    expect(game.p1.energy()).toBe(2); // P1 never spent its energy in this line …
    await game.p2.endTurn();
    await game.settle();
    // … and 3e emptied the pool at P2's end of turn (317.2.d); P1's turn: 1 Deathknell rune (readied by Awaken) + 2 channeled = 3.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runeDeck()).toHaveLength(9);
    expect(game.p1.trash()).toContain("dignitary");
    expect(game.violations()).toEqual([]);
  });
});
