/**
 * Ruling 4210918b64dc7dcd — Find Your Center (OGN-047 → ogn-047-298) · Spell · Calm · [3] · [Action]
 *   "If an opponent's score is within 3 points of the Victory Score, this costs [2] less.
 *    Draw 1 and channel 1 rune exhausted."
 *
 * Q: Player A is about to conquer; can Player B play Find Your Center afterwards, holding 1 rune?
 * A: No, on both counts. The window to play an Action is inside the showdown, while Focus passes; conquering
 *    happens once the showdown has ended, and by then B has no window at all — it is A's Main Phase.
 *    And with A on 4 of a Victory Score of 8 the discount does not apply, so the spell still costs [3] and B's
 *    single rune cannot pay for it.
 * Rules: 347 ([Action] timing — your turn or a showdown), 348.2.a/469.1 (a conquer resolves as the showdown
 *        closes), 356.3 (conditional self-discount), 357.3 (an unaffordable play is not offered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIND_YOUR_CENTER = "ogn-047-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/**
 * Victory Score 8. P1 is on `p1Points` and attacks P2's bf1 with a 5-Might unit that will win. P2 holds
 * Find Your Center and exactly `p2Energy` Energy, and gets the Focus after P1 passes.
 */
async function showdownAtBf1(p1Points: number, p2Energy: number): Promise<Game> {
  const game = await scenario()
    .victoryScore(8)
    .points(P1, p1Points)
    .resources(P2, { energy: p2Energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(2, "Defender"), "def")
    .unit(P1, "base", unit(5, "Attacker"), "atk")
    .hand(P2, FIND_YOUR_CENTER, "fyc")
    .build();
  await game.p1.move("atk", "bf1");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  return game;
}

describe("Ruling 4210918b64dc7dcd — Find Your Center needs a Focus window AND [3] unless the discount applies", () => {
  test("P1 on 4 of 8: no discount, so P2's single rune cannot pay for it even with the window open", async () => {
    const game = await showdownAtBf1(4, 1);

    expect(game.p2.can("cast", "fyc")).toBe(false);
    const attempt = await game.p2.try((p) => p.cast("fyc"));
    expect(attempt.ok).toBe(false);
  });

  test("same window with 3 Energy: it is perfectly castable — the block was the cost, not the timing", async () => {
    const game = await showdownAtBf1(4, 3);

    expect(game.p2.can("cast", "fyc")).toBe(true);
    await game.p2.cast("fyc");
    await game.settle();

    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p2.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("P1 on 5 of 8 (within 3): the [2] discount brings it to [1] and the single rune is enough", async () => {
    const game = await showdownAtBf1(5, 1);

    expect(game.p2.can("cast", "fyc")).toBe(true);
    await game.p2.cast("fyc");
    await game.settle();
    expect(game.p2.energy()).toBe(0);
  });

  test("once the conquer has happened it is too late: P2 has no legal action at all", async () => {
    const game = await showdownAtBf1(4, 3);
    expect(game.p2.can("cast", "fyc")).toBe(true); // the window existed a moment ago

    await game.p2.passFocus();
    await game.settle();

    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(5); // P1 conquered and scored
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "fyc")).toBe(false);
  });
});
