/**
 * Interaction: Cleave (ogn-004-298) · Spell · Fury · 1 · [Action] — "Give a unit [Assault 3] this turn."
 *   × Rune Prison (ogn-050-298) · Spell · Calm · 2+[calm] · [Action] — "Stun a unit."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla defender)
 *
 * Board: P2's turn. P2 attacks P1's bfA (lone Vanguard Sergeant, 4) with a vanilla 4-Might Raider; no
 * triggers → the Combat Showdown opens with the attacker P2 holding Focus. P2 holds Cleave and Rune Prison.
 * Line: P2 plays Cleave → both pass priority → resolves → (Focus auto-passes to P1, 346) → P1 passes → ???
 *
 * Judge question (RiftJudge #4174 shape): does P1's pass END the showdown because "P2's chain resolving +
 * P1 passing" looks like two consecutive passes — or does Focus return to P2, who may now play Rune Prison
 * as a second action? When does the showdown actually close, and does creating a chain reset the pass count?
 *
 * Rules: 346 (chain empties during a showdown → Focus passes automatically WITH priority — this is not a
 * 347.2 Pass), 347.1 / 347.1.a / 347.1.b (Focus holder plays a legally-timed card; when that chain closes
 * Focus passes on), 347.2 / 347.2.a / 347.2.b (Pass: showdown ends only when ALL players passed once in
 * sequence, else Focus moves on), 348 / 348.1 ("pass without playing" → close → remaining combat steps),
 * 313.2 / 313.3 (Focus is always held by exactly one Relevant Player during a showdown), 337.4, 465.2.
 *
 * Expected: after Cleave resolves passedPlayers = []; P1's pass makes it [P1] and hands Focus to P2 — the
 * showdown is STILL OPEN. P2 plays Rune Prison on the Sergeant (legal), which resets the pass sequence;
 * it resolves (Sergeant stunned), Focus → P1, passedPlayers = []. P1 passes → P2; P2 passes → NOW all have
 * passed in sequence → showdown closes → combat: Raider 4+3 = 7 kills the Sergeant, the stunned Sergeant
 * deals nothing → Raider survives, P2 conquers bfA. Invariant: focusPlayer ∈ {P1,P2} throughout.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const RUNE_PRISON = "ogn-050-298";
const VANGUARD_SERGEANT = "ogn-219-298";

function board() {
  return scenario()
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", VANGUARD_SERGEANT, "sarge")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .resources(P2, { energy: 3, power: { calm: 1 } }) // Cleave 1 + Rune Prison 2+[calm], exactly
    .hand(P2, CLEAVE, "cleave")
    .hand(P2, RUNE_PRISON, "prison");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const focus = (game: Game) => {
  const sd = showdown(game);
  return sd?.active ? sd.focusPlayer : null;
};

function expectShowdownOpenWithFocus(game: Game, seat: string): void {
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfA", focusPlayer: seat, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat });
}

/** P2 attacked; Cleave played on the Raider, both passed priority, it resolved. */
async function cleaveResolved(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfA");
  expect(game.chain()).toEqual([]); // no triggers
  expectShowdownOpenWithFocus(game, P2);
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, passedPlayers: [] });
  await game.p2.cast("cleave", { targets: "raider" });
  expect([focus(game), game.decision()?.seat, game.decision()?.kind === "action" ? game.decision()?.context : ""]).toEqual([P2, P2, "chain"]); // (P2, P2, closed)
  await game.p2.passPriority();
  expect([focus(game), game.decision()?.seat]).toEqual([P2, P1]); // (P1 priority, P2 focus)
  await game.p1.passPriority(); // resolves
  expect(game.zoneOf("cleave")).toBe("trash");
  return game;
}

/** …P1 passed Focus, P2 played Rune Prison on the Sergeant, both passed priority, it resolved. */
async function prisonResolved(): Promise<Game> {
  const game = await cleaveResolved();
  await game.p1.passFocus();
  await game.p2.cast("prison", { targets: "sarge" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("prison")).toBe("trash");
  return game;
}

describe("An automatic Focus transfer (346) is not a showdown Pass (347.2)", () => {
  test("Cleave resolves: the Raider is an attacker with Assault 3 (4+3 = 7); the chain emptied from a PLAYED card → Focus passes automatically to P1 with priority, and NO pass is on record (346)", async () => {
    const game = await cleaveResolved();
    expect(game.state("raider").might).toBe(7);
    expect(game.chain()).toEqual([]);
    expectShowdownOpenWithFocus(game, P1);
    expect(showdown(game)?.passedPlayers).toEqual([]);
  });

  test("P1 then passes Focus: that is the FIRST pass in sequence ([P1]) — the showdown does NOT end; Focus returns to P2 in a Showdown OPEN state (347.2.b, not 347.2.a)", async () => {
    const game = await cleaveResolved();
    await game.p1.passFocus();
    expectShowdownOpenWithFocus(game, P2);
    expect(showdown(game)?.passedPlayers).toEqual([P1]);
    expect(game.chain()).toEqual([]);
    // combat has not happened
    expect(game.zoneOf("sarge")).toBe("battlefield-bfA");
    expect(game.state("sarge").damage).toBe(0);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, controller: P1 });
  });

  test("with Focus back, P2 may play Rune Prison as a SECOND action in the same showdown ([Action] + Focus + Open, 347.1); the Sergeant is a legal target; playing a card resets the pass sequence to [] (348)", async () => {
    const game = await cleaveResolved();
    await game.p1.passFocus();
    expect(game.p2.can("cast", "prison")).toBe(true);
    const offered = (game.p2.option("cast", "prison")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("sarge");
    await game.p2.cast("prison", { targets: "sarge" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prison", controller: P2 })]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2, passedPlayers: [] });
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 }); // (P2, P2, closed)
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.p2.passPriority();
    expect([focus(game), game.decision()?.seat]).toEqual([P2, P1]); // (P1 priority, P2 focus)
  });

  test("Rune Prison resolves: Sergeant STUNNED; chain opened by a played card → Focus auto-passes to P1 again, passedPlayers = [] (346, 347.1.b)", async () => {
    const game = await prisonResolved();
    expect(game.state("sarge").isStunned).toBe(true);
    expect(game.chain()).toEqual([]);
    expectShowdownOpenWithFocus(game, P1);
    expect(showdown(game)?.passedPlayers).toEqual([]);
  });

  test("P1 passes → Focus P2 ([P1]), still open; P2 passes → NOW all players have passed in sequence with no new chain → the showdown closes and combat proceeds (347.2.a, 348, 348.1)", async () => {
    const game = await prisonResolved();
    await game.p1.passFocus();
    expectShowdownOpenWithFocus(game, P2);
    expect(showdown(game)?.passedPlayers).toEqual([P1]);
    expect(game.zoneOf("sarge")).toBe("battlefield-bfA"); // still no combat damage
    await game.p2.passFocus();
    await game.settle();
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toEqual([]);
    expect(game.gameState.battlefields.bfA?.showdownComplete).toBe(true);
  });

  test("combat result: attacker 7 assigns lethal to the 4-Might Sergeant (dies); the stunned Sergeant deals no combat damage → the Raider survives undamaged; P2 wins and CONQUERS bfA (+1); back to P2's open main phase (465.2)", async () => {
    const game = await prisonResolved();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bfA");
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("invariant: at every step of the line the showdown's focusPlayer is P1 or P2 — never null/absent — and the turn player P2 never silently retains Focus across a played-card chain closing (313.2, 313.3, 346)", async () => {
    const game = await board().build();
    const seen: (string | null)[] = [];
    const snap = () => {
      const f = focus(game);
      expect([P1, P2]).toContain(f as string);
      seen.push(f);
    };
    await game.p2.move("raider", "bfA");
    snap(); // P2
    await game.p2.cast("cleave", { targets: "raider" });
    snap(); // P2
    await game.p2.passPriority();
    snap(); // P2 (P1 has priority, focus unchanged)
    await game.p1.passPriority(); // Cleave resolves
    snap(); // → P1 (auto)
    expect(focus(game)).toBe(P1);
    await game.p1.passFocus();
    snap(); // → P2
    await game.p2.cast("prison", { targets: "sarge" });
    snap(); // P2
    await game.p2.passPriority();
    snap(); // P2
    await game.p1.passPriority(); // Prison resolves
    snap(); // → P1 (auto)
    expect(focus(game)).toBe(P1);
    await game.p1.passFocus();
    snap(); // → P2
    expect(seen).toEqual([P2, P2, P2, P1, P2, P2, P2, P1, P2]);
    await game.p2.passFocus(); // closes
    await game.settle();
    expect(focus(game)).toBeNull(); // no showdown any more
  });

  test("contrast: an engine that (wrongly) closed the showdown on P1's first pass would have run combat with an UNSTUNNED Sergeant — here, right after that pass, nothing has fought: both units undamaged at bfA, bfA still P1's and contested, Rune Prison still in hand and castable", async () => {
    const game = await cleaveResolved();
    await game.p1.passFocus();
    expect(game.zoneOf("sarge")).toBe("battlefield-bfA");
    expect(game.zoneOf("raider")).toBe("battlefield-bfA");
    expect(game.state("sarge")).toMatchObject({ damage: 0, isStunned: false });
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, controller: P1 });
    expect(game.gameState.battlefields.bfA?.showdownComplete).not.toBe(true);
    expect(game.p2.hand()).toContain("prison");
    expect(game.p2.can("cast", "prison")).toBe(true);
    expect(game.p2.points()).toBe(0);
  });
});
