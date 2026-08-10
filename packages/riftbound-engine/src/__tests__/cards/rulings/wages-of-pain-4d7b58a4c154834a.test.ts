/**
 * Ruling 4d7b58a4c154834a — Wages of Pain (SFD-070 → sfd-070-221) · [Hidden] Action · [3]
 *     "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Gold token (sfd-t03) · (Retreat ogn-104-298 is only cited for contrast with the "target removed" FAQ.)
 *
 * Q: I play Wages of Pain, my opponent Defies it — do I still get the Gold gear token?
 * A: No. Defy resolves first and counters Wages of Pain; a countered card does nothing and is not considered played, so
 *    NONE of its instructions run — no damage and no Gold token. (The "independent instruction still executes" logic only
 *    applies when the spell itself resolves, e.g. its target was merely removed.)
 * Rules: 425.1.a–b (countered: no effect, not played), 336–340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const DEFY = "ogn-045-298";

const golds = (game: Game, seat: "p1" | "p2") =>
  game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** P1's turn: Wages in hand with exactly [3]. P2: Victim (5) at P2's bf1, Defy in hand with exactly [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Victim" }, "victim")
    .hand(P1, WAGES_OF_PAIN, "wop")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 4d7b58a4c154834a — a Defied Wages of Pain makes no Gold", () => {
  test("sequence: Wages targets the Victim and closes the state; P2 responds with Defy (Wages' printed [3], no pips, is within Defy's limits) on top of it", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "victim" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wop", controller: P1, targets: ["victim"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const offered = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["wop"]);
    await game.p2.cast("defy", { targets: "wop" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["wop", "defy"]);
  });

  test("resolution: Defy counters Wages — NO damage to the Victim and NO Gold token for anyone; both spells in the trash, nothing refunded", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "victim" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "wop" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("wop")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(golds(game, "p1")).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control (no Defy): Wages resolves — Victim takes 3 and P1 gets exactly one exhausted Gold token", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "victim" });
    await game.settle();
    expect(game.state("victim").damage).toBe(3);
    expect(golds(game, "p1")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0]!)).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
  });
});
