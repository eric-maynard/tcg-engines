/**
 * Ruling 059f59f913e6b071 — Challenge (OGN-128 → ogn-128-298) · Body Action · [2][body]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: Does the damage from Challenge units fighting each other stick around?
 * A: Yes. Challenge is not combat, so nobody heals afterwards; the marked damage persists (even if the unit never fights)
 *    until either a combat happens on ANY battlefield (its Combat Cleanup heals all units) or the turn ends.
 * Rules: 141.2 (damage stays marked), 466.1.a.1 (Combat Cleanup: "Heal all Units"), 317.2 / 143.3.b.1 (end of turn heals),
 *        Challenge is a spell, not a combat (no cleanup of its own).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";

/**
 * P1's turn with [2][body] and Challenge. P1: Brawler (6) and Scout (3) in base. P2: Foe (4) at P2's bf1, Sentry (1) at P2's bf2.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 6, name: "Brawler" }, "brawler")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .hand(P1, CHALLENGE, "challenge");
}

/** Brawler (6) challenges Foe (4): Foe takes 6 and dies, Brawler takes 4 and lives. */
async function challenged(): Promise<Game> {
  const game = await board().build();
  const pairs = game.p1.option("cast", "challenge")?.fields.find((f) => f.name === "targets")?.options ?? [];
  expect(pairs).toContainEqual(["brawler", "foe"]); // [friendly, enemy]
  await game.p1.cast("challenge", { targets: ["brawler", "foe"] });
  await game.settle();
  expect(game.zoneOf("challenge")).toBe("trash");
  expect(game.zoneOf("foe")).toBe("trash");
  return game;
}

describe("Ruling 059f59f913e6b071 — Challenge damage persists: no post-Challenge heal", () => {
  test("after Challenge resolves the surviving Brawler keeps its 4 damage — Challenge is not combat, nothing heals it; back in the open main phase it is still marked", async () => {
    const game = await challenged();
    expect(game.state("brawler")).toMatchObject({ damage: 4, might: 6, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]); // no showdown/combat was involved
  });

  test("it persists through unrelated actions the same turn (a move to an EMPTY battlefield — a non-combat showdown — heals nothing)", async () => {
    const game = await board().battlefield("bf3", { controller: null }).build();
    await game.p1.cast("challenge", { targets: ["brawler", "foe"] });
    await game.settle();
    expect(game.state("brawler").damage).toBe(4);
    await game.p1.move("scout", "bf3");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1); // conquered without combat
    expect(game.state("brawler").damage).toBe(4); // still marked
  });

  test("cleared at END OF TURN: after P1's turn ends the Brawler is undamaged", async () => {
    const game = await challenged();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("brawler")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.trace().expiration[0]?.healed ?? []).toContain("brawler");
  });

  test("cleared by ANY combat's cleanup: Scout attacks Sentry at bf2 (Brawler not involved, sitting in base) — the Combat Cleanup 'heals all units', so Brawler's Challenge damage is gone too", async () => {
    const game = await challenged();
    expect(game.state("brawler").damage).toBe(4);
    await game.p1.move("scout", "bf2");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("scout").damage).toBe(0); // combat survivor healed
    expect(game.state("brawler")).toMatchObject({ damage: 0, zone: "base" }); // and so is everyone else
    expect(game.turnPlayer()).toBe(P1); // same turn — not the end-of-turn heal
    expect(game.violations()).toEqual([]);
  });
});
