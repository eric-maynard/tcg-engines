/**
 * Interaction: Diana, Lunari (unl-079-219) · Champion Unit · Mind · 3 · 3 Might
 *     "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your
 *      Main Deck. If it's a spell, draw it."
 *   × Sumpworks Map (unl-085-219) · Gear · Mind · 2 · [Reaction] [Temporary] — "When an opponent scores, draw 1."  (P2's)
 *   × Plundering Poro (sfd-069-221) · Unit · Mind · 2 · 2 Might — "When I conquer, play a Gold gear token exhausted." (P2's defender)
 *
 * Rules: 450 / 190.3.a.1 (the mover applies Contested), 323.8 / 323.9 / 323.12 / 323.13 (Cleanup stages a
 * Showdown — and a Combat only where opposing units are present — and in a Neutral Open state begins it),
 * 316.8.b.1 / 316.8.b.1.a / 344.2 (a unit arriving at an EMPTY non-friendly battlefield opens a stand-alone
 * Non-Combat Showdown), 316.8.a.1 / 464.1 / 464.2 (arriving where enemy units are opens COMBAT, whose first
 * step is a Combat Showdown), 345 / 464.2.d (whoever applied Contested / the Attacker gains Focus),
 * 464.2.c.1 (Attacker = the contester), 346.1 (Focus does not pass when a chain opened by a TRIGGERED ability
 * empties), 347.2.a / 347.2.b / 348 (pass → Focus to next player; all passed → showdown closes),
 * 348.2.a / 348.2.a.1 / 469.1 (non-combat close: the lone remaining side establishes control → Conquer),
 * 348.1 / 466.5.d (combat close: damage, then the survivor establishes control → Conquer).
 *
 * Question: P1's turn, Neutral Open; P2 has Sumpworks Map in base.
 *   (a) Diana Standard-Moves base → bfC (EMPTY, UNCONTROLLED). Does "when a showdown begins here" fire for a
 *       stand-alone Non-Combat Showdown? Who holds Focus while/after the trigger resolves? When both pass do
 *       the 348.2 closing steps run (control → Conquer point → Map draw)? Is Diana ever an attacker?
 *   (c) Contrast: Diana moves into bfB, held by P2 with a lone Plundering Poro (2): Combat Showdown, trigger
 *       still fires, Focus stays with Attacker P1, both pass → Diana 3 kills Poro 2, survives, conquers bfB.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIANA = "unl-079-219";
const SUMPWORKS_MAP = "unl-085-219";
const PLUNDERING_PORO = "sfd-069-221";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla unit for the deck
const MOONBOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Moonbolt",
  rulesText: "[Action]\nDeal 1 to a unit.",
  timing: "action",
} as const;

function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .points(P1, 0)
    .points(P2, 0)
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P2, "bfB", PLUNDERING_PORO, "poro")
    .unit(P1, "base", DIANA, "diana")
    .gear(P2, SUMPWORKS_MAP, "map")
    .deck(P1, [MOONBOLT, FILLER, FILLER], ["bolt", "u2", "u3"]);
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

/**
 * Diana's trigger is on the chain: opt in (383.3.a — free, at finalization), let both pass so it resolves, pay
 * the [1] when asked (205 / 444.2 — on resolution), keep the top card in the Predict, and let the reveal draw
 * the spell. Leaves the game at the first Open showdown window.
 */
async function resolveDianaTrigger(game: Game): Promise<void> {
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
  for (let i = 0; i < 2; i++) {
    if (game.decision()?.kind !== "yes-no") {
      const r = await game.settle();
      expect(r.reason).toBe("unanswered");
    }
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(d?.timing === "FIN" ? 1 : 0); // nothing is paid to finalize; the [1] goes on resolution
    if (d?.timing !== "FIN") {
      break;
    }
  }
  expect(game.p1.energy()).toBe(0);
  // Both pass on the finalized trigger → it resolves → Predict look (may recycle) is asked.
  if (game.decision()?.kind !== "pick") {
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
  }
  const d = game.decision();
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["bolt"]);
  await game.p1.decline(); // keep it on top → the reveal shows the spell → drawn
  for (let i = 0; i < 4 && game.decision()?.kind !== "action"; i++) {
    await game.settle({ maxSteps: 1 });
  }
  expect(game.p1.hand()).toEqual(["bolt"]);
  expect(game.chain()).toEqual([]);
}

describe("Diana, Lunari — 'when a showdown begins here': empty battlefield (Non-Combat Showdown) vs defended battlefield (Combat Showdown)", () => {
  // ── (a) bfC: empty & uncontrolled ─────────────────────────────────────────────────────────

  test("(a) the move exhausts Diana and P1 applies Contested to bfC (450); the Cleanup begins a stand-alone NON-combat Showdown there (323.8/323.12, 316.8.b.1) with P1 holding Focus (345) — no combat staged, no Attacker/Defender", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfC");
    expect(game.state("diana")).toMatchObject({ isExhausted: true, zone: "battlefield-bfC" });
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    // No combat: no unit at bfC carries an Attacker/Defender designation (464.2.c is a COMBAT step).
    expect(game.state("diana").combatRole).toBeNull();
    expect(game.chain().every((i) => i.cardId === "diana")).toBe(true); // only Diana's own trigger, no attack/defend triggers
  });

  test("(a) 'a showdown begins here' IS satisfied by a Non-Combat Showdown: Diana's trigger goes on the chain as the showdown opens and P1 is asked whether to use it (383.3.a opt-in, timing FIN)", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfC");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
    const r = game.decision()?.kind === "yes-no" ? { reason: "unanswered" } : await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.source?.cardId).toBe("diana");
    // Nothing has been scored yet — the showdown is still open behind the chain.
    expect(game.p1.points()).toBe(0);
    expect(bf(game, "bfC")?.controller).toBeNull();
  });

  test("(a) paying [1] → Predict (keep) → reveal the top card, a spell → drawn; when that trigger chain empties Focus does NOT pass (346.1): P1 still holds Focus and acts first in the open showdown", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfC");
    await resolveDianaTrigger(game);
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: ["bolt"], playerId: P1 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p1.points()).toBe(0); // still nothing scored while the showdown is open
  });

  test("(a) P1 passes → Focus to P2 (347.2.b); P2 passes → all passed → the showdown CLOSES and 348.2.a runs: only P1's unit remains at uncontrolled bfC → P1 establishes control = Conquer (+1, 469.1); Sumpworks Map triggers and P2 draws 1", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfC");
    await resolveDianaTrigger(game);
    const p2Hand = game.p2.hand().length;
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.settle(); // Map's draw trigger (if chained) resolves
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toContain("bfC");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // "When an opponent scores, draw 1."
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) no combat ever occurred at bfC: Diana never carried the Attacker designation, took no damage, and stays exhausted at bfC (no combat heal/recall step ran)", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfC");
    expect(game.state("diana").combatRole).toBeNull();
    await resolveDianaTrigger(game);
    expect(game.state("diana").combatRole).toBeNull();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.state("diana")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, might: 3, zone: "battlefield-bfC" });
    expect(game.zoneOf("poro")).toBe("battlefield-bfB"); // untouched
  });

  test("(a) declining (the opt-in at finalization — 383.3.a.2: no chain item) changes nothing about the showdown: Focus P1, both pass → P1 still conquers bfC and P2 still draws off the Map", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfC");
    if (game.decision()?.kind !== "yes-no") {
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.no();
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: false });
    const p2Hand = game.p2.hand().length;
    await game.settle(); // handed back once (344.2) …
    await game.settle(); // … then both pass
    expect(bf(game, "bfC")?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("bolt");
  });

  // ── (c) bfB: held by P2 with a lone Plundering Poro ───────────────────────────────────────

  test("(c) into defended bfB the Cleanup stages Showdown AND Combat (323.8/323.9) → COMBAT begins with a Combat Showdown (464.1/464.2), not a stand-alone one: Attacker P1 (464.2.c.1), Defender P2, designations on Diana/Poro, Focus with the Attacker (464.2.d)", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfB");
    expect(bf(game, "bfB")).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P1,
      battlefieldId: "bfB",
      defendingPlayer: P2,
      focusPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.state("diana").combatRole).toBe("attacker");
    expect(game.state("poro").combatRole).toBe("defender");
  });

  test("(c) Diana's 'showdown begins here' fires for the Combat Showdown too and sits on the initial Combat Chain; after pay → predict → reveal/draw, Focus is STILL P1's (346.1) and the Poro is untouched so far", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfB");
    await resolveDianaTrigger(game);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
    expect(game.p1.points()).toBe(0);
  });

  test("(c) both pass → 348.1 proceed with combat: Diana 3 kills Poro 2, takes 2 < 3 and survives (healed in the Combat Cleanup); P1 establishes control of bfB = Conquer +1 (466.5.d); Map draws 1 for P2; Poro's own 'When I conquer' never fires", async () => {
    const game = await board().build();
    await game.p1.move("diana", "bfB");
    await resolveDianaTrigger(game);
    const p2Hand = game.p2.hand().length;
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2, isCombatShowdown: true });
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("diana")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bfB" });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toContain("bfB");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.gear()).toEqual(["map"]); // no Gold token: the Poro did not conquer, it died
    expect(game.p1.hand()).toEqual(["bolt"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
