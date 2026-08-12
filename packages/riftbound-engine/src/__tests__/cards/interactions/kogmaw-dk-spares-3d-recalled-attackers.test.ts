/**
 * Interaction: WHOSE units are standing at the battlefield when a Deathknell resolves is decided by
 * Combat Cleanup step 3d.
 *
 *   Kog'Maw, Caustic     (ogn-190-298) Unit · Chaos · 3+[chaos] · 1 Might
 *     "[Deathknell] — Deal 4 to all units at my battlefield."
 *   Galio, Indefatigable (unl-171-219) Unit · Order · 3+[order] · 6 Might
 *     "[Deflect] · [Tank] (I must be assigned combat damage first.) · I don't deal combat damage."
 *   Watchful Sentry      (ogn-096-298) Unit · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   Shipyard Skulker     (ogn-175-298) 3 Might vanilla attacker.
 *
 * Rules: 466.1.a.1 (Combat Cleanup inserts "3c. Heal all Units") · 466.1.a.2 ("3d. Recall Attackers
 * present at the Battlefield if Defenders are still present") · 466.2 (resolve the chain from the
 * damage step and the Combat Cleanup BEFORE the result step) · 466.3.d / 466.3.d.1 (No Result if
 * units were recalled during 3d, or if neither player has units; a restage needs BOTH players) ·
 * 466.5 / 466.5.a / 466.5.b (Establish Control, clear Contested, else Uncontrolled) ·
 * 465.2.c.3 / 815.1.b ([Tank] must be assigned lethal first) · 808.1.d.2 / 323.4 / 323.5
 * (3a queues the Deathknell noting its battlefield, 3b trashes the unit).
 *
 * Q: BOARD 1 — P2 holds bf1 with Galio + Sentry; P1 attacks with Kog'Maw + Skulker. [Tank] eats all
 *    4 attacker damage (never lethal on a 6), the Sentry's single point kills Kog'Maw.
 *    BOARD 2 — the same Kog'Maw is P2's LONE defender and P1 attacks with the Skulker alone.
 *    In each: is Galio healed before or after the Deathknell's 4 lands, which units are at bf1 when
 *    the Deathknell resolves, and what is the 466.3 classification / final control of bf1?
 *
 * A: Same Deathknell, opposite victims, decided purely by whether Defenders were still present at 3d.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const GALIO = "unl-171-219";
const WATCHFUL_SENTRY = "ogn-096-298";
const SHIPYARD_SKULKER = "ogn-175-298";

interface DamageRow {
  readonly amount: number;
  readonly combat?: boolean;
  readonly target: string;
  readonly source?: { readonly cardId?: string; readonly player?: string };
}
const damageLog = (game: Game): readonly DamageRow[] =>
  (game.gameState as unknown as { damageLog?: readonly DamageRow[] }).damageLog ?? [];
const combatDamage = (game: Game, target: string) =>
  damageLog(game).filter((r) => r.combat === true && r.target === target).map((r) => r.amount);
const deathknellDamage = (game: Game, target: string) =>
  damageLog(game)
    .filter((r) => r.combat !== true && r.source?.cardId === "kog" && r.target === target)
    .map((r) => r.amount);
const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** BOARD 1 — P2 holds bf1 with Galio + Watchful Sentry; P1 attacks with Kog'Maw + Skulker. */
function board1() {
  return scenario()
    .active(P1)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GALIO, "galio")
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", KOGMAW, "kog")
    .unit(P1, "base", SHIPYARD_SKULKER, "skulker");
}

/** BOARD 2 — Kog'Maw is P2's LONE defender at bf1; P1 attacks with the Skulker alone. */
function board2() {
  return scenario()
    .active(P1)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P1, "base", SHIPYARD_SKULKER, "skulker");
}

async function fight1(): Promise<Game> {
  const game = await board1().build();
  await game.p1.move(["kog", "skulker"], "bf1");
  await game.settle();
  return game;
}

async function fight2(): Promise<Game> {
  const game = await board2().build();
  await game.p1.move("skulker", "bf1");
  await game.settle();
  return game;
}

describe("Kog'Maw Deathknell × Combat Cleanup 3d — Galio/Sentry board vs lone-defender board", () => {
  test("BOARD 1 damage step: [Tank] takes all 4 attacker damage (4 < 6, never lethal) so the Sentry is untouched, and Galio deals none — the defenders' single point is lethal to Kog'Maw", async () => {
    const game = await fight1();
    expect(combatDamage(game, "galio")).toEqual([4]); // 465.2.c.3 / 815.1.b
    expect(combatDamage(game, "sentry")).toEqual([]);
    expect(combatDamage(game, "kog")).toEqual([1]); // Galio contributes nothing
    expect(combatDamage(game, "skulker")).toEqual([]);
    expect(game.zoneOf("kog")).toBe("trash"); // 323.5 — step 3b
  });

  test("BOARD 1: step 3c heals ALL units before the Deathknell lands, so Galio survives the 4 (6 Might, 4 damage) instead of dying to 4+4", async () => {
    const game = await fight1();
    expect(deathknellDamage(game, "galio")).toEqual([4]);
    expect(game.zoneOf("galio")).toBe("battlefield-bf1");
    // The 4 combat damage was healed at 3c; the 4 now marked is entirely the Deathknell's.
    expect(game.state("galio").damage).toBe(4);
  });

  test("BOARD 1: the Deathknell kills the 1-Might Sentry, whose own Deathknell resolves in the same 466.2 window and draws P2 a card", async () => {
    const game = await fight1();
    const fresh = await board1().build();
    expect(deathknellDamage(game, "sentry")).toEqual([4]);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(fresh.p2.hand().length + 1);
  });

  // Expected (466.1.a.2): step 3d of the Combat Cleanup recalls Attackers present when Defenders
  // are still present — Galio and the Sentry are both alive at 3d, so the Skulker goes to P1's base
  // and is simply not at bf1 for the 466.2 Deathknell. Actual: `resolve-full-combat.ts` records
  // `combatAttackersAtCleanup` at the Cleanup but defers the physical recall to the Resolution Step
  // AFTER the 466.2 chain, so the Skulker is still standing when Kog'Maw's 4 goes out, is healed to
  // 3 by 3c and dies to it.
  test("the attacker is recalled by step 3d — 466.1.a.2 moves the Skulker to P1's base (466.1.a.2) must move the Skulker to P1's base BEFORE the Deathknell resolves, taking it out of the blast", async () => {
    const game = await fight1();
    expect(deathknellDamage(game, "skulker")).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.locationOf("skulker")).toBe("base");
  });

  test("BOARD 1 result: no restage (P1 has no units here), P2 already controlled bf1 so nothing is Established or Conquered, Contested is cleared and nobody scores", async () => {
    const game = await fight1();
    expect(bf1(game).controller).toBe(P2);
    expect(bf1(game).contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("BOARD 2: no defender survives to 3b, so 3d recalls NOTHING — the Skulker is still at bf1 in the 466.2 window and the Deathknell's 4 kills the healed 3-Might attacker", async () => {
    const game = await fight2();
    expect(combatDamage(game, "kog")).toEqual([3]);
    expect(combatDamage(game, "skulker")).toEqual([1]); // the lone defender's own point, non-lethal
    expect(game.zoneOf("kog")).toBe("trash");
    expect(deathknellDamage(game, "skulker")).toEqual([4]);
    expect(game.zoneOf("skulker")).toBe("trash");
  });

  test("BOARD 2 result: neither player has units present → No Result (466.3.d), no restage (466.3.d.1 needs both), and bf1 becomes UNCONTROLLED (466.5.b) — P2 loses its own battlefield to its own dead unit and P1 scores nothing", async () => {
    const game = await fight2();
    expect(bf1(game).controller).toBeNull();
    expect(bf1(game).contested).toBe(false);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
