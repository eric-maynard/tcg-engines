/**
 * Ruling 8872aa1079ef5f91 — Get Excited! (OGN-008 → ogn-008-298) · Spell · Fury · 2+[fury] · [Action]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (OGN-064 → ogn-064-298) · [Reaction] "Counter a spell."
 *
 * Q: If Get Excited! is countered by Defy, do I still discard a card?
 * A: No. The discard is part of the spell's resolution, not a cost; a countered spell never resolves, so nothing is
 *    discarded (and no damage is dealt). Same with Wind Wall.
 * Rules: 425.1 (countered → does nothing, goes to trash, no refund), 356 (costs vs. resolution instructions), 422.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";

/** P1's turn: Get Excited + a 5-cost Fodder card in hand, exactly 2+[fury]. P2's Target (6) at bf1; P2 holds the counterspell. */
function board(counter: string, p2: { energy: number; power: Record<string, number> }) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, p2)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Target" }, "target")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Fodder" }, "fodder")
    .hand(P2, counter, "counter");
}

async function castAndCounter(game: Game): Promise<void> {
  await game.p1.cast("ge", { targets: "target" });
  // Playing Get Excited! discards nothing — the discard is not a cost.
  expect(game.p1.hand()).toEqual(["fodder"]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "counter")).toBe(true);
  await game.p2.cast("counter", { targets: "ge" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ge", "counter"]);
  await game.settle();
}

function assertNothingHappened(game: Game): void {
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("ge")).toBe("trash");
  expect(game.zoneOf("counter")).toBe("trash");
  expect(game.p1.hand()).toEqual(["fodder"]); // no discard
  expect(game.zoneOf("fodder")).toBe("hand");
  expect(game.state("target").damage).toBe(0); // no damage either
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // no refund (425.1.c)
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.violations()).toEqual([]);
}

describe("Ruling 8872aa1079ef5f91 — a countered Get Excited! discards nothing", () => {
  test("Defy counters Get Excited! (cost 2, one domain): it goes to the trash unresolved — P1 keeps Fodder in hand and Target takes no damage", async () => {
    const game = await board(DEFY, { energy: 1, power: { calm: 1 } }).build();
    await castAndCounter(game);
    assertNothingHappened(game);
  });

  test("Wind Wall likewise: countered → no discard, no damage", async () => {
    const game = await board(WIND_WALL, { energy: 3, power: { calm: 2 } }).build();
    await castAndCounter(game);
    assertNothingHappened(game);
  });

  test("contrast — uncountered, Get Excited! resolves: P1 discards Fodder (cost 5) and Target takes 5", async () => {
    const game = await board(DEFY, { energy: 0, power: {} }).build();
    await game.p1.cast("ge", { targets: "target" });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("fodder");
    }
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("target").damage).toBe(5);
    expect(game.zoneOf("ge")).toBe("trash");
  });
});
