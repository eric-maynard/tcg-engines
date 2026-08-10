/**
 * Ruling c3a86d7ea5b371b5 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · 2+[body] · [Action]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Draven, Audacious (SFD-148 → sfd-148-221) · 6 Might "[Deflect] The first time I win a combat each turn, you score 1 point. …"
 *
 * Q: Does using Challenge count as combat?
 * A: No. Challenge is a spell making two units deal (non-combat) damage to each other — no Showdown / Combat steps. Hence: a
 *    STUNNED unit still deals its damage through Challenge (stun only stops combat damage); Draven's "win a combat" does not
 *    trigger off it; and the damage stays marked until any combat resolves (which heals all units) or the turn ends.
 * Rules: 454–458 (what a Combat is), 142 (damage; healed at end of turn / combat cleanup 458), 817 (Stunned: deals no COMBAT damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const DRAVEN_AUDACIOUS = "sfd-148-221";

/**
 * P1's turn with two Challenges ([4]+[body][body]). P1 base: Draven (6), a STUNNED 2-Might unit, a 5-Might Big. P2 base: Foe (3),
 * Tiny (1); P2 holds bf1 with a 1-Might Guard (for a real combat later).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DRAVEN_AUDACIOUS, "draven")
    .unit(P1, "base", { might: 2, name: "Stunned Guy" }, "sg", { stunned: true })
    .unit(P1, "base", { might: 5, name: "Big" }, "big")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 1, name: "Tiny" }, "tiny")
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
    .hand(P1, CHALLENGE, "ch1")
    .hand(P1, CHALLENGE, "ch2");
}

const showdownOpen = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).some((s) => s.active);

async function challenge(game: Game, spell: "ch1" | "ch2", mine: string, theirs: string): Promise<void> {
  await game.p1.cast(spell, { targets: [mine, theirs] });
  expect(showdownOpen(game)).toBe(false); // just a spell on the chain — no showdown
  await game.settle();
  expect(game.zoneOf(spell)).toBe("trash");
}

describe("Ruling c3a86d7ea5b371b5 — Challenge is not combat", () => {
  test("Draven (6) Challenges Foe (3): Foe takes 6 and dies, Draven takes 3 — no showdown/combat ever opened, and Draven's 'win a combat' does NOT score", async () => {
    const game = await board().build();
    await challenge(game, "ch1", "draven", "foe");
    expect(showdownOpen(game)).toBe(false);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("draven")).toMatchObject({ damage: 3, zone: "base" });
    expect(game.state("draven").combatRole).toBeFalsy();
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("a STUNNED unit still deals its Might through Challenge: Stunned Guy (2) vs Tiny (1) → Tiny dies, Stunned Guy takes 1", async () => {
    const game = await board().build();
    expect(game.state("sg").isStunned).toBe(true);
    await challenge(game, "ch2", "sg", "tiny");
    expect(game.zoneOf("tiny")).toBe("trash");
    expect(game.state("sg")).toMatchObject({ damage: 1, zone: "base" });
  });

  test("the Challenge damage persists through the open state and is only cleared when the turn ends", async () => {
    const game = await board().build();
    await challenge(game, "ch1", "draven", "foe");
    await challenge(game, "ch2", "sg", "tiny");
    expect(game.state("draven").damage).toBe(3);
    expect(game.state("sg").damage).toBe(1);
    await game.advanceTurn();
    expect(game.state("draven").damage).toBe(0);
    expect(game.state("sg").damage).toBe(0);
  });

  test("…or when ANY combat resolves: after the Challenge, Big attacks and wins a real combat at bf1 — that combat's cleanup heals Draven in base too (and it is Big's combat, so Draven still scores nothing beyond the conquer point)", async () => {
    const game = await board().build();
    await challenge(game, "ch1", "draven", "foe");
    expect(game.state("draven").damage).toBe(3);
    await game.p1.move("big", "bf1");
    expect(showdownOpen(game)).toBe(true); // THIS is a combat
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // conquer only — Draven was not in that combat
    expect(game.state("draven").damage).toBe(0);
  });
});
