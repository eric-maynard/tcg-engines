/**
 * Interaction: Cleave (ogn-004-298) · Spell · Fury · 1 · "[Action] Give a unit [Assault 3] this turn."
 *   × Defy (ogn-045-298) · Spell · Calm · 1 + [calm] · "[Reaction] Counter a spell that costs no more
 *     than [4] and no more than [rainbow]."
 *   × Shipyard Skulker (ogn-175-298) · Unit · 3 Might (vanilla) attacking a vanilla 4-Might defender.
 *
 * Rules: 337.4 (the newest item's controller gains Priority), 338.1.a.5, 338.1.b.1 / 313.3 (passing
 * Priority keeps Focus where it is), 339.1 / 340.1 (all-pass in sequence → newest item resolves),
 * 340.2.a / 346 (when a chain OPENED BY PLAYING A CARD empties during a Showdown, Focus passes to the
 * next player — regardless of whether the opener resolved or was countered), 313.2 (gaining Focus
 * gains Priority), 347 (only the Focus holder acts), 345, 466.1 / 466.5 (combat outcome).
 *
 * Question: P2's turn. Skulker (3) Standard-Moves into P1's bfA held by a vanilla 4; P2 (attacker)
 * opens with Focus and Cleaves Skulker; P1 answers with Defy.
 *   (a) trace (priority, focus): Cleave → (P2,P2); P2 pass → (P1,P2); Defy → (P1,P2); P1 pass →
 *       (P2,P2); P2 pass → Defy resolves countering Cleave; chain empty.
 *   (b) Focus does NOT stay with P2 to "try again": it passes to P1, who also gains Priority.
 *   (c) No Defy: Cleave resolves and Focus passes to P1 all the same. Then combat: countered → 3 vs
 *       4, Skulker dies, P1 holds; resolved → Skulker 6 (Assault 3 as attacker) kills the 4 and, still
 *       an attacker with 6 Might through the Combat Cleanup, survives the 4 damage → P2 conquers bfA.
 *       (The pairing brief expected Skulker to die to the 4 return damage; by 465.2 / 466.1 / 466.7.a
 *       the Assault bonus still applies when lethal damage is checked, so it survives.)
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const DEFY = "ogn-045-298";
const SKULKER = "ogn-175-298";

function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", { might: 4, name: "Vanilla Wall" }, "wall")
    .unit(P2, "base", SKULKER, "skulker")
    .hand(P2, CLEAVE, "cleave")
    .hand(P1, DEFY, "defy");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
/** [priority holder (chain) — or the showdown actor when no chain —, focus holder] */
const pf = (game: Game): [string | undefined, string | undefined] => [
  game.gameState.interaction?.chain?.activePlayer ?? game.actingSeat(),
  showdown(game)?.focusPlayer,
];

/** Skulker attacks bfA (no triggers → P2 has Focus) and P2 Cleaves it. */
async function cleaveOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("skulker", "bfA");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
  expect(game.chain()).toEqual([]);
  await game.p2.cast("cleave", { targets: "skulker" });
  return game;
}

describe("Defy counters Cleave in a combat showdown — Focus still passes (340.2.a / 346)", () => {
  // ── (a) the (priority, focus) trace ────────────────────────────────────────────────────────

  test("(a) Cleave played: (prio P2, focus P2); P2 passes: (P1, P2) — passing Priority does not move Focus (337.4, 313.3)", async () => {
    const game = await cleaveOnChain();
    expect(pf(game)).toEqual([P2, P2]);
    await game.p2.passPriority();
    expect(pf(game)).toEqual([P1, P2]);
    expect(game.p1.can("cast", "defy")).toBe(true);
  });

  test("(a) Defy may target Cleave (1 energy, 0 power — within its limits); once played Defy is newest and P1 holds Priority while Focus is STILL P2: (P1, P2) (337.4, 338.1.a.5)", async () => {
    const game = await cleaveOnChain();
    await game.p2.passPriority();
    expect(game.p1.option("cast", "defy")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["cleave"]]);
    await game.p1.cast("defy", { targets: "cleave" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "cleave", controller: P2 }),
      expect.objectContaining({ cardId: "defy", controller: P1, targets: ["cleave"] }),
    ]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(pf(game)).toEqual([P1, P2]);
  });

  test("(a) P1 passes: (P2, P2); P2 passes → all passed in sequence → Defy resolves and counters Cleave: both spells in trash, Skulker has no Assault, chain empty; Focus was P2 at every Closed-State window (339.1, 340.1, 425.1.a)", async () => {
    const game = await cleaveOnChain();
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "cleave" });
    await game.p1.passPriority();
    expect(pf(game)).toEqual([P2, P2]);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("skulker").grantedKeywords).toEqual([]);
    expect(game.state("skulker")).toMatchObject({ combatRole: "attacker", might: 3 });
  });

  // ── (b) Focus after the counter ────────────────────────────────────────────────────────────

  test("(b) after Defy empties the chain P2 does NOT keep Focus to try again — the chain was opened by P2 PLAYING A CARD, so Focus passes to P1, who also gains Priority, on P2's turn (340.2.a, 346, 313.2, 347)", async () => {
    const game = await cleaveOnChain();
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "cleave" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.turnPlayer()).toBe(P2);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: true, passedPlayers: [] });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]); // P2 must wait for P1 to act or pass
  });

  test("(b) then P1 passes Focus, P2 passes Focus → showdown closes → combat with Cleave countered: Skulker 3 into the 4 — Skulker dies, P1 holds bfA, nobody scores", async () => {
    const game = await cleaveOnChain();
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "cleave" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passFocus();
    expect(showdown(game)?.focusPlayer).toBe(P2);
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) contrast: no Defy ──────────────────────────────────────────────────────────────────

  test("(c) no Defy: P2 pass, P1 pass → Cleave resolves (Skulker Assault 3 → 6 Might as attacker) and Focus passes to P1 exactly the same way (340.2.a)", async () => {
    const game = await cleaveOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("skulker").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("skulker")).toMatchObject({ combatRole: "attacker", might: 6 });
    expect(showdown(game)).toMatchObject({ focusPlayer: P1, passedPlayers: [] });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(c) no Defy, both pass Focus → combat: Skulker 6 kills the 4-Might defender; Skulker takes 4 < 6 (still an attacker through the Combat Cleanup), survives healed → P2 conquers bfA and scores 1 (465.2, 466.1, 466.5)", async () => {
    const game = await cleaveOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, might: 3, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
