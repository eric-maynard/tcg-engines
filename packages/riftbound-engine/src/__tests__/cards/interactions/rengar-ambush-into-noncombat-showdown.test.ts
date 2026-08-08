/**
 * Interaction: Rengar, Trophy Hunter (unl-120-219) — 6 Might Body champion unit, [5]+[body]
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *      I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *   × Inferna (unl-002-219) — 1 Might Fury unit, [2]
 *     "[Ambush] [Assault 2] (+2 [Might] while I'm an attacker.)"
 *   × a vanilla 2-Might Scout Standard-Moving onto an empty, uncontrolled battlefield.
 *
 * Question: P1's turn. bfC is empty and uncontrolled. P1 Standard-Moves Scout (2) onto bfC → a
 * Non-Combat Showdown opens, P1 has Focus and passes; P2 now has Focus, holding Rengar and Inferna
 * with resources for both.
 *   NO-1  Can P2 play Inferna to bfC right now?
 *   YES   Can P2 play Rengar to bfC during this showdown? If so: is Contested re-applied for P2? When
 *         does the non-combat showdown become a combat? Who is Attacker/Defender, who has Focus? If
 *         Rengar survives alone, does P2 conquer and score on P1's turn?
 *   YES-2 Once Rengar is at bfC, can Inferna be Ambushed there during the combat showdown, and does
 *         its Assault 2 count?
 *
 * Rules:
 *   822.1.b — Ambush = "may be played to a battlefield where you control units" + Reaction timing
 *              only while being played there. 343.1.a — otherwise no unit plays in a Showdown state.
 *   822.1.d / 355.2.b — Rengar's text expands Ambush's permission (and timing) to battlefields with
 *              ENEMY units.
 *   190.3.a.1 — bfC is already Contested (by P1); Rengar's arrival applies nothing new.
 *   316.8.b.1.a / 323.9 / 323.14 / 460.1 / 464.1 — in the Cleanup after Rengar resolves, opposing
 *              units are present → Combat staged → the ongoing Non-Combat Showdown becomes a Combat
 *              Showdown (not mid-chain).
 *   464.2.c.1 / 464.2.c.2 / 464.2.d — Attacker = the player who applied Contested (P1), Defender =
 *              P2; Attacker holds Focus. 464.2.c.3.a / 323.2.a — later arrivals take their
 *              controller's designation. 807.1.c — Assault only while an attacker.
 *   466.3.a / 466.5 / 466.5.e — the sole player with units left establishes control (Conquer, +1)
 *              even if they did not apply Contested.
 *
 * Expected: NO-1 no. YES: Rengar playable to bfC (enters exhausted); contestedBy stays P1; showdown
 *   turns into a combat showdown after he resolves; Scout attacker / Rengar defender; P1 has Focus;
 *   both pass → Scout (2) dies to Rengar (6); P2 conquers bfC and scores 1 on P1's turn.
 *   YES-2: Inferna → bfC legal once Rengar is there; it is a DEFENDER, 1 Might.
 *   PARITY: identical roles/result if Rengar had already been standing on uncontrolled bfC.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const INFERNA = "unl-002-219";

/** Legal `to` destinations offered to `seat` for playing `alias` right now ([] when not offered). */
function destinationsOffered(game: Game, seat: typeof P1, alias: string): string[] {
  const opt = game.seat(seat).option("play", alias);
  const field = opt?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []) as string[]).slice().sort();
}

/** P1's turn; bfC empty + uncontrolled; P1 Scout (2) in base; P2 holds Rengar + Inferna with [7]+body+fury. */
function board() {
  return scenario()
    .battlefield("bfC", { controller: null })
    .resources(P2, { energy: 7, power: { body: 1, fury: 1 } })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P2, RENGAR, "rengar")
    .hand(P2, INFERNA, "inferna");
}

/** Scout walks onto bfC → Non-Combat Showdown; P1 (Focus) passes → P2 has Focus. */
async function p2HasFocusInNonCombatShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bfC");
  expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  const sd = game.gameState.interaction?.showdownStack?.at(-1);
  expect(sd).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** PARITY board: P2's Rengar already stands on uncontrolled bfC; Scout Standard-Moves in → combat showdown. */
async function parityCombat(): Promise<Game> {
  const game = await scenario()
    .battlefield("bfC", { controller: null })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bfC", RENGAR, "rengar")
    .hand(P2, INFERNA, "inferna")
    .build();
  expect(game.gameState.battlefields.bfC?.controller).toBeNull();
  await game.p1.move("scout", "bfC");
  return game;
}

describe("Rengar, Trophy Hunter ambushing into a Non-Combat Showdown (× Inferna)", () => {
  // ── NO-1: Inferna's plain Ambush has nowhere to go ────────────────────────────────────

  test("NO-1: with no P2 unit at bfC, Inferna is not playable during the showdown at all — not to bfC (822.1.b) and not to base (343.1.a)", async () => {
    const game = await p2HasFocusInNonCombatShowdown();
    expect(game.p2.can("play", "inferna")).toBe(false);
    expect(destinationsOffered(game, P2, "inferna")).toEqual([]);
    await expect(game.p2.play("inferna", { to: "bfC" })).rejects.toThrow();
    await expect(game.p2.play("inferna", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("inferna")).toBe("hand");
    expect(game.p2.energy()).toBe(7);
  });

  // ── YES: Rengar's expanded Ambush ─────────────────────────────────────────────────────

  // Expected (822.1.d, 355.2.b): Rengar's "battlefield where there are enemy units" expands Ambush's
  // location permission AND its Reaction timing, so with Focus in the Showdown Open state P2 is
  // offered playUnit:rengar → battlefield-bfC. Actual: the engine only honours
  // CanPlayToEnemyBattlefield in the main phase; during the showdown Rengar is not offered anywhere
  // (and a raw playUnit to bfC is rejected).
  test("YES: with Focus in the non-combat showdown P2 is offered Rengar → bfC (enemy units there) (822.1.d, 355.2.b)", async () => {
    const game = await p2HasFocusInNonCombatShowdown();
    expect(game.p2.can("play", "rengar")).toBe(true);
    expect(destinationsOffered(game, P2, "rengar")).toContain("battlefield-bfC");
  });

  test("YES: Rengar played to bfC is paid for ([5]+[body]), enters EXHAUSTED at bfC, and Contested stays applied by P1 (190.3.a.1)", async () => {
    const game = await p2HasFocusInNonCombatShowdown();
    await game.p2.play("rengar", { to: "bfC" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bfC");
    expect(game.state("rengar").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 0, fury: 1 } });
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("YES: after Rengar resolves, the Cleanup stages Combat and the SAME showdown becomes a Combat Showdown — Attacker P1 (applied Contested), Defender P2; Scout attacker, Rengar defender (316.8.b.1.a, 323.14, 464.2.c)", async () => {
    const game = await p2HasFocusInNonCombatShowdown();
    await game.p2.play("rengar", { to: "bfC" });
    expect(game.chain()).toEqual([]); // he resolved; conversion happens at cleanup, not mid-chain
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfC", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.state("rengar").might).toBe(6);
  });

  test("YES: the Attacker (P1 — who walked in first, not P2 whose unit arrived last) holds Focus in the now-combat showdown (464.2.d / 464.2.c.1.b)", async () => {
    const game = await p2HasFocusInNonCombatShowdown();
    await game.p2.play("rengar", { to: "bfC" });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("YES: both pass → Scout (2) dies to Rengar (6); P2, sole player with units left, CONQUERS bfC and scores 1 on P1's turn even though P1 applied Contested (466.3.a, 466.5, 466.5.e)", async () => {
    const game = await p2HasFocusInNonCombatShowdown();
    await game.p2.play("rengar", { to: "bfC" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("battlefield-bfC");
    expect(game.state("rengar").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("YES-2: once Rengar is at bfC, Inferna's own Ambush is live — offered → bfC during the combat showdown, enters as a DEFENDER at 1 Might (no Assault) (822.1.b, 464.2.c.3.a, 807.1.c)", async () => {
    const game = await p2HasFocusInNonCombatShowdown();
    await game.p2.play("rengar", { to: "bfC" });
    await game.p1.passFocus(); // Attacker P1 has Focus first; pass it to P2
    expect(destinationsOffered(game, P2, "inferna")).toContain("battlefield-bfC");
    await game.p2.play("inferna", { to: "bfC" });
    expect(game.zoneOf("inferna")).toBe("battlefield-bfC");
    expect(game.state("inferna").combatRole).toBe("defender");
    expect(game.state("inferna").might).toBe(1);
  });

  // ── contrast: the same permissions DO work outside a non-combat showdown ─────────────

  test("contrast: on P2's own turn (Neutral Open) Rengar IS offered a battlefield holding only enemy units, enters exhausted there and opens a combat with P2 attacking (822.1.d main-phase half works)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfP1", { controller: P1 })
      .resources(P2, { energy: 7, power: { body: 1, fury: 1 } })
      .unit(P1, "bfP1", { might: 2, name: "Scout" }, "scout")
      .hand(P2, RENGAR, "rengar")
      .hand(P2, INFERNA, "inferna")
      .build();
    expect(destinationsOffered(game, P2, "rengar")).toEqual(["base", "battlefield-bfP1"]);
    expect(destinationsOffered(game, P2, "inferna")).toEqual(["base"]); // plain Ambush: no friendly unit there
    await game.p2.play("rengar", { to: "bfP1" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bfP1");
    expect(game.state("rengar").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 0, fury: 1 } });
    expect(game.gameState.battlefields.bfP1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("scout").combatRole).toBe("defender");
  });

  // ── PARITY: Rengar already standing on uncontrolled bfC when Scout walks in ──────────

  test("PARITY: Scout Standard-Moves onto uncontrolled bfC where P2's Rengar already stands → combat showdown at once; P1 (applied Contested) is Attacker with Focus, Rengar is a Defender (464.2.c.1/2, 464.2.d)", async () => {
    const game = await parityCombat();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("PARITY / YES-2: with Rengar at bfC, Inferna is Ambushed → bfC as a Reaction during the combat showdown; it takes P2's DEFENDER designation and reads 1 Might — Assault 2 does not apply (822.1.b, 323.2.a, 807.1.c)", async () => {
    const game = await parityCombat();
    expect(game.p2.legal()).toEqual([]); // P1 holds Focus, nothing on the chain: P2 cannot act yet
    await game.p1.passFocus();
    expect(game.p2.can("play", "inferna")).toBe(true);
    expect(destinationsOffered(game, P2, "inferna")).toEqual(["battlefield-bfC"]); // Reaction timing ONLY where Ambush applies — not base (343.1.a)
    await game.p2.play("inferna", { to: "bfC" });
    expect(game.zoneOf("inferna")).toBe("battlefield-bfC");
    expect(game.chain()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.state("inferna").isExhausted).toBe(true);
    expect(game.state("inferna").combatRole).toBe("defender");
    expect(game.state("inferna").might).toBe(1);
    expect(game.state("inferna").keywords).toEqual(expect.arrayContaining(["Ambush", "Assault"]));
  });

  test("PARITY: both pass → Scout (2) deals 2 to Rengar and dies to his 6; Rengar survives, healed", async () => {
    const game = await parityCombat();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("battlefield-bfC");
    expect(game.state("rengar").damage).toBe(0);
    expect(game.state("rengar").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfC?.contested).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // Expected (466.5, 466.5.d, 466.5.e): no showdown/combat is staged and only P2 has units at bfC →
  // P2 establishes control although P1 applied Contested; P2 has not scored bfC this turn → Conquer,
  // +1 point for P2 during P1's turn. Actual: the resolver only lets the ATTACKER establish control;
  // a winning defender on an uncontrolled battlefield leaves it uncontrolled and scores nothing.
  test("PARITY: the surviving DEFENDER on an uncontrolled battlefield establishes control — P2 conquers bfC and scores 1 on P1's turn (466.5, 466.5.e)", async () => {
    const game = await parityCombat();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bfC?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
  });
});
