/**
 * Ruling 0cae43a5b88faf8d — Defy (OGN-045 → ogn-045-298) · Reaction spell · Calm · [1][calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Desert's Call (sfd-031-221) · Spell · [2] · "[Repeat] [2] … Play a 2 [Might] Sand Soldier unit token."
 *
 * Q: If you counter a spell whose Repeat was paid, does it still get to happen once, or is it all trashed?
 * A: All of it. A Repeat spell is finalized as ONE chain item (Repeat is an additional cost paid up front); a counter negates
 *    that whole item — neither the original nor the repeated execution occurs; the card goes to the trash. You also can't
 *    wait to see a reaction before deciding to Repeat.
 * Rules: 820.1.d (Repeat = additional cost, same chain item), 425.1.a (countered ⇒ does nothing, cleared), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DESERTS_CALL = "sfd-031-221";

/** P1's turn with exactly [4] (2 + Repeat 2). P2: Defy + [1][calm]. Nobody has units. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, DESERTS_CALL, "call")
    .hand(P2, DEFY, "defy");
}

async function castWithRepeat(game: Game): Promise<void> {
  await game.p1.cast("call", { repeat: 1 });
  expect(game.p1.energy()).toBe(0); // base [2] + Repeat [2], all paid at once
  expect(game.chain()).toHaveLength(1); // ONE chain item
  expect(game.chain()[0]).toMatchObject({ cardId: "call", controller: P1, triggered: false });
}

describe("Ruling 0cae43a5b88faf8d — a countered Repeat spell is countered entirely", () => {
  test("Repeat is decided and paid as the spell is played — one finalized item; only THEN does P2 get to react, and Defy may target it (base cost [2], no power)", async () => {
    const game = await board().build();
    await castWithRepeat(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "call" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["call", "defy"]);
  });

  test("Defy resolves first and counters the single item: NO Sand Soldier at all (not one, not two), Desert's Call in the trash, the Repeat cost stays spent", async () => {
    const game = await board().build();
    await castWithRepeat(game);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "call" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-countered, the same single item executes twice — two 2-Might Sand Soldier tokens", async () => {
    const game = await board().build();
    await castWithRepeat(game);
    await game.settle();
    expect(game.zoneOf("call")).toBe("trash");
    const units = game.p1.units();
    expect(units).toHaveLength(2);
    for (const u of units) {
      expect(game.state(u)).toMatchObject({ isToken: true, might: 2 });
    }
  });
});
