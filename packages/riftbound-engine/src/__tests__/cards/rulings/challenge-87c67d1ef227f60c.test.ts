/**
 * Ruling 87c67d1ef227f60c — Challenge (OGN-128 → ogn-128-298) × Carnivorous Snapvine (ogn-149-298)
 *   × Void Gate (OGN-296 → ogn-296-298)
 *
 *   Challenge — Spell · Body · 2 · Action
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   Carnivorous Snapvine — Unit · Body · 5 · 6 Might
 *     "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other."
 *   Void Gate — Battlefield: "Spells and abilities deal 1 Bonus Damage to units here."
 *
 * Q: Does damage clear from units after Challenge / Snapvine resolves (before end of combat / turn)?
 * A: No. Those are not combats; damage only clears after a full combat or at end of turn. A unit that took
 *    damage from Challenge carries it into a later showdown and may die from it. Void Gate does not add to
 *    Challenge/Snapvine damage (the UNITS deal it, not the spell/ability).
 * Rules: 317.2 (end-of-turn heal), 461/466 (combat cleanup heals), 437 (dealing damage), 715 (bonus damage source).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const SNAPVINE = "ogn-149-298";
const VOID_GATE = "ogn-296-298";

/** P1's turn. P2's Brute (5) holds bf1. P1: Scrapper (2) and Raider (3) in base, Challenge in hand. */
function challengeBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Scrapper" }, "scrapper")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 87c67d1ef227f60c — Challenge / Snapvine damage is not combat damage and does not clear on resolution", () => {
  test("Challenge: Scrapper (2) and Brute (5) hit each other; after the spell resolves Brute STILL has 2 damage in the open main phase", async () => {
    const game = await challengeBoard().build();
    await game.p1.cast("challenge", { targets: ["scrapper", "brute"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("scrapper")).toBe("trash"); // 5 ≥ 2
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Not a combat: no designations were ever assigned, nothing was healed.
    expect(game.state("brute").combatRole).toBeNull();
    expect(game.state("brute").damage).toBe(2);
  });

  test("that damage is carried into the next showdown: Raider (3) attacks — Brute (5, already on 2) takes 3 more and dies", async () => {
    const game = await challengeBoard().build();
    await game.p1.cast("challenge", { targets: ["scrapper", "brute"] });
    await game.settle();
    expect(game.state("brute").damage).toBe(2);
    await game.p1.move("raider", "bf1");
    // Showdown open — the pre-combat damage is still marked.
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.state("brute").damage).toBe(2);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 2 + 3 = 5 ≥ 5
    expect(game.zoneOf("raider")).toBe("trash"); // took 5
  });

  test("control: without the earlier Challenge damage the same attack does NOT kill Brute (3 < 5) — and combat cleanup heals it", async () => {
    const game = await challengeBoard().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(0); // healed at combat cleanup — THAT is when damage clears
  });

  test("Challenge damage does clear at end of turn (317.2 heal step)", async () => {
    const game = await challengeBoard().build();
    await game.p1.cast("challenge", { targets: ["scrapper", "brute"] });
    await game.settle();
    expect(game.state("brute").damage).toBe(2);
    await game.advanceTurn();
    expect(game.state("brute").damage).toBe(0);
    expect(game.trace().expiration[0]?.healed ?? []).toContain("brute");
  });

  test("Snapvine: its play trigger trades damage with Wall (8) — Snapvine dies, Wall keeps 6 damage after the ability resolves and into a later attack (dies to a 2-Might attacker)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
      .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
      .hand(P1, SNAPVINE, "snap")
      .build();
    await game.p1.play("snap", { to: "base" });
    let s = await game.settle();
    if (s.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("wall");
      s = await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("snap")).toBe("trash"); // took 8 ≥ 6
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(6);
    expect(game.state("wall").combatRole).toBeNull();
    // Later this turn: a 2-Might attacker finishes it (6 + 2 = 8).
    await game.p1.move("poker", "bf1");
    expect(game.state("wall").damage).toBe(6);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("nuance: Void Gate does not add to Challenge damage — the units deal it, not the spell (Brute at Void Gate takes exactly 2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P2, def: VOID_GATE, inert: false, owner: P2 })
      .unit(P1, "base", { might: 2, name: "Scrapper" }, "scrapper")
      .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
      .hand(P1, CHALLENGE, "challenge")
      .build();
    await game.p1.cast("challenge", { targets: ["scrapper", "brute"] });
    await game.settle();
    expect(game.state("brute").damage).toBe(2);
    expect(game.zoneOf("scrapper")).toBe("trash");
  });
});
