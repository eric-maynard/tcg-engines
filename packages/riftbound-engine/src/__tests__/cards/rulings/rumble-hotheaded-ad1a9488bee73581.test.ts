/**
 * Ruling ad1a9488bee73581 — Rumble, Hotheaded (SFD-026 → sfd-026-221) · 4 Might · Mech "Your Mechs each have [Assault]. (+1 [Might] while
 *   we're attackers.) …"  × Hidden Blade (OGN-213 → ogn-213-298) [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   (+ Bubble Bot sfd-062-221, a 3-Might Mech, as "my other Mech".)
 *
 * Q: Attackers/defenders are declared; I pass and Rumble is Hidden-Bladed. Do my other Mechs keep the Assault he gave them?
 * A: No. It is a continuous effect of Rumble's passive; the moment he leaves the board it stops, and the other Mechs lose Assault
 *    immediately — including for the rest of that combat.
 * Rules: 365.1 / 522 (passive abilities apply only while their source is on the board), 476 (layers re-evaluated continuously), 802 (Assault).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUMBLE = "sfd-026-221";
const BUBBLE_BOT = "sfd-062-221"; // 3 Might Mech
const HIDDEN_BLADE = "ogn-213-298";

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/** P1's turn. P1: Rumble (4) + Bubble Bot (3) ready in base. P2 holds bf1 with a 4-Might Wall and has Hidden Blade in hand + [2][order]. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
    .unit(P1, "base", RUMBLE, "rumble")
    .unit(P1, "base", BUBBLE_BOT, "bot")
    .hand(P2, HIDDEN_BLADE, "blade");
}

/** Both Mechs attack bf1; P1 passes Focus to P2. */
async function mechsAttack(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bot").keywords).toContain("Assault"); // granted by Rumble's passive already
  expect(game.state("bot").might).toBe(3); // not attacking yet
  await game.p1.move(["rumble", "bot"], "bf1");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  return game;
}

describe("Ruling ad1a9488bee73581 — kill Rumble mid-showdown and the other Mechs lose Assault at once", () => {
  test("attackers declared: Rumble 4→5 and Bubble Bot 3→4 thanks to Assault", async () => {
    const game = await mechsAttack();
    expect(game.state("rumble")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.state("bot")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("bot").keywords).toContain("Assault");
  });

  test("P1 passes; P2 Hidden-Blades Rumble: the instant he hits the trash Bubble Bot has NO Assault and is back to 3 Might — still an attacker, still mid-showdown", async () => {
    const game = await mechsAttack();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "blade")).toBe(true);
    await game.p2.cast("blade", { targets: "rumble" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hidden Blade resolves
    expect(game.zoneOf("rumble")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2); // "its controller draws 2"
    expect(showdown(game)?.battlefieldId).toBe("bf1"); // combat still pending
    expect(game.state("bot").combatRole).toBe("attacker");
    expect(game.state("bot").keywords).not.toContain("Assault");
    expect(game.state("bot").grantedKeywords).toEqual([]);
    expect(game.state("bot").might).toBe(3);
  });

  test("and it matters for the rest of the combat: Bubble Bot now hits for 3, not 4 — the 4-Might Wall survives and holds; the Bot dies", async () => {
    const game = await mechsAttack();
    await game.p1.passFocus();
    await game.p2.cast("blade", { targets: "rumble" });
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // took 3 < 4 (healed after combat)
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("bot")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control: had Rumble stayed, Bubble Bot's 4 (with Assault) plus Rumble's 5 would have flattened the Wall", async () => {
    const game = await mechsAttack();
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
