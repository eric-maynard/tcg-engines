/**
 * Ruling 01a14032394c04ed — Rengar, Pouncing (SFD-025 → sfd-025-221) · Fury Champion Unit · [3][fury] · 3 Might
 *   "[Reaction] [Assault 2] I can be played to a battlefield you're attacking."
 *
 * Q: Can I play Rengar, Pouncing to a battlefield I'm DEFENDING?
 * A: Yes. Beyond his special "battlefield you're attacking" permission he follows the normal rule: a [Reaction] unit may
 *    be played to your base or a battlefield you CONTROL — and you control the battlefield you are defending — at
 *    Reaction speed inside the combat showdown. He is then a defender, not an attacker, so [Assault 2] gives nothing.
 * Rules: 340.1 (play a unit to base or a battlefield you control), 813 (Reaction timing, incl. during showdowns),
 *        807.1.c (Assault only while attacking), 464.2.c.3.a (a unit arriving mid-combat on the controller's side defends).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "sfd-025-221";

/** P2's turn. P1 holds bf1 with Guard (2); P2's Raider (4) attacks from base. P1: Rengar in hand + [3][fury]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RENGAR, "rengar");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks bf1 → combat showdown, P2 (attacker) has Focus and passes it to P1. */
async function underAttack(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the defender controls the battlefield
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 01a14032394c04ed — Rengar, Pouncing may be played (Reaction) to the battlefield you are defending", () => {
  test("timing + location: inside the combat showdown P1 may play Rengar, and bf1 (controlled/defended) is a legal destination alongside base — the ENEMY bf2 is not", async () => {
    const game = await underAttack();
    expect(game.p1.can("play", "rengar")).toBe(true);
    const to = game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to");
    expect(to?.options).toContain("battlefield-bf1");
    expect(to?.options).toContain("base");
    expect(to?.options).not.toContain("battlefield-bf2"); // not attacking there, not controlled
  });

  test("played to bf1 he enters at once as a DEFENDER (exhausted, 3 Might — Assault 2 not applied), costs [3][fury]", async () => {
    const game = await underAttack();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("rengar")).toMatchObject({ combatRole: "defender", controller: P1, might: 3 });
    expect(game.state("rengar").keywords).toContain("Assault");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
  });

  test("he then fights as a defender at 3: Raider (4) into Guard 2 + Rengar 3 = 5 → Raider dies; the defenders take 4 between them and P1 keeps bf1", async () => {
    const game = await underAttack();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.units("bf1")).toContain("rengar");
    expect(game.state("rengar").might).toBe(3); // still no Assault after combat
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Reaction speed proper: he can even be played to bf1 in RESPONSE on a chain during that showdown (P2 casts a spell, P1 answers with Rengar)", async () => {
    const game = await board().hand(P2, "ogn-058-298", "disc").resources(P2, { energy: 2 }).build();
    await game.p2.move("raider", "bf1");
    await game.p2.cast("disc", { targets: "raider" }); // Discipline (Reaction) on the Raider opens a chain
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("play", "rengar")).toBe(true);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar")).toMatchObject({ combatRole: "defender", might: 3 });
  });
});
