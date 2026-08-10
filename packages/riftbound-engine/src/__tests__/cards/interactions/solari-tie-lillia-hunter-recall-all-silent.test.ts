/**
 * Interaction: Symbol of the Solari (ogn-227-298) · Gear · Order · 1
 *     "If a combat where you are the attacker ends in a tie, recall ALL units instead. (Send them to
 *      base. This isn't a move. Ties are calculated after combat damage is dealt.)"
 *   × Lillia, Fae Fawn (unl-082-219) · Champion Unit · Mind · 3 · 3 Might
 *     "[Accelerate] … When I move from a location, play a 3 [Might] Sprite unit token with [Temporary] there."
 *   × Treasure Hunter (sfd-130-221) · Unit · Chaos · 2 · 1 Might — "When I move, play a Gold gear token exhausted."
 *   (+ Rune Prison ogn-050-298 · Spell · Calm · 2+[calm] · Action — "Stun a unit.")
 *
 * Rules: 144.2 (the Standard Move exhausts and IS a Move), 323.13 (Combat begins only in a Neutral Open
 * state — after the mover's own trigger has resolved), 423.1.b (a stunned unit deals no combat damage),
 * 423.1.a.2 (stun lasts until the end of the turn), 466.1.a.2 (cleanup 3d: recall attackers if defenders
 * remain), 466.3.d (No Result), 466.5.b (no units of any player left → UNCONTROLLED), 370.1.b ("instead"
 * = replacement), 455 (a recall goes to the permanent's controller's base), 456 / 456.1 (Recalls are NOT
 * Moves — move triggers stay silent), 458.1 (a recall leaves ready/exhausted/stunned/damage state alone),
 * 816.1.b (Temporary).
 *
 * Question: P1 (Solari in base, ready Treasure Hunter in base, Rune Prison in hand) vs P2's bf1 held by a
 * READY Lillia. P1 Standard-Moves TH base → bf1, stuns Lillia with Rune Prison in the showdown, all pass.
 *   (a) How many Gold tokens, and when did the first appear relative to combat?
 *   (b) 1 onto Lillia, 0 back — both remain: a Solari tie? What is recalled, to whose base?
 *   (c) Does Lillia's "When I move from a location" make a Sprite at bf1? A second Gold for TH? Who
 *       controls bf1? Ready/stun state of both units on arrival?
 *   (d) Contrast without Solari.  (e) Contrast: P2's next turn, Lillia Standard-Moves base → bf1.
 *
 * Expected: (a) exactly one Gold, played exhausted to P1's base when TH's move trigger resolved — BEFORE
 * the combat showdown began. (b) tie (both remain after damage) → Solari replaces 3d: TH → P1's base,
 * Lillia → P2's base. (c) recalls are not moves: NO Sprite anywhere, still ONE Gold, chain empty; bf1
 * UNCONTROLLED, nobody scores; TH exhausted (from its move) 0 dmg, Lillia READY + still stunned, 0 dmg.
 * (d) only TH recalled, Lillia stays, P2 keeps bf1, still one Gold. (e) her Standard Move IS a move:
 * a 3-Might Temporary Sprite is played to P2's BASE ("there" = where she left), she conquers empty bf1 → +1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SOLARI = "ogn-227-298";
const LILLIA = "unl-082-219";
const TREASURE_HUNTER = "sfd-130-221";
const RUNE_PRISON = "ogn-050-298";

/** P1's turn. P2's READY Lillia alone at P2's bf1; P1: ready Treasure Hunter in base, Rune Prison in hand (exact cost), Solari in base unless `solari:false`. */
function board(opts: { solari?: boolean } = {}) {
  let b = scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } }) // exactly Rune Prison
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", TREASURE_HUNTER, "th")
    .unit(P2, "bf1", LILLIA, "lillia")
    .hand(P1, RUNE_PRISON, "prison");
  if (opts.solari !== false) {
    b = b.gear(P1, SOLARI, "sol");
  }
  return b;
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
const golds = (game: Game) => game.findAll({ name: "Gold" }).filter((id) => game.has(id) && game.state(id).zone !== "gone");
const sprites = (game: Game) => game.findAll({ name: "Sprite" }).filter((id) => game.has(id) && game.state(id).zone !== "gone");

/** TH base → bf1; its move trigger resolves (pass, pass); the combat showdown begins with P1's Focus. */
async function attackWithHunter(game: Game): Promise<void> {
  await game.p1.move("th", "bf1");
  await game.p1.passPriority();
  await game.p2.passPriority(); // "When I move" resolves → Gold #1
}

/** …then P1 stuns Lillia with Rune Prison in the showdown and everybody passes through combat. */
async function fullCombat(opts: { solari?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await attackWithHunter(game);
  await game.p1.cast("prison", { targets: "lillia" });
  const r = await game.settle(); // prison resolves; both pass focus; combat damage; resolution
  expect(r.reason).toBe("open");
  return game;
}

describe("Solari tie with Lillia defending Treasure Hunter — recall ALL is silent for both move triggers", () => {
  // ── (a) the Standard Move and Gold #1 ───────────────────────────────────────────────────────

  test("(a) the Standard Move exhausts TH and IS a move: 'When I move' pends as a P1 chain item and the combat is only STAGED — no showdown yet (144.2, 323.13)", async () => {
    const game = await board().build();
    await game.p1.move("th", "bf1");
    expect(game.state("th")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "th", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(showdown(game)).toBeUndefined();
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(golds(game)).toEqual([]);
  });

  test("(a) the trigger resolves BEFORE combat begins: exactly one Gold gear token, exhausted, in P1's base — and only then does the combat showdown open with P1 (attacker) holding Focus", async () => {
    const game = await board().build();
    await attackWithHunter(game);
    const g = golds(game);
    expect(g).toHaveLength(1);
    expect(game.state(g[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, location: "base", name: "Gold" });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("th").combatRole).toBe("attacker");
    expect(game.state("lillia").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(a) with Focus P1 may cast Rune Prison (Action) on Lillia; it resolves → Lillia is Stunned, still at bf1", async () => {
    const game = await board().build();
    await attackWithHunter(game);
    expect(game.p1.can("cast", "prison")).toBe(true);
    await game.p1.cast("prison", { targets: "lillia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("prison")).toBe("trash");
    expect(game.state("lillia")).toMatchObject({ isStunned: true, zone: "battlefield-bf1" });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true }); // still in the showdown
  });

  // ── (b) tie → Solari recalls ALL ────────────────────────────────────────────────────────────

  test("(b) damage: TH's 1 does not kill Lillia (3); stunned Lillia deals 0 (423.1.b) — both remain = a tie → Solari recalls ALL: TH → P1's base, Lillia → P2's base (466.1.a.2, 370.1.b, 455)", async () => {
    const game = await fullCombat();
    expect(game.zoneOf("th")).toBe("base");
    expect(game.zoneOf("lillia")).toBe("base");
    expect(game.p1.base()).toEqual(expect.arrayContaining(["th", "sol"]));
    expect(game.p2.base()).toEqual(["lillia"]);
    expect(game.p1.base()).not.toContain("lillia");
    expect(game.p1.trash()).toEqual(["prison"]);
    expect(game.p2.trash()).toEqual([]);
  });

  // ── (c) recalls are not moves ───────────────────────────────────────────────────────────────

  test("(c) Lillia's 'When I move from a location' does NOT trigger off the recall: no Sprite token exists anywhere — in particular none at bf1 (456.1)", async () => {
    const game = await fullCombat();
    expect(sprites(game)).toEqual([]);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p2.units()).toEqual(["lillia"]);
  });

  test("(c) Treasure Hunter's 'When I move' does NOT trigger off the recall either: still exactly ONE Gold token; chain empty, no trigger pending (456.1)", async () => {
    const game = await fullCombat();
    expect(golds(game)).toHaveLength(1);
    expect(game.p1.gear()).toHaveLength(2); // Solari + Gold #1
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.unitsMovedThisTurn).toEqual({ [P1]: 1, [P2]: 0 }); // only TH's real Standard Move
  });

  test("(c) No Result and nobody left at bf1 → bf1 becomes UNCONTROLLED: P2 lost it, P1 did not conquer, nobody scored, no showdown re-staged (466.3.d, 466.5.b)", async () => {
    const game = await fullCombat();
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("(c) arrival states (458.1): TH EXHAUSTED (it paid the move) with 0 damage; Lillia READY (never exhausted), still STUNNED, 0 damage (healed in cleanup)", async () => {
    const game = await fullCombat();
    expect(game.state("th")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("lillia")).toMatchObject({ combatRole: null, damage: 0, isExhausted: false, isReady: true, isStunned: true, zone: "base" });
  });

  test("(c) Lillia's stun wears off at the end of P1's turn (423.1.a.2); bf1 is still uncontrolled at the start of P2's turn (no hold point)", async () => {
    const game = await fullCombat();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("lillia")).toMatchObject({ isReady: true, isStunned: false, zone: "base" });
    expect(bf1(game)?.controller).toBeNull();
    expect(game.p2.points()).toBe(0);
  });

  // ── (d) contrast: no Solari ─────────────────────────────────────────────────────────────────

  test("(d) WITHOUT Solari the same tie recalls only the attacker: TH → P1's base (still a recall — no Gold #2), stunned Lillia stays, P2 keeps bf1, no points", async () => {
    const game = await fullCombat({ solari: false });
    expect(game.state("th")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.state("lillia")).toMatchObject({ damage: 0, isReady: true, isStunned: true, zone: "battlefield-bf1" });
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(golds(game)).toHaveLength(1);
    expect(sprites(game)).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (e) contrast: a real move by Lillia ─────────────────────────────────────────────────────

  test("(e) on P2's next turn Lillia Standard-Moves base → empty bf1: that IS a move — her trigger pends as a P2 item, and a 3-Might [Temporary] Sprite token is played to P2's BASE ('there' = the location she left), not to bf1", async () => {
    const game = await fullCombat();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("lillia", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", controller: P2, triggered: true })]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // trigger resolves
    const s = sprites(game);
    expect(s).toHaveLength(1);
    expect(game.state(s[0] as string)).toMatchObject({ controller: P2, isToken: true, location: "base", might: 3, name: "Sprite" });
    expect(game.state(s[0] as string).keywords).toContain("Temporary");
    expect(game.p2.units("bf1")).toEqual(["lillia"]);
  });

  test("(e) …she arrives alone at uncontrolled bf1 → non-combat showdown → P2 conquers bf1 and scores 1", async () => {
    const game = await fullCombat();
    await game.advanceTurn();
    await game.p2.move("lillia", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.state("lillia")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});
