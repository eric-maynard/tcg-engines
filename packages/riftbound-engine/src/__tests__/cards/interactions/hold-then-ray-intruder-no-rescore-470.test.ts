/**
 * Interaction: Ride the Wind (ogn-173-298) · [2]+[chaos] · "[Action] Move a friendly unit and ready it."
 *   × Hextech Ray (ogn-009-298) · [1]+[fury] · "[Action] Deal 3 to a unit at a battlefield."
 *   × Plundering Poro (sfd-069-221) · 2 Might · "When I conquer, play a Gold gear token exhausted."
 *
 * Question: P2's turn. P2 controls bfB with a lone vanilla 2-Might Guard and scores the Hold there in the
 * Beginning Phase. Main phase: P2 Standard-Moves Plundering Poro base → empty uncontrolled bfA → Non-Combat
 * Showdown at bfA, P2 Focus, P2 passes. P1 (Focus, on P2's turn) plays Ride the Wind moving P1's vanilla 3-Might
 * Raider from base into bfB where the Guard stands. Does a second showdown/combat open at bfB immediately while
 * bfA's showdown is ongoing? When bfA closes does P2 conquer it? Then at bfB: stand-alone showdown or Combat, who
 * is Attacker/Defender and who has Focus (P2's turn, but P1 applied Contested)? P1 passes; DEFENDER P2 plays
 * Hextech Ray killing the Raider. After all pass: does bfB stay P2's, and does P2 score bfB AGAIN (a third point
 * this turn)? Contrast: P2 passes instead of Raying.
 *
 * Rules: 469.2 (Hold in the Beginning Phase), 470 (score each battlefield at most once per turn, either method),
 * 450 / 190.3.a (arriving where you don't control applies Contested), 323.8/323.9 (Showdown / Combat staged),
 * 323.12–323.14 / 344.2 / 460 (a staged showdown/combat only OPENS from a Neutral Open Cleanup — not while
 * another showdown is ongoing elsewhere), 345 / 347.1 / 347.1.b / 347.2.b (Focus: contester first; an [Action]
 * is legal for the Focus holder even on the opponent's turn; Focus passes when that chain closes / on a pass),
 * 348.1 / 348.2.a / 348.2.a.1 (showdown ends → the player with units establishes control → Conquer), 464.1 /
 * 464.2 / 464.2.c.1 / 464.2.d (Combat opens with a Combat Showdown; Attacker = whose unit applied Contested —
 * not necessarily the Turn Player — and gains Focus), 466.3.a (sole side left wins), 466.5 / 466.5.a / 466.5.d
 * (control is only ESTABLISHED by a player who did not already control it → no Conquer for the sitting
 * controller; Contested cleared), 469.1, 323.5 (lethal damage kills at the Cleanup).
 *
 * Expected: Hold bfB → P2 1. Poro contests bfA → Non-Combat Showdown, P2 Focus → pass → P1 Focus → Ride the
 * Wind: Raider to bfB readied, bfB Contested by P1 — but NOTHING opens at bfB yet (bfA's showdown is ongoing);
 * Focus → P2. pass/pass → bfA closes → P2 conquers bfA → 2; Poro → Gold token exhausted. Next Cleanup (Neutral
 * Open, Combat staged at bfB) → Combat begins at bfB: Attacker P1 / Defender P2, Raider attacker, Guard
 * defender, P1 Focus. P1 pass → P2 Focus → Hextech Ray kills the Raider → Focus P1 → pass/pass → no attackers:
 * P2 wins, ALREADY controls bfB → no Conquer, and 470 forbids a second bfB score anyway → P2 ends on exactly 2
 * (Hold B + Conquer A), P1 0. Contrast (P2 passes): Raider 3 kills Guard 2, survives → P1 conquers bfB on P2's
 * turn → P1 1, P2 still 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const HEXTECH_RAY = "ogn-009-298";
const PLUNDERING_PORO = "sfd-069-221";

type Showdown = {
  active?: boolean;
  attackingPlayer?: string | null;
  defendingPlayer?: string | null;
  battlefieldId?: string;
  focusPlayer?: string | null;
  isCombatShowdown?: boolean;
};

const showdowns = (game: Game): Showdown[] => (game.gameState.interaction?.showdownStack as Showdown[] | undefined) ?? [];
const showdown = (game: Game): Showdown | undefined => showdowns(game).at(-1);

/**
 * P1 is about to end turn 3. P2: controls bfB with a lone Guard (2), Poro in base, Hextech Ray in hand, two fury
 * runes (tap 1 + recycle 1 = [1]+[fury]). P1: Raider (3) in base, Ride the Wind in hand, three chaos runes
 * (tap 2 + recycle 1 = [2]+[chaos]). bfA is empty and uncontrolled.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .rune(P1, "chaos", { alias: "c1" })
    .rune(P1, "chaos", { alias: "c2" })
    .rune(P1, "chaos", { alias: "c3" })
    .rune(P2, "fury", { alias: "f1" })
    .rune(P2, "fury", { alias: "f2" })
    .battlefield("bfA", { controller: null })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", PLUNDERING_PORO, "poro")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** P1 ends → P2's Beginning Phase holds bfB → P2's main phase; Poro Standard-Moves to bfA (Non-Combat Showdown, P2 Focus). */
async function holdThenPoro(): Promise<Game> {
  const game = await board().build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.move("poro", "bfA");
  return game;
}

/** P2 passes Focus; P1 floats [2]+[chaos] and casts Ride the Wind on the Raider → bfB; both pass so it resolves. */
async function rideIntoBfB(game: Game): Promise<void> {
  await game.p2.passFocus();
  await game.p1.tapRune("c1");
  await game.p1.tapRune("c2");
  await game.p1.recycleRune("c3");
  await game.p1.cast("ride", { targets: "raider" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bfB");
  }
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Both pass Focus at bfA → it closes (P2 conquers); Poro's conquer trigger is passed through and resolves. */
async function closeBfA(game: Game): Promise<void> {
  await game.p2.passFocus();
  await game.p1.passFocus();
  for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
}

/**
 * Combat at bfB. The rules begin it in the Cleanup itself (323.13); the engine currently waits for a manual
 * `startShowdown` from the turn player (flagged as a BUG below) — take it when offered so the rest can be checked.
 */
async function combatAtBfB(): Promise<Game> {
  const game = await holdThenPoro();
  await rideIntoBfB(game);
  await closeBfA(game);
  if (game.p2.can("startShowdown")) {
    await game.p2.choose("startShowdown:bfB");
  }
  return game;
}

/** In the bfB combat: P1 passes Focus, P2 floats [1]+[fury] and Rays the Raider; both pass so it resolves. */
async function rayTheRaider(game: Game): Promise<void> {
  await game.p1.passFocus();
  await game.p2.tapRune("f1");
  await game.p2.recycleRune("f2");
  await game.p2.cast("ray", { targets: "raider" });
  await game.p2.passPriority();
  await game.p1.passPriority();
}

describe("Hold bfB, conquer bfA, then defend bfB with Hextech Ray — no re-score of bfB (470 / 466.5)", () => {
  test("Beginning Phase: P2 HOLDS bfB with the lone Guard → P2 1, bfB recorded as scored by P2 this turn (469.2)", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn).toEqual({ [P1]: [], [P2]: ["bfB"] });
  });

  test("Poro → empty bfA: Contested by P2 (450), a NON-combat Showdown opens there with P2 on Focus (323.12/344.2/345); P2's pass hands Focus to P1 (347.2.b)", async () => {
    const game = await holdThenPoro();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdowns(game)).toHaveLength(1);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: false });
    expect(game.state("poro").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("P1, holding Focus on P2's turn, may cast the [Action] Ride the Wind (347.1): Raider is offered, and the destination prompt offers bfB (where the Guard stands)", async () => {
    const game = await holdThenPoro();
    await game.p2.passFocus();
    await game.p1.tapRune("c1");
    await game.p1.tapRune("c2");
    await game.p1.recycleRune("c3");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { targets: "raider" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bfB");
    await game.p1.pick("battlefield-bfB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ride", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("Ride the Wind resolves: Raider is at bfB and READY; bfB is now Contested by P1 but still controlled by P2 (450, 190.4.b)", async () => {
    const game = await holdThenPoro();
    await rideIntoBfB(game);
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ isExhausted: false, zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("NO second showdown/combat opens at bfB while bfA's showdown is ongoing (323.12–14/460): the stack still holds only bfA, Raider/Guard carry no designation, and Focus at bfA passes to P2 as P1's chain closes (347.1.b)", async () => {
    const game = await holdThenPoro();
    await rideIntoBfB(game);
    expect(showdowns(game)).toHaveLength(1);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", isCombatShowdown: false });
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.points()).toBe(1); // nothing new scored yet
  });

  test("P2 pass, P1 pass → bfA's showdown ends: P2 (only units there) establishes control = CONQUER (348.2.a) → P2 2; Poro's 'When I conquer' goes on the chain under P2", async () => {
    const game = await holdThenPoro();
    await rideIntoBfB(game);
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(2);
    expect(game.gameState.scoredThisTurn?.[P2]).toEqual(["bfB", "bfA"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true })]);
    expect(showdowns(game)).toEqual([]); // bfA is over; bfB has not begun during the trigger's Closed state
  });

  test("Poro's trigger resolves: a Gold gear TOKEN enters P2's base EXHAUSTED", async () => {
    const game = await holdThenPoro();
    await rideIntoBfB(game);
    await closeBfA(game);
    const gear = game.p2.gear();
    expect(gear).toHaveLength(1);
    expect(game.state(gear[0] as string)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold", zone: "base" });
  });

  test("with the chain empty (Neutral Open) and a Combat staged at bfB, that Cleanup BEGINS the combat by itself (323.13/464.1) — P2 must not get a discretionary main-phase window first", async () => {
    // Right after Poro's trigger resolves the next decision is the Combat Showdown at bfB with P1
    // (the contester/Attacker) on Focus — no main-phase window for P2 in between.
    const game = await holdThenPoro();
    await rideIntoBfB(game);
    await closeBfA(game);
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("move")).toBe(false);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("at bfB it is a COMBAT (opening with a Combat Showdown, 464.1/464.2), not a stand-alone showdown: Attacker = P1 (its unit applied Contested, 464.2.c.1) although P2 is the Turn Player; Raider attacker, Guard defender", async () => {
    const game = await combatAtBfB();
    expect(game.turnPlayer()).toBe(P2);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("poro").combatRole).toBeNull(); // at bfA — not in this combat
    expect(game.chain()).toEqual([]); // no combat triggers → no Combat Chain
  });

  test("P1 (Attacker) gains Focus first (464.2.d): P1 decides; P2 — turn player and defender — cannot Ray yet", async () => {
    const game = await combatAtBfB();
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "ray")).toBe(false);
  });

  test("P1 passes → P2 Focus → Hextech Ray is legal for the DEFENDER and offers the Raider; on resolution the Raider (3 dmg on 3 Might) is killed at the Cleanup (323.5) and Focus returns to P1 (347.1.b)", async () => {
    const game = await combatAtBfB();
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    await game.p2.tapRune("f1");
    await game.p2.recycleRune("f2");
    expect(game.p2.can("cast", "ray")).toBe(true);
    const field = game.p2.option("cast", "ray")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("raider");
    await game.p2.cast("ray", { targets: "raider" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p1.trash()).toContain("raider");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("P1 pass, P2 pass → combat proceeds with no attackers: no damage, Defender P2 wins (466.3.a); P2 ALREADY controls bfB → control is not (re)established → NO Conquer, and 470 forbids a second bfB score — P2 stays on exactly 2, Contested cleared (466.5.a)", async () => {
    const game = await combatAtBfB();
    await rayTheRaider(game);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(showdowns(game)).toEqual([]);
    expect(game.state("guard")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(2); // Hold bfB + Conquer bfA — NOT 3
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn).toEqual({ [P1]: [], [P2]: ["bfB", "bfA"] });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p2.can("endTurn")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 passes instead of Raying: Raider 3 kills Guard 2, takes 2 and survives (healed); P1 wins and ESTABLISHES control of bfB → P1 CONQUERS on P2's turn (466.5/.d) → P1 1; P2 still exactly 2", async () => {
    const game = await combatAtBfB();
    const r = await game.settle(); // P1 pass, P2 pass → combat damage → resolution
    expect(r.reason).toBe("open");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bfB" });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(2);
    expect(game.gameState.scoredThisTurn).toEqual({ [P1]: ["bfB"], [P2]: ["bfB", "bfA"] });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
