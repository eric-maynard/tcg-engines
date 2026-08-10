/**
 * Interaction: Disciple of Shen (ven-117-166) · Unit · Order · 2 · 1 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      I have [Shield 3] while I'm at a battlefield with exactly one other unit you control."
 *     — NO printed [Action] / [Reaction].
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1 + [fury] · "[Action] Deal 3 to a unit at a battlefield."
 *
 * Question: P1 controls bf1 with a lone Guard G (3). One Disciple "F" has been FACEDOWN at bf1 since a
 * previous turn; a second Disciple "H" is in P1's HAND; P1 has 2 energy. bfC is empty / uncontrolled. P2 has
 * attacker A (5), a Scout (2) and Hextech Ray. What may P1 legally do with {H, F} in each window, and what
 * does flipping F achieve?
 *   W1 P1's own main phase (Neutral Open).
 *   W2 P2's main phase, Neutral Open, empty chain.
 *   W3 P2 plays Hextech Ray on G and passes priority (Neutral Closed on P2's turn).
 *   W4 P2 Standard-Moves A into bf1 → combat showdown; P2 passes Focus to P1 (Showdown Open).
 *   W5 P2 instead moves the Scout onto empty bfC → non-combat showdown at bfC; P2 passes Focus to P1.
 *
 * Rules: 811.3 (a Hidden card may instead be played normally from hand), 811.1.b / 811.6 (from the turn after
 * it was hidden a facedown card HAS [Reaction] and is played ignoring its base cost), 811.6.a (that is not
 * announced), 811.1.c.3 (playing from facedown opens a chain), 811.1.d.1 (a hidden permanent is played TO its
 * battlefield), 813.1.b (Reaction ⊇ Action), 813.2 (Reaction is not limited to showdowns), 309.1.a / 310.1.a
 * (Closed state needs Reaction; default timing = your Neutral Open main phase), 312.1.b / 312.2 (no Priority →
 * no discretionary action), 343.1.a / 313.1.a (no card without Action/Reaction in a Showdown), 337.2 (a unit
 * resolves immediately once finalized), 340.4 (then the controller of the newest remaining item has Priority),
 * 340.2.a / 347.1.b (a played card's chain closing during a showdown passes Focus on), 323.2.a (a unit arriving
 * mid-combat gains its controller's designation at the next Cleanup), 323.6 / 323.7 (empty battlefield → control
 * lost; hidden cards at a battlefield you no longer control → owner's trash), 465.2.c.3 (lethal damage must be
 * assigned in full before moving on).
 *
 * Expected: W1 H ✔ (2 energy, base or bf1) and F ✔ (0 energy, bf1 only). W2 neither — P1 has no Priority.
 * W3 H ✘ (Closed), F ✔: the Disciple resolves at once onto bf1 (exhausted), P2 regains Priority over the Ray;
 * Ray kills G but bf1 is still occupied → P1 keeps bf1 (without the flip: bf1 lost and F trashed). W4 H ✘
 * (Showdown), F ✔: enters bf1 exhausted, becomes a Defender, Shield 3 live (G is the one other friendly unit)
 * → defends at 4; A's 5 can be lethal to only one of {G 3, Disciple 4}; 3 + 4 = 7 kills A; P1 holds bf1; Focus
 * should pass to P2 once the flip's chain closes. W5 H ✘, F ✔ but it enters bf1 (not bfC); Focus passes on.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const DISCIPLE = "ven-117-166";
const HEXTECH_RAY = "ogn-009-298";

/**
 * Turn 3 (F was hidden on an earlier turn). P1: bf1 with Guard G (3) + facedown Disciple F, Disciple H in
 * hand, exactly 2 energy. bfC uncontrolled and empty. P2: A (5) and Scout (2) in base, Hextech Ray in hand
 * with exactly 1 + [fury].
 */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Guard G" }, "guard")
    .facedown(P1, "bf1", DISCIPLE, "F")
    .hand(P1, DISCIPLE, "H")
    .unit(P2, "base", { might: 5, name: "Attacker A" }, "atk")
    .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P2, HEXTECH_RAY, "ray");
}

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

function p1Keys(game: Game): string[] {
  return game.p1.legal().map((o) => o.key);
}

/** W3: P2 casts Hextech Ray at G and passes → P1 holds Priority in a Closed state on P2's turn. */
async function w3(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.cast("ray", { targets: "guard" });
  await game.p2.passPriority();
  return game;
}

/** W4: P2 moves A into bf1 (combat showdown, P2 has Focus) and passes Focus to P1. */
async function w4(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.move("atk", "bf1");
  await game.p2.passFocus();
  return game;
}

/** W5: P2 moves the Scout onto empty bfC (non-combat showdown at bfC) and passes Focus to P1. */
async function w5(): Promise<Game> {
  const game = await board(P2).build();
  await game.p2.move("scout", "bfC");
  await game.p2.passFocus();
  return game;
}

/** Pass Focus around until the combat-damage assignment (or anything that is not a showdown action) comes up. */
async function toDamageStep(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "showdown") {
      await game.acting().passFocus();
      continue;
    }
    return d;
  }
  return game.decision();
}

describe("Disciple of Shen — hand copy H vs facedown copy F across timing windows (× Hextech Ray)", () => {
  test("setup sanity: F is facedown at bf1 from an earlier turn, H is in hand, P1 has exactly 2 energy; P2 sees only an anonymous facedown card at bf1 (811.6.a)", async () => {
    const game = await board(P1).build();
    expect(game.state("F")).toMatchObject({ isHidden: true, owner: P1, zone: "facedown-bf1" });
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
    const seen = game.view(P2);
    expect(seen.battlefields.find((b) => b.id === "bf1")?.facedownCount).toBe(1);
    const facedown = seen.zones["facedown-bf1"] ?? [];
    expect(facedown).toHaveLength(1);
    expect(facedown.every((c) => isHiddenView(c))).toBe(true); // identity (and therefore its Reaction) is not public
  });

  // ---- W1: P1's own Neutral Open main phase ------------------------------------------------------------------

  test("W1: both are on P1's menu — H as a normal play (to base OR bf1), F as a flip with no location choice (811.3, 811.1.d.1)", async () => {
    const game = await board(P1).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("play", "H")).toBe(true);
    expect(game.p1.can("reveal", "F")).toBe(true);
    const to = game.p1.option("playUnit", "H")?.fields.find((f) => f.arg === "to");
    expect([...(to?.options ?? [])].sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.p1.option("reveal", "F")?.fields ?? []).toEqual([]);
  });

  test("W1: playing H from hand costs its full 2 energy and it may enter bf1 (a battlefield P1 controls) — exhausted, F still facedown", async () => {
    const game = await board(P1).build();
    await game.p1.play("H", { to: "bf1" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("H")).toMatchObject({ isExhausted: true, isHidden: false, location: "bf1", zone: "battlefield-bf1" });
    expect(game.zoneOf("F")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("W1: flipping F costs [0] (energy stays 2) and puts the Disciple onto bf1 exhausted; the facedown slot is empty; it resolved immediately (337.2) so the chain is already closed", async () => {
    const game = await board(P1).build();
    await game.p1.reveal("F");
    expect(game.p1.energy()).toBe(2);
    expect(game.state("F")).toMatchObject({ controller: P1, isExhausted: true, isHidden: false, location: "bf1", zone: "battlefield-bf1" });
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.chain()).toEqual([]);
    // G is now the "exactly one other unit you control" there → Shield 3 is live (irrelevant outside combat, but on).
    expect(game.state("F").grantedKeywords).toEqual([{ duration: "static", keyword: "Shield", value: 3 }]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("W1 contrast: a Disciple hidden THIS turn cannot be flipped yet ('Beginning on the next turn…', 811.1.b)", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard G" }, "guard")
      .facedown(P1, "bf1", DISCIPLE, "fresh", { hiddenOnTurn: 3 })
      .build();
    expect(game.p1.can("reveal", "fresh")).toBe(false);
    expect(p1Keys(game)).not.toContain("revealHidden:fresh");
  });

  // ---- W2: P2's Neutral Open main phase, empty chain -----------------------------------------------------------

  test("W2: on P2's turn in a Neutral Open state with an empty chain P1 has no Priority at all — neither H nor F (nor anything) is offered (312.1.b, 312.2)", async () => {
    const game = await board(P2).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toBeUndefined();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("play", "H")).toBe(false);
    expect(game.p1.can("reveal", "F")).toBe(false);
    expect((await game.p1.try((p) => p.reveal("F"))).ok).toBe(false);
    expect(game.zoneOf("F")).toBe("facedown-bf1");
  });

  // ---- W3: Closed state on P2's turn (Hextech Ray on the chain, P1 holds Priority) ----------------------------------

  test("W3: with Hextech Ray (→ G) on the chain and P2 having passed, P1 holds Priority: F ✔ (facedown ⇒ Reaction, 811.6 / 813.2) but H ✘ (no Reaction in a Closed state, 309.1.a)", async () => {
    const game = await w3();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["guard"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "F")).toBe(true);
    expect(game.p1.can("play", "H")).toBe(false);
    expect(p1Keys(game).sort()).toEqual(["concede:-", "passChainPriority:-", "revealHidden:F"]);
    await expect(game.p1.play("H", { to: "bf1" })).rejects.toThrow();
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("W3: flipping F — the Disciple is finalized and resolves IMMEDIATELY onto bf1 (337.2), exhausted, for [0]; only the Ray remains on the chain and its controller P2 regains Priority (340.4)", async () => {
    const game = await w3();
    await game.p1.reveal("F");
    expect(game.state("F")).toMatchObject({ isExhausted: true, isHidden: false, location: "bf1", zone: "battlefield-bf1" });
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("guard").damage).toBe(0); // the Ray has not resolved yet
  });

  test("W3: P2 pass, P1 pass → Ray resolves: 3 to G (3) → G dies; but bf1 is still occupied by the Disciple, so P1 KEEPS bf1 (323.6) and the Disciple — now alone — has no Shield", async () => {
    const game = await w3();
    await game.p1.reveal("F");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.trash()).toEqual(["guard"]);
    expect(game.zoneOf("F")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual(["F"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("F").keywords).not.toContain("Shield"); // "exactly one OTHER unit" — there is none now
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("W3 contrast — no flip: G dies, bf1 is left empty → P1 loses control at the Cleanup (323.6) and the still-facedown F is put into P1's trash (323.7)", async () => {
    const game = await w3();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("F")).toBe("trash");
    expect(game.state("F")).toMatchObject({ isHidden: false, owner: P1, zone: "trash" });
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["F", "guard"]);
    expect(game.zoneOf("H")).toBe("hand"); // H never became playable in this window
  });

  // ---- W4: combat showdown at bf1, P1 has Focus ------------------------------------------------------------------

  test("W4: A moves into bf1 → combat showdown; after P2 passes, P1 has Focus + Priority: F ✔ (Reaction ⊇ Action, 813.1.b) but H ✘ (a unit without Action/Reaction can't be played in a Showdown, 343.1.a / 313.1.a)", async () => {
    const game = await w4();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "F")).toBe(true);
    expect(game.p1.can("play", "H")).toBe(false);
    expect(p1Keys(game).sort()).toEqual(["concede:-", "passShowdownFocus:-", "revealHidden:F"]);
    await expect(game.p1.play("H", { to: "base" })).rejects.toThrow();
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("atk").combatRole).toBe("attacker");
  });

  test("W4: before P2 passes Focus, P1 (no Focus, no Priority) cannot even flip F", async () => {
    const game = await board(P2).build();
    await game.p2.move("atk", "bf1");
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("reveal", "F")).toBe(false);
  });

  test("W4: flipping F — enters bf1 exhausted for [0], gains DEFENDER at the next Cleanup (323.2.a); G is exactly one other friendly unit there → Shield 3 live → it defends at 4; the chain is closed and the combat showdown is still open", async () => {
    const game = await w4();
    await game.p1.reveal("F");
    expect(game.p1.energy()).toBe(2);
    expect(game.state("F")).toMatchObject({ combatRole: "defender", controller: P1, isExhausted: true, isHidden: false, location: "bf1", might: 4 });
    expect(game.state("F").grantedKeywords).toEqual([{ duration: "static", keyword: "Shield", value: 3 }]);
    expect(game.state("guard")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });

  // Expected: P1 used its Focus to PLAY a card (811.1.c.3 — a play from facedown opens a chain); when that
  // chain closes Focus passes to the next player in turn order, P2, and the pass sequence starts over
  // (340.2.a / 347.1.b) — exactly as the engine already does for a Reaction unit played from hand.
  // Actual: after the flip Focus stays with P1 and P2's earlier pass is still counted (passedPlayers [P2]),
  // so a single P1 pass would end the showdown.
  test("W4 — once the flipped Disciple's chain closes, Focus should pass to P2 with a fresh pass sequence (340.2.a / 347.1.b); the engine leaves Focus on P1", async () => {
    const game = await w4();
    await game.p1.reveal("F");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(showdown(game)?.passedPlayers ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("W4 combat math: P2 must assign A's 5 among {G lethal 3, Disciple lethal 4 (1 + Shield 3)}; splitting 2/3 (lethal to neither) is illegal (465.2.c.3); 3 → G, 2 → Disciple: G dies, the Disciple survives, 3 + 4 = 7 kills A → P1 HOLDS bf1, nobody scores", async () => {
    const game = await w4();
    await game.p1.reveal("F");
    const d = await toDamageStep(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    const buckets = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(buckets).toEqual({ F: 4, guard: 3 });
    expect((await game.p2.try((p) => p.distribute({ F: 3, guard: 2 }))).ok).toBe(false);
    await game.p2.distribute({ F: 2, guard: 3 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("F")).toMatchObject({ combatRole: null, damage: 0, location: "bf1", zone: "battlefield-bf1" }); // survivor healed
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("W4 combat math (the other legal line): 4 → Disciple, 1 → G: the Disciple dies instead, G survives, A still dies to 7 — either way A's 5 kills only ONE defender and P1 keeps bf1", async () => {
    const game = await w4();
    await game.p1.reveal("F");
    const d = await toDamageStep(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    await game.p2.distribute({ F: 4, guard: 1 });
    await game.settle();
    expect(game.zoneOf("F")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("W4 contrast — no flip: A 5 vs G 3 alone → G dies, A survives; P2 conquers bf1 (+1) and the facedown F, no longer at a battlefield P1 controls, goes to P1's trash (323.7)", async () => {
    const game = await w4();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("atk")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("F")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["F", "guard"]);
    expect(game.zoneOf("H")).toBe("hand");
  });

  // ---- W5: non-combat showdown at bfC, P1 has Focus --------------------------------------------------------------

  test("W5: the Scout steps onto empty bfC → NON-combat showdown at bfC; after P2 passes, P1 has Focus: F ✔ (Reaction timing is global, not tied to the showdown's battlefield) with no location choice, H ✘ (343.1.a)", async () => {
    const game = await w5();
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "F")).toBe(true);
    expect(game.p1.option("reveal", "F")?.fields ?? []).toEqual([]);
    expect(game.p1.can("play", "H")).toBe(false);
    expect(p1Keys(game).sort()).toEqual(["concede:-", "passShowdownFocus:-", "revealHidden:F"]);
    await expect(game.p1.play("H", { to: "bf1" })).rejects.toThrow();
  });

  test("W5: flipping F during the bfC showdown still plays the Disciple TO bf1 — where it was hidden (811.1.d.1) — never to bfC; exhausted, [0]; the bfC showdown is still open and bfC still has no units of P1's", async () => {
    const game = await w5();
    await game.p1.reveal("F");
    expect(game.state("F")).toMatchObject({ isExhausted: true, isHidden: false, location: "bf1", zone: "battlefield-bf1" });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.units("bfC")).toEqual([]);
    expect(game.cardsAt("bfC")).toEqual(["scout"]);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", isCombatShowdown: false });
    expect(game.state("F").combatRole).toBeNull(); // no combat anywhere
    expect(game.state("F").grantedKeywords).toEqual([{ duration: "static", keyword: "Shield", value: 3 }]); // G is the one other unit at bf1
  });

  // Expected: the flip opened (and closed) a chain from a PLAYED card, so Focus passes to P2 and the pass
  // sequence restarts (340.2.a / 347.1.b): P2 must pass again, then P1, before the showdown ends.
  // Actual: Focus stays with P1 and P2's earlier pass still counts.
  test("W5 — after the flipped Disciple's (trivial) chain closes, Focus should pass on to P2 (347.1.b); the engine keeps it on P1", async () => {
    const game = await w5();
    await game.p1.reveal("F");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(showdown(game)?.passedPlayers ?? []).toEqual([]);
    expect(game.actingSeat()).toBe(P2);
  });

  test("W5: once everybody has passed, the bfC showdown ends with P2 conquering bfC (+1); bf1 is untouched — P1 keeps it with G + the revealed Disciple", async () => {
    const game = await w5();
    await game.p1.reveal("F");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.units("bf1").sort()).toEqual(["F", "guard"]);
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
