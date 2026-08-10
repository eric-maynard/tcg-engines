/**
 * Ruling 4bd8ddac8cfc9335 — Find Your Center (OGN-047 → ogn-047-298) · Spell · Calm · 3 · [Action]
 *   "If an opponent's score is within 3 points of the Victory Score, this costs [2] less. Draw 1 and channel 1 rune exhausted."
 *   × Temporal Portal (SFD-078 → sfd-078-221) · Gear · "[rainbow], [Exhaust]: Give the next spell you play this turn
 *   [Repeat] equal to its cost."   (Sky Splitter ogn-014-298 is only cited as another cost-reduction example.)
 *
 * Q: Repeating Find Your Center via Temporal Portal — does the [2] reduction apply twice?
 * A: No, once. Total = 3 (base) + 3 (Repeat = its cost) − 2 = 4 energy; on resolution the effect runs twice
 *    (draw 1 + channel 1 exhausted, ×2).
 * Rules: 356 (cost determination — passive reductions apply once to the total), 820 / 820.2 (Repeat is an additional
 *        cost; the effect is performed an additional time on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIND_YOUR_CENTER = "ogn-047-298";
const TEMPORAL_PORTAL = "sfd-078-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn; Victory Score 8 and P2 sits at 5 (within 3). P1: Portal ready in base, FYC in hand, `energy` + 1 rainbow (the Portal's cost). */
function board(energy: number, p2Points = 5) {
  return scenario()
    .victoryScore(8)
    .points(P2, p2Points)
    .resources(P1, { energy, power: { rainbow: 1 } })
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .hand(P1, FIND_YOUR_CENTER, "fyc");
}

async function activatePortal(game: Game): Promise<void> {
  await game.p1.activate("portal");
  await game.settle();
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.power("rainbow")).toBe(0);
}

describe("Ruling 4bd8ddac8cfc9335 — Find Your Center's reduction applies once to the Repeat-inclusive total", () => {
  test("premise: with P2 within 3 of the Victory Score, a plain Find Your Center costs 1 (3 − 2)", async () => {
    const game = await board(1).build();
    expect(game.p1.can("cast", "fyc")).toBe(true); // 1 energy is enough
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0);
  });

  test("Portal → FYC with Repeat: exactly 4 energy is paid (3 + 3 − 2), and the effect runs twice — draw 2, channel 2 runes exhausted", async () => {
    const game = await board(4).build();
    await activatePortal(game);
    const fields = game.p1.option("cast", "fyc")?.fields ?? [];
    expect(fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    await game.p1.cast("fyc", { repeat: 1 });
    expect(game.p1.energy()).toBe(0); // 4 − 4: the reduction was NOT applied a second time (that would leave 2)
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.p1.runes()).toHaveLength(runes + 2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2); // both channeled exhausted
    expect(game.violations()).toEqual([]);
  });

  test("with only 2 energy (what a double reduction would cost) the Repeat cannot be paid — only the un-repeated cast (1) is possible", async () => {
    const game = await board(2).build();
    await activatePortal(game);
    const repeat = game.p1.option("cast", "fyc")?.fields.find((f) => f.arg === "repeat");
    expect(repeat?.options ?? []).not.toContain(1);
    const r = await game.p1.try((p) => p.cast("fyc", { repeat: 1 }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fyc")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("contrast — opponent NOT within 3 (P2 at 4): no reduction at all, the repeated cast costs the full 3 + 3 = 6", async () => {
    const game = await board(6, 4).build();
    await activatePortal(game);
    await game.p1.cast("fyc", { repeat: 1 });
    expect(game.p1.energy()).toBe(0);
  });
});
