/**
 * Interaction: Vayne, Hunter (ogn-035-298) · Champion Unit · Fury · 4 + [fury] · 2 Might
 *     "[Assault 3] (+3 [Might] while I'm an attacker.) If an opponent controls a battlefield, I enter
 *      ready. When I conquer, you may pay [1] to return me to my owner's hand."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos] · "[Action] Move a friendly unit and
 *     ready it."
 *   × Laurent Bladekeeper (sfd-096-221) · Unit · Body · 3 · 3 Might · "Ganking"
 *
 * Rules: 450 / 190.3.a.1 (the first arrival applies Contested; a later arrival at an already
 * Contested battlefield applies nothing), 323.8 / 323.12 / 344.2 / 345 (lone arrival → Non-Combat
 * Showdown, contesting player has Focus), 807 (Assault only while an attacker), 348.1 / 348.2.a /
 * 469.1 (showdown closes: sole remaining player establishes control = Conquer), 316.8.b.1.a / 323.9 /
 * 323.14 / 460.1 / 464.1–464.2 (an opposing unit arriving DURING the Non-Combat Showdown stages a
 * Combat at the next Cleanup and the SAME showdown becomes a Combat Showdown), 464.2.c.1 (Attacker =
 * whoever applied Contested), 464.2.c.1.b (Focus holder keeps Focus on conversion), 347.1.b (a
 * Focus action's chain closing passes Focus), 464.2.c.3 (designations), 466.3.a / 466.5.d / 466.5.e.
 *
 * Question: P1's turn. Vayne Standard-Moves base → empty, uncontrolled bfC.
 *   (a) No opposing unit → no Attacker → Assault dormant: Vayne is 2 Might; both pass → P1 conquers
 *       (+1) and may pay [1] to bounce Vayne (bfC then lapses to uncontrolled, the point stays).
 *   (c') P1 passes; P2 (Focus) Rides the Wind moving Bladekeeper (3) into bfC: contestedBy stays P1;
 *       nothing converts mid-chain; at the Cleanup after the move the showdown becomes a COMBAT
 *       showdown — Attacker P1 / Defender P2 (Vayne attacker 5 Might, Bladekeeper defender), Focus
 *       P1; both pass → Vayne 5 kills Bladekeeper 3, survives the 3, P1 conquers bfC (+1) and gets
 *       the pay-[1] bounce offer.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VAYNE = "ogn-035-298";
const RIDE_THE_WIND = "ogn-173-298";
const BLADEKEEPER = "sfd-096-221";

function board() {
  return scenario()
    .resources(P1, { energy: 1 }) // for Vayne's "pay [1]" bounce
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfC", { controller: null })
    .unit(P1, "base", VAYNE, "vayne")
    .unit(P2, "base", BLADEKEEPER, "blade")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

const bfC = (game: Game) => game.gameState.battlefields.bfC;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Vayne walks onto empty bfC → Non-Combat Showdown with P1 holding Focus. */
async function vayneAlone(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vayne", "bfC");
  return game;
}

/** … P1 passes Focus; P2 Rides the Wind: Bladekeeper → bfC; both pass Priority → it resolves. */
async function bladekeeperRidesIn(): Promise<Game> {
  const game = await vayneAlone();
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("rtw", { targets: "blade" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfC"); // destination, if asked at play time
  }
  await game.p2.passPriority();
  await game.p1.passPriority();
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bfC"); // destination, if asked on resolution
  }
  return game;
}

describe("Vayne alone on an empty battlefield × Ride the Wind bringing a surprise defender", () => {
  // ── (a) stand-alone Non-Combat Showdown ─────────────────────────────────────────────────────

  test("(a) Vayne's arrival: bfC Contested BY P1, a NON-combat showdown opens with P1 holding Focus; no designation → Assault dormant → Vayne is 2 Might (450, 344.2, 345, 807)", async () => {
    const game = await vayneAlone();
    expect(bfC(game)).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.chain()).toEqual([]);
    expect(game.state("vayne")).toMatchObject({ combatRole: null, isExhausted: true, might: 2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(a) P1 pass, P2 pass → showdown closes: P1 establishes control of bfC = Conquer, +1 point, still at 2 Might; her 'When I conquer, you may pay [1]' is offered (348.2.a, 469.1)", async () => {
    const game = await vayneAlone();
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdown(game)).toBeUndefined();
    expect(bfC(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("vayne").might).toBe(2);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "vayne" } });
  });

  test("(a) declining the bounce: Vayne stays, bfC remains P1's, P1 keeps the point", async () => {
    const game = await vayneAlone();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("battlefield-bfC");
    expect(bfC(game)?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) paying [1]: Vayne returns to hand, bfC lapses to uncontrolled at the next Cleanup (323.6) but the conquer point stays", async () => {
    const game = await vayneAlone();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p1.energy()).toBe(0);
    expect(bfC(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ── (c') Ride the Wind brings Bladekeeper in during the showdown ───────────────────────────

  test("(c') after P1 passes Focus, P2 may Ride the Wind (Action, showdown-legal) on Bladekeeper; while it is on the chain nothing converts — still a non-combat showdown, Bladekeeper still in base", async () => {
    const game = await vayneAlone();
    await game.p1.passFocus();
    expect(game.p2.can("cast", "rtw")).toBe(true);
    await game.p2.cast("rtw", { targets: "blade" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bfC");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2 })]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.locationOf("blade")).toBe("base");
    expect(showdown(game)).toMatchObject({ focusPlayer: P2, isCombatShowdown: false });
    expect(game.state("vayne")).toMatchObject({ combatRole: null, might: 2 });
  });

  test("(c') Ride the Wind resolves: Bladekeeper arrives at bfC READY; bfC was already Contested so contestedBy stays P1 — Bladekeeper applies nothing (190.3.a.1)", async () => {
    const game = await bladekeeperRidesIn();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("blade")).toBe("bfC");
    expect(game.state("blade").isExhausted).toBe(false);
    expect(bfC(game)).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("(c') at the Cleanup after the move the SAME showdown becomes a Combat Showdown: Attacker P1 (applied Contested) even though P2 moved in, Defender P2; Vayne attacker, Bladekeeper defender (316.8.b.1.a, 323.14, 464.2.c.1, 464.2.c.3)", async () => {
    const game = await bladekeeperRidesIn();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.showdownStack).toHaveLength(1); // converted, not a new one
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfC", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("vayne").combatRole).toBe("attacker");
    expect(game.state("blade").combatRole).toBe("defender");
  });

  test("(c') Focus: the Ride the Wind chain closing passed Focus P2 → P1, and the conversion keeps it there — P1 acts first, on P1's turn (347.1.b / 340.2.a, 464.2.c.1.b)", async () => {
    const game = await bladekeeperRidesIn();
    expect(showdown(game)).toMatchObject({ focusPlayer: P1, passedPlayers: [] });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(c') Vayne is now an attacker → Assault 3 live → 5 Might; Bladekeeper 3", async () => {
    const game = await bladekeeperRidesIn();
    expect(game.state("vayne").might).toBe(5);
    expect(game.state("blade").might).toBe(3);
  });

  test("(c') P1 pass, P2 pass → combat: Vayne 5 kills Bladekeeper 3; Vayne takes 3 < 5, survives and is healed; P1 wins, establishes control of bfC = Conquer +1; the pay-[1] bounce is offered (348.1, 466.3.a, 466.5.d)", async () => {
    const game = await bladekeeperRidesIn();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle(); // combat auto-resolves; stops at Vayne's opt-in
    expect(game.zoneOf("blade")).toBe("trash");
    // rule 466.7 / 807.1.d.1 (ruling 211635a4cca0ac5a) — Combat Cleanup is the LAST thing the combat
    // does, so while the conquer trigger is still on the chain Vayne keeps the Attacker designation
    // and [Assault 3] is still real Might (5).
    expect(game.state("vayne")).toMatchObject({ combatRole: "attacker", damage: 0, might: 5, zone: "battlefield-bfC" });
    expect(bfC(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "vayne" } });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("battlefield-bfC");
    // chain drained → the parked Combat Cleanup runs: designation gone, Assault dormant again (466.7.a)
    expect(game.state("vayne")).toMatchObject({ combatRole: null, damage: 0, might: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c') contrast (466.5.e): had the DEFENDER's unit survived alone instead — a 6-Might Bladekeeper stand-in — P2 would establish control and Conquer bfC on P1's turn", async () => {
    const game = await scenario()
      .resources(P2, { energy: 2, power: { chaos: 1 } })
      .battlefield("bfC", { controller: null })
      .unit(P1, "base", VAYNE, "vayne")
      .unit(P2, "base", { might: 6, name: "Big Blade" }, "bigBlade")
      .hand(P2, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.move("vayne", "bfC");
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "bigBlade" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bfC");
    }
    await game.p2.passPriority();
    await game.p1.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bfC");
    }
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("vayne").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("vayne")).toBe("trash"); // 6 ≥ 5
    expect(game.state("bigBlade")).toMatchObject({ damage: 0, zone: "battlefield-bfC" }); // 5 < 6, healed
    expect(bfC(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
