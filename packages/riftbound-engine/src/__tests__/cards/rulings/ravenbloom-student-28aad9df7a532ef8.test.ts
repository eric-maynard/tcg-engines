/**
 * Ruling 28aad9df7a532ef8 — Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might
 *     "When you play a spell, give me +1 [Might] this turn."
 *   × Wind Wall (ogn-064-298) · Reaction · [3][calm][calm] · "Counter a spell."
 *   × Hextech Ray (ogn-009-298) · Action · [1][fury] · "Deal 3 to a unit at a battlefield."
 *   × Darius, Trifarian (ogn-027-298) · "When you play your second card in a turn, give me +2 [Might] this
 *     turn and ready me." — the Legion witness for "was a card played at all?"
 *
 * Q: Does Ravenbloom Student's ability still trigger if the spell you played gets countered?
 * A: No. A countered card is not considered to have been played, so nothing that triggers on playing a card
 *    sees it: the Student gets no +1, and a Legion counter ("your second card this turn") does not advance.
 * Rules: 425.1.a (a countered card does nothing and is trashed), 425.1.b (it is not considered played for
 *        abilities that trigger on cards being played), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const WIND_WALL = "ogn-064-298";
const HEXTECH_RAY = "ogn-009-298";
const DARIUS = "ogn-027-298";

/**
 * P1's turn. P1's Student and an exhausted Darius sit in base/at bf1; P1 holds Hextech Ray plus a cheap Grunt
 * and has [1][fury] and [1] to spare. P2 waits with Wind Wall and exactly [3][calm][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P2, "bf2", { might: 4, name: "Bystander" }, "bystander")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" }, "grunt")
    .hand(P2, WIND_WALL, "wall");
}

/** P1 casts Hextech Ray at its own Student; P2 counters it with Wind Wall; everything resolves. */
async function rayCountered(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray", { targets: "student" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  await game.p1.passPriority();
  await game.p2.cast("wall", { targets: "ray" });
  await game.settle();
  expect(game.zoneOf("wall")).toBe("trash");
  expect(game.zoneOf("ray")).toBe("trash"); // countered → cleared from the chain
  return game;
}

describe("Ruling 28aad9df7a532ef8 — a countered spell was never played: no Student trigger, no Legion progress", () => {
  test("the countered Hextech Ray does nothing at all: no 3 damage, and the Student's +1 never goes on the chain", async () => {
    const game = await rayCountered();
    expect(game.state("student")).toMatchObject({ damage: 0, might: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("nor does it advance 'cards played this turn': the Grunt afterwards is still P1's FIRST card, so Darius's Legion trigger stays silent", async () => {
    const game = await rayCountered();
    await game.p1.play("grunt");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 }); // no +2, not readied
    expect(game.state("student").might).toBe(2);
  });

  test("control: an UNCOUNTERED Hextech Ray is played — the Student gets its +1 and the next card is genuinely the second, waking Darius", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "bystander" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("bystander").damage).toBe(3);
    expect(game.state("student").might).toBe(3); // 2 + 1
    await game.p1.play("grunt");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });
});
