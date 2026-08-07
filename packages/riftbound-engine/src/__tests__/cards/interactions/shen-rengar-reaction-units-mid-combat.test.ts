/**
 * Interaction: Reaction units entering an ongoing combat.
 *   Rengar, Pouncing (sfd-025-221) — 3 Might Fury champion, [3]
 *     "[Reaction] [Assault 2] I can be played to a battlefield you're attacking."
 *   Shen, Kinkou (ogn-241-298) — 3 Might Order champion, [3]
 *     "[Reaction] [Shield 2] (+2 Might while I'm a defender.) [Tank]"
 *
 * Question: P1 attacks P2's bf1 (P1: one 4-Might unit; P2: one 2-Might unit). During the showdown
 * (a) can P1, holding Focus, play Rengar straight to bf1 and does he fight as a 5-Might attacker?
 * (b) can P2 then play Shen to bf1 and does he defend with Shield 2 / Tank? (c) could P1 have
 * played Shen to bf1 instead? can P2 play Shen off-Focus, merely holding priority on P1's chain?
 * Final combat math?
 *
 * Rules:
 *   806.3 / 813.3.a  Action/Reaction are timing permissions only — a unit still goes to your base
 *              or a battlefield YOU control. Rengar's own text adds "a battlefield you're attacking".
 *   813.1.c.1  Reaction: playable in Closed states on any player's turn (i.e. whenever you hold
 *              priority/Focus), not only with Focus.
 *   337.2      a finalized unit chain item resolves immediately (no response window to the unit).
 *   340.2.a / 347.1  after that chain closes during a showdown, Focus passes to the next player.
 *   464.2.c.3.a  a unit that becomes present mid-combat gains Attacker/Defender at the next Cleanup.
 *   807.1.c / 814.1.c  Assault/Shield = "+X Might while I'm an attacker/defender" (real Might —
 *              counts for lethal-damage thresholds too). 815.1.b Tank: lethal to me first.
 *   465.2.c.3 / 465.2.c.6  lethal must be assigned in full, honoring Tank.
 *   466.3.a / 466.5  sole side with units left wins; attacker then establishes control (conquer).
 *   Math: attackers 4 + (3+2) = 9 vs defenders 2 + (3+2) = 7. P1: 5 to Shen (Tank) then 4 to the
 *   2-drop → both defenders die. P2's 7 cannot kill both a 4 and a 5 → one attacker survives →
 *   P1 wins and conquers bf1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "sfd-025-221";
const SHEN = "ogn-241-298";
const DISCIPLINE = "ogn-058-298"; // [2] Calm Action spell: "Give a unit +2 Might this turn. Draw 1." — just a chain starter

/** Legal `to` destinations offered to `seat` for playing `alias` right now ([] when not offered). */
function destinationsOffered(game: Game, seat: typeof P1, alias: string): string[] {
  const opt = game.seat(seat).option("play", alias);
  const field = opt?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []) as string[]).slice().sort();
}

/**
 * bf1: P2's, defended by a vanilla 2. bf2: P1's (a legal "battlefield you control" for contrast).
 * P1: vanilla 4 in base, Rengar + a Shen of his own + Discipline in hand, [8] + fury/order/calm.
 * P2: Shen in hand, [3] + order.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .resources(P1, { energy: 8, power: { fury: 1, order: 1, calm: 1 } })
    .resources(P2, { energy: 3, power: { order: 1 } })
    .unit(P1, "base", { might: 4, name: "Vanilla Four" }, "four")
    .unit(P2, "bf1", { might: 2, name: "Vanilla Two" }, "two")
    .hand(P1, RENGAR, "rengar")
    .hand(P1, SHEN, "p1shen")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, SHEN, "shen");
}

/** Open the combat: P1's 4-drop attacks bf1; P1 (attacker) holds Focus in the showdown. */
async function attack() {
  const game = await board().build();
  await game.p1.move("four", "bf1");
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
  return game;
}

describe("Rengar, Pouncing / Shen, Kinkou played into an ongoing combat", () => {
  // ── (a) Rengar to the battlefield he is attacking ─────────────────────────────────────

  test("(a) with Focus, P1 is offered Rengar → bf1 ('a battlefield you're attacking') as well as base / his own bf2 (813.3.a + card text)", async () => {
    const game = await attack();
    expect(game.p1.can("play", "rengar")).toBe(true);
    expect(destinationsOffered(game, P1, "rengar")).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
  });

  test("(a) Rengar played to bf1 resolves immediately (337.2), is paid for, gains the Attacker designation (464.2.c.3.a) and Focus passes to P2 (340.2.a)", async () => {
    const game = await attack();
    const energy = game.p1.energy();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]); // unit item resolved on finalize — nothing to respond to
    expect(game.p1.energy()).toBe(energy - 3);
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
  });

  test("(a) as an attacker Rengar's Assault 2 is real Might — he reads 5 (807.1.c)", async () => {
    // Expected: 3 + Assault 2 = 5 while designated attacker. Actual (even via a normal move, which
    // does designate him): effective Might stays 3; Assault is only folded into the damage total.
    const game = await board().unit(P1, "base", RENGAR, "rengarOnBoard").build();
    await game.p1.move(["four", "rengarOnBoard"], "bf1");
    expect(game.state("rengarOnBoard").combatRole).toBe("attacker");
    expect(game.state("rengarOnBoard").might).toBe(5);
  });

  // ── (b) Shen for the defender ─────────────────────────────────────────────────────────

  test("(b) P2 still controls bf1 during the combat (control only changes at resolution, 466.5)", async () => {
    const game = await attack();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("(b) once Focus reaches P2, Shen is offered → bf1 (a battlefield P2 controls) and, played there, resolves immediately as a Defender (813.3.a, 337.2, 464.2.c.3.a)", async () => {
    // P2 may play the Reaction unit on P1's turn during the showdown, to base or bf1.
    const game = await attack();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    expect(destinationsOffered(game, P2, "shen")).toEqual(["base", "battlefield-bf1"]);
    await game.p2.play("shen", { to: "bf1" });
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("shen").combatRole).toBe("defender");
    expect(game.state("shen").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
  });

  test("(b) as a defender Shen's Shield 2 is real Might — he reads 5 (814.1.c)", async () => {
    // Same view gap as Rengar: Shield only enters the combat damage sum, not the unit's Might.
    const game = await board().unit(P2, "bf1", SHEN, "shenOnBoard").build();
    await game.p1.move("four", "bf1");
    expect(game.state("shenOnBoard").combatRole).toBe("defender");
    expect(game.state("shenOnBoard").might).toBe(5);
  });

  // ── (c) where / when Shen may be played ───────────────────────────────────────────────

  test("(c) P1's own Shen is never offered bf1 — outside combat the destinations are exactly base + P1's bf2 (806.3, 813.3.a)", async () => {
    const game = await board().build();
    expect(destinationsOffered(game, P1, "p1shen")).toEqual(["base", "battlefield-bf2"]);
    await expect(game.p1.play("p1shen", { to: "bf1" })).rejects.toThrow();
    expect(game.zoneOf("p1shen")).toBe("hand");
  });

  test("(c) during the showdown P1 is not offered bf1 for his own Shen either (no Rengar-style permission)", async () => {
    const game = await attack();
    expect(destinationsOffered(game, P1, "p1shen")).not.toContain("battlefield-bf1");
    await expect(game.p1.play("p1shen", { to: "bf1" })).rejects.toThrow();
    expect(game.zoneOf("p1shen")).toBe("hand");
  });

  test("(c) …but P1 CAN play his Shen during the showdown as a Reaction — just only to base or bf2 (813.1.c.1, 813.3.a)", async () => {
    // Expected: offered with destinations base + battlefield-bf2. Actual: not offered at all.
    const game = await attack();
    expect(game.p1.can("play", "p1shen")).toBe(true);
    expect(destinationsOffered(game, P1, "p1shen")).toEqual(["base", "battlefield-bf2"]);
  });

  test("(c) P2 may play Shen while merely holding PRIORITY on P1's chain (not Focus) — Reaction works in any Closed state (813.1.c.1)", async () => {
    // Expected: P1 (Focus) casts Discipline → chain; P1 passes priority → P2, holding priority, may
    // play Shen to bf1; it resolves at once (337.2) while Discipline is still on the chain.
    // Actual: no unit play is offered to P2 there.
    const game = await attack();
    await game.p1.cast("discipline", { targets: "four" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.p2.can("play", "shen")).toBe(true);
    expect(destinationsOffered(game, P2, "shen")).toContain("battlefield-bf1");
    await game.p2.play("shen", { to: "bf1" });
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "discipline" })]);
  });

  test("(c) there is no window to respond to Rengar himself: a unit is not a spell, so P2 has no priority during P1's Focus action before it resolves (337.2)", async () => {
    const game = await attack();
    // While P1 holds Focus and nothing is on the chain, P2 has no legal action at all.
    expect(game.p2.legal()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  // ── final combat math (board equivalent to (a)+(b) having happened) ───────────────────

  /** Same designations as after (a)+(b): four + Rengar attack, two + Shen defend. */
  async function fullCombat() {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Vanilla Four" }, "four")
      .unit(P1, "base", RENGAR, "rengar")
      .unit(P2, "bf1", { might: 2, name: "Vanilla Two" }, "two")
      .unit(P2, "bf1", SHEN, "shen")
      .build();
    await game.p1.move(["four", "rengar"], "bf1");
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("shen").combatRole).toBe("defender");
    await game.settle(); // both pass Focus → combat damage → resolution
    expect(game.violations()).toEqual([]);
    return game;
  }

  test("attackers' 9 (4 + Rengar 3+2 Assault): Tank forces lethal 5 onto Shen (3+2 Shield) first, then 4 onto the 2-drop — both defenders die (815.1.b, 465.2.c.3)", async () => {
    const game = await fullCombat();
    expect(game.zoneOf("shen")).toBe("trash");
    expect(game.zoneOf("two")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("defenders' 7 (2 + Shen 5) cannot kill both a 4-Might unit and a 5-Might Rengar — exactly one attacker survives, so P1 wins the combat and conquers bf1 (807.1.c, 465.2.c.3, 466.3.a, 466.5)", async () => {
    // Expected: 7 = lethal 4 on one + 3 leftover (or lethal 5 on Rengar + 2 leftover): one attacker
    // lives, P1 is the only player with units at bf1 → wins, establishes control, scores 1.
    // Actual: the resolver treats Rengar's lethal threshold as his base 3 (Assault ignored for
    // survival), kills both attackers, calls it a tie and leaves bf1 uncontrolled.
    const game = await fullCombat();
    const survivors = game.p1.units("bf1");
    expect(survivors).toHaveLength(1);
    expect(["four", "rengar"]).toContain(survivors[0] as string);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
  });
});
