/**
 * Ruling 23c0d65b5a992d9c — Hostile Takeover (SFD-202 → sfd-202-221) · [Hidden] · 5 + [rainbow][rainbow]
 *   "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *    there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *
 * Q: Can I Hostile Takeover a unit of mine that my opponent already Hostile Takeovered?
 * A: Yes. While the opponent controls it, that unit is an "enemy unit" from my seat and therefore a
 *    legal choice; my copy takes control back and readies it. The end-of-turn riders then hand the
 *    unit to its OWNER's base — no restriction stops a second control-changing spell.
 * Rules: 190.6 / 477.1.a ("friendly"/"enemy" read from the chooser's seat; controller ≠ owner),
 *        355.9 (legality judged from the caster's perspective), 317.1 / 455 (end-of-turn riders).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";

/** P2's turn: P2 takes P1's lone Victim at bf1 with a Hostile Takeover of their own. */
function firstTakeoverBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim", { exhausted: true })
    .hand(P2, HOSTILE_TAKEOVER, "theirHT");
}

/**
 * P1's turn, holding the position the opponent's Hostile Takeover left behind: P1's own Victim
 * stands at bf1 under P2's control, and P2 holds bf1 because of it. P1 has a Hostile Takeover
 * (5 + [rainbow][rainbow]) in hand and exactly enough to cast it.
 */
function stolenBoard() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .card("victim", { controller: P2, def: { cardType: "unit", might: 3, name: "Victim" }, owner: P1, zone: "bf1" })
    .hand(P1, HOSTILE_TAKEOVER, "myHT");
}

/** A Hostile Takeover with no other enemy present opens a non-combat showdown; passing Focus closes it into the Conquer. */
async function closeShowdown(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
      continue;
    }
    return;
  }
}

async function stolen(): Promise<Game> {
  const game = await stolenBoard().build();
  expect(game.state("victim")).toMatchObject({ controller: P2, owner: P1, zone: "battlefield-bf1" });
  return game;
}

describe("Ruling 23c0d65b5a992d9c — Hostile Takeover can take back a unit of mine the opponent Hostile Takeovered", () => {
  test("premise: Hostile Takeover really does produce controller ≠ owner — P2's copy takes P1's Victim, readies it and conquers bf1", async () => {
    const game = await firstTakeoverBoard().build();
    expect(game.state("victim")).toMatchObject({ controller: P1, isExhausted: true, owner: P1 });
    await game.p2.cast("theirHT", { targets: "victim" });
    await closeShowdown(game);
    expect(game.state("victim")).toMatchObject({ controller: P2, isReady: true, owner: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("premise (rider): at end of that turn the rider hands the unit to its OWNER's base, not the thief's", async () => {
    const game = await firstTakeoverBoard().build();
    await game.p2.cast("theirHT", { targets: "victim" });
    await closeShowdown(game);
    await game.advanceTurn();
    expect(game.state("victim")).toMatchObject({ controller: P1, owner: P1, zone: "base" });
    expect(game.p1.base()).toContain("victim");
  });

  test("ruling: from P1's seat the stolen unit is an ENEMY unit, so P1's own Hostile Takeover may choose it", async () => {
    const game = await stolen();
    expect(game.p1.can("cast", "myHT")).toBe(true);
    const targets = (game.p1.option("cast", "myHT")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["victim"]);
  });

  test("…and it resolves: P1 takes control back, the unit is READY again, and bf1 comes with it", async () => {
    const game = await stolen();
    await game.p1.cast("myHT", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await closeShowdown(game);
    expect(game.state("victim")).toMatchObject({ controller: P1, isReady: true, owner: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("myHT")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the rider still fires at end of turn — the unit is under P1's control and P1 owns it, so it lands in P1's base", async () => {
    const game = await stolen();
    await game.p1.cast("myHT", { targets: "victim" });
    await closeShowdown(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("victim")).toMatchObject({ controller: P1, owner: P1, zone: "base" });
    expect(game.p2.base()).not.toContain("victim");
    expect(game.violations()).toEqual([]);
  });

  test("negative space: a unit P1 already controls is not an 'enemy unit' — Hostile Takeover cannot be aimed at it", async () => {
    const game = await stolenBoard()
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Ally" }, "ally")
      .build();
    const targets = (game.p1.option("cast", "myHT")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["victim"]);
    expect(targets).not.toContain("ally");
  });
});
