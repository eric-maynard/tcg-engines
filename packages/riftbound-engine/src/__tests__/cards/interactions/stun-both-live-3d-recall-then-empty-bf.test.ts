/**
 * Interaction: Rune Prison (ogn-050-298) · Spell · Calm · 2 + [calm] · [Action]
 *     "Stun a unit. (It doesn't deal combat damage this turn.)"
 *   × Stalwart Poro (ogn-052-298) · Unit · Calm · 2 · 2 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · [Reaction] · "Move up to 2 friendly units to base."
 *   (with Watchful Sentry ogn-096-298 — 1 Might, "[Deathknell] — Draw 1" — and Shipyard Skulker
 *    ogn-175-298, a vanilla 3-Might attacker)
 *
 * Rules: 466.1.a.1 (Combat Cleanup step 3c: heal all units), 466.1.a.2 (step 3d: recall Attackers present
 * if Defenders are still present), 466.2 (the chain from combat damage and the Combat Cleanup resolves
 * BEFORE the result is determined), 466.3.a / 466.3.c (won = sole designated player with units remaining;
 * units inherit their CONTROLLER's result), 466.3.d ("No Result" if units were recalled during step 3d, or
 * if both / neither player has units present), 466.3.d.1 (restage only when both players still have units),
 * 466.5 / 466.5.a / 466.5.b / 466.5.d (establish control, clear Contested, Uncontrolled when nobody has
 * units here, Conquer), 323.4 / 323.5 (death triggers are queued before the dying card is trashed),
 * 455 / 456.1 (a Recall is not a Move — no move triggers, no move restrictions), 423.1.b (a stunned unit
 * deals no combat damage; it still needs full lethal), 814.1.c ([Shield]: +1 Might while defending),
 * 465.2.c.3 / 465.2.c.4 (the attacker assigns, lethal-aware).
 *
 * Question: P2 holds bf1 with Watchful Sentry (1) and Stalwart Poro (2 → 3 defending). P1's turn; a lone
 * Shipyard Skulker (3) attacks and P1 Rune-Prisons the Poro in the showdown. Skulker assigns 1 (lethal) to
 * the Sentry and 2 (not lethal) to the Poro; only the Sentry deals damage back, so both the Skulker and the
 * Poro live. (a) What happens at 3c/3d? (b) P2 is now the ONLY player with units at bf1 — did P2 WIN?
 * (c) P2 Flashes the Poro home in the 466.2 window — result, and who controls bf1? (d) Contrast: a 4-Might
 * attacker kills both defenders.
 *
 * Expected: (a) Deathknell queued, Sentry trashed, everyone healed, and the Skulker RECALLED to P1's base
 * (Defenders are still present). (b) NO — 466.3.d is explicit: units recalled during 3d ⇒ No Result, even
 * though P2 is the sole occupant; nothing restages and P2 neither wins nor scores. (c) Still No Result
 * (twice over), and with nobody's units left at bf1 it becomes UNCONTROLLED — P2 loses the battlefield it
 * defended. (d) No defenders at 3d ⇒ no recall ⇒ P1 is the sole player with units and holds the attacker
 * designation ⇒ P1 WON ⇒ Establish Control ⇒ Conquer, +1 point.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUNE_PRISON = "ogn-050-298";
const STALWART_PORO = "ogn-052-298";
const FLASH = "ogs-011-024";
const WATCHFUL_SENTRY = "ogn-096-298";
const SHIPYARD_SKULKER = "ogn-175-298";

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const count = (game: Game, key: string): number => (game.gameState.turnEventCounts ?? {})[key] ?? 0;
const combatDamageTo = (game: Game, target: string) =>
  (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).map((r) => r.amount);
const activeShowdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** P1's turn. P2 holds bf1 with Sentry + Poro; P1's attacker waits in base with Rune Prison in hand. */
function board(attackerMight: 3 | 4 = 3) {
  const attacker = attackerMight === 3 ? SHIPYARD_SKULKER : ({ might: 4, name: "Heavy Skulker" } as const);
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "bf1", STALWART_PORO, "poro")
    .unit(P1, "base", attacker, "skulker")
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P2, FLASH, "flash");
}

/**
 * Attack, stun the Poro, pass Focus both ways and (for the 3-Might attacker) assign 1/2.
 * Stops in the 466.2 window: the Sentry's Deathknell is on the chain and P2 holds priority.
 */
async function toCleanupWindow(attackerMight: 3 | 4 = 3): Promise<Game> {
  const game = await board(attackerMight).build();
  await game.p1.move("skulker", "bf1");
  expect(activeShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
  await game.p1.cast("prison", { targets: "poro" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("poro")).toMatchObject({ isStunned: true, might: 3 }); // [Shield] while defending (814.1.c)
  await game.p2.passFocus();
  await game.p1.passFocus();
  if (attackerMight === 3) {
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 3 });
    await game.p1.distribute({ poro: 2, sentry: 1 });
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
  return game;
}

describe("Stun + both sides live — 3d recalls the attacker, so nobody wins (466.3.d)", () => {
  // ---- (a) the damage step and the Combat Cleanup -------------------------------------------------

  test("(a) assignment is lethal-aware (465.2.c.4): 1 kills the 1-Might Sentry, 2 is NOT lethal on the 3-Might defending Poro; the stunned Poro deals nothing back, so only the Sentry's 1 reaches the Skulker (423.1.b)", async () => {
    const game = await toCleanupWindow();
    expect(combatDamageTo(game, "sentry")).toEqual([1]);
    expect(combatDamageTo(game, "poro")).toEqual([2]);
    expect(combatDamageTo(game, "skulker")).toEqual([1]);
    expect(count(game, "die|c:sentry")).toBe(1);
    expect(count(game, "die|c:poro")).toBe(0);
    expect(count(game, "die|c:skulker")).toBe(0);
  });

  test("(a) 3a queues the Deathknell and 3b trashes the Sentry (323.4/323.5); 3c heals everyone (466.1.a.1) — the Skulker's 1 and the Poro's 2 are both gone before the result is read", async () => {
    const game = await toCleanupWindow();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("skulker").damage).toBe(0);
    expect(game.state("poro").damage).toBe(0);
    expect(game.state("poro").isStunned).toBe(true); // a "this turn" status: the Cleanup does not clear it
  });

  test("(a) 3d recalls the attacker because Defenders are still present (466.1.a.2): the Skulker ends in P1's base, exhausted, undamaged — and a Recall is not a Move (455/456.1)", async () => {
    const game = await toCleanupWindow();
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.base()).toContain("skulker");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, owner: P1 });
    expect(count(game, "move")).toBe(1); // only the Standard Move that attacked
    expect(count(game, "move|c:skulker")).toBe(1);
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
  });

  // ---- (b) sole occupancy is NOT a win when 3d recalled ------------------------------------------

  test("(b) NO RESULT (466.3.d): P2 is the only player with units at bf1, yet nobody won or lost — no win-combat / lose-combat event fires for either seat", async () => {
    const game = await toCleanupWindow();
    await game.settle();
    expect(count(game, "win-combat")).toBe(0);
    expect(count(game, "win-combat|p:player-2")).toBe(0);
    expect(count(game, "win-combat|p:player-1")).toBe(0);
    expect(count(game, "lose-combat")).toBe(0);
    expect(count(game, "conquer")).toBe(0);
    expect(count(game, "score")).toBe(0);
  });

  test("(b) nothing restages (466.3.d.1 needs BOTH players to have units), 466.5 finds P2 already in control: Contested cleared, no Establish Control, no point — and P2 still drew off the Deathknell", async () => {
    const game = await toCleanupWindow();
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(activeShowdown(game)).toBeUndefined();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // [Deathknell] — Draw 1
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) Flash in the 466.2 window ---------------------------------------------------------------

  test("(c) the 466.2 window is real: with the Deathknell on the chain P2 holds priority and may cast Flash", async () => {
    const game = await toCleanupWindow();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flash")).toBe(true);
  });

  // The Skulker was recalled during step 3d of the Combat Cleanup — that happens BEFORE the 466.2
  // chain window (466.1 → 466.2). Flashing the Poro home in that window therefore leaves NEITHER
  // player with units at bf1 for 466.3: No Result twice over (units were recalled at 3d, and neither
  // player is present), nothing restages, and 466.5.b makes bf1 UNCONTROLLED with nobody scoring.
  test("P2 Flashes the Poro home in the 466.2 window — the already-recalled attacker is in P1's base and bf1 goes UNCONTROLLED with no result and no points (466.1.a.2, 466.3.d, 466.5.b)", async () => {
    const game = await toCleanupWindow();
    await game.p2.cast("flash", { targets: ["poro"] });
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.locationOf("poro")).toBe("base");
    expect(count(game, "win-combat")).toBe(0);
    expect(count(game, "conquer")).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  // ---- (d) contrast: no defenders left at 3d --------------------------------------------------------

  test("(d) a 4-Might attacker kills both defenders (1 + 3, the Poro's defending lethal): no Defenders present at 3d, so nothing is recalled and the Skulker stays at bf1", async () => {
    const game = await toCleanupWindow(4);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0 });
  });

  test("(d) P1 is the sole player with units and holds the attacker designation → P1 WON (466.3.a) → Establish Control → Conquer, +1 point (466.5.d)", async () => {
    const game = await toCleanupWindow(4);
    await game.settle();
    expect(count(game, "win-combat|p:player-1|bf:bf1")).toBe(1);
    expect(count(game, "win-combat|p:player-2")).toBe(0);
    expect(count(game, "conquer|p:player-1|bf:bf1")).toBe(1);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ---- summary --------------------------------------------------------------------------------------

  test("one board, one stun: leaving a single defender alive turns a would-be win into No Result — 3 Might = attacker recalled, P2 keeps bf1 with no point; 4 Might = P1 conquers", async () => {
    const three = await toCleanupWindow(3);
    await three.settle();
    const four = await toCleanupWindow(4);
    await four.settle();
    const summary = (g: Game) => ({
      attacker: g.zoneOf("skulker"),
      controller: bf1(g)?.controller,
      p1Points: g.p1.points(),
      wins: count(g, "win-combat"),
    });
    expect(summary(three)).toEqual({ attacker: "base", controller: P2, p1Points: 0, wins: 0 });
    expect(summary(four)).toEqual({ attacker: "battlefield-bf1", controller: P1, p1Points: 1, wins: 1 });
  });
});
