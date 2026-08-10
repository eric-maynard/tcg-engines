/**
 * Ruling 71414b6280fa240b — Lilting Lullaby (UNL-190 → unl-190-219) · Reaction · 2+[calm/mind ×2]
 *     "Counter a spell. Its controller can't play spells this turn."
 *   × Time Warp (OGN-122 → ogn-122-298) · Action · [10]+[mind]×4 · "Take a turn after this one. Banish this."
 *
 * Q: Can you Lilting Lullaby a Time Warp, and what happens?
 * A: Yes. Lullaby resolves first (LIFO) and counters Time Warp: it leaves the chain without effect (425.1.a) — no
 *    extra turn, and (not having resolved) it is not banished but trashed; it is not considered "played" (425.1.b).
 *    Lullaby's rider then bars Time Warp's controller from playing spells for the rest of the turn.
 * Rules: 425.1.a–c (counter), 383 (LIFO), 734 (extra turns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIME_WARP = "ogn-122-298";
const LULLABY = "unl-190-219";
/** A cheap Action spell so "P1 can't play spells this turn" is observable. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;
const GRUNT = { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" } as const;

/** P1's turn with [12] + 4 mind (Time Warp + Spark + Grunt); P2 holds Lullaby with exactly 2 + calm + mind. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { mind: 4 } })
    .resources(P2, { energy: 2, power: { calm: 1, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Bystander" }, "bystander")
    .hand(P1, TIME_WARP, "warp")
    .hand(P1, SPARK, "spark")
    .hand(P1, GRUNT, "grunt")
    .hand(P2, LULLABY, "lull");
}

async function warpThenLullaby(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("warp");
  expect(game.p1.energy()).toBe(2);
  expect(game.chain().map((c) => c.cardId)).toEqual(["warp"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "lull")).toBe(true);
  const offered = game.p2.option("cast", "lull")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  expect(offered.flat()).toContain("warp");
  await game.p2.cast("lull", { targets: "warp" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["warp", "lull"]);
  return game;
}

describe("Ruling 71414b6280fa240b — Lilting Lullaby counters Time Warp: no extra turn, and the Warp player is silenced this turn", () => {
  test("control: an unanswered Time Warp resolves — it is banished and P1 takes the next turn too", async () => {
    const game = await board().build();
    await game.p1.cast("warp");
    await game.settle();
    expect(game.zoneOf("warp")).toBe("banishment");
    const { next } = await game.advanceTurn();
    expect(next).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("Lullaby is a legal Reaction to Time Warp and goes on the chain above it", async () => {
    await warpThenLullaby();
  });

  test("LIFO: Lullaby resolves first and counters Time Warp — Warp goes to the TRASH (not banished: it never resolved), no refund, chain empty", async () => {
    const game = await warpThenLullaby();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.zoneOf("warp")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } }); // 425.1.c — costs stay paid
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("no extra turn: after P1 ends this turn it is P2's turn, then P1's (normal alternation)", async () => {
    const game = await warpThenLullaby();
    await game.settle();
    const first = await game.advanceTurn();
    expect(first.next).toBe(P2);
    expect(game.turnPlayer()).toBe(P2);
    const second = await game.advanceTurn();
    expect(second.next).toBe(P1);
  });

  test("Lullaby's rider applies to Time Warp's controller: P1 can't play spells for the rest of this turn (units are fine); next P1 turn spells are legal again", async () => {
    const game = await warpThenLullaby();
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "spark")).toBe(false);
    expect(game.p1.can("play", "grunt")).toBe(true);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p1.can("cast", "spark")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
