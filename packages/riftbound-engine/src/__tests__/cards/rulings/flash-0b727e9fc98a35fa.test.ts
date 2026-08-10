/**
 * Ruling 0b727e9fc98a35fa — Flash (OGS-011 → ogs-011-024) × Wind Wall (OGN-064 → ogn-064-298) × Mystic Reversal (OGN-080 → ogn-080-298)
 *   Flash: 2-cost [Reaction] "Move up to 2 friendly units to base."
 *   Wind Wall: 3 + [calm][calm] [Reaction] "Counter a spell."
 *   Mystic Reversal: 4 + [calm]×3 [Reaction] "Gain control of a spell. You may make new choices for it."
 *
 * Q: My Flash gets Wind Walled. Can Mystic Reversal on my own Flash make it resolve first, or on Wind Wall
 *    redirect the counter?
 * A: No to both. Mystic Reversal changes control (and lets you re-choose), it never reorders the chain; and a
 *    stolen Wind Wall has no other legal spell to be pointed at (it cannot counter Mystic Reversal). Either
 *    way the only end result is: Flash is countered.
 * Rules: 340.1 (LIFO resolution), 425.1 (counter), 355.8 / 355.9 (new choices must still be legal targets).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const WIND_WALL = "ogn-064-298";
const MYSTIC_REVERSAL = "ogn-080-298";

/** P1's turn. P1's Runner at bf1; P1 holds Flash + Mystic Reversal (exact 6 energy, 3 calm); P2 holds Wind Wall (exact). */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 3 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Runner" }, "runner")
    .hand(P1, FLASH, "flash")
    .hand(P1, MYSTIC_REVERSAL, "mr")
    .hand(P2, WIND_WALL, "ww");
}

const chainView = (game: Game) => game.chain().map((c) => ({ cardId: c.cardId, controller: c.controller, targets: c.targets }));

/** Flash (Runner → base); P2 answers with Wind Wall → Flash; priority back to P1 holding Mystic Reversal. */
async function flashWindWalled(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("flash", { targets: "runner" });
  expect(game.p1.energy()).toBe(4);
  await game.p1.passPriority();
  await game.p2.cast("ww", { targets: "flash" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(chainView(game)).toEqual([
    { cardId: "flash", controller: P1, targets: ["runner"] },
    { cardId: "ww", controller: P2, targets: ["flash"] },
  ]);
  return game;
}

/** Drive any post-resolution "new choices" prompts for P1 (accept / take the first legal option), then settle. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      const opts = d.options.map((o) => String(o.card ?? o.key));
      // A stolen Wind Wall must never be offered Mystic Reversal (or itself) as a new target.
      expect(opts).not.toContain("mr");
      expect(opts).not.toContain("ww");
      await game.seat(d.seat).pick(opts[0] as string);
    } else {
      break;
    }
  }
  await game.settle();
}

describe("Ruling 0b727e9fc98a35fa — Mystic Reversal cannot rescue a Wind Walled Flash (no reordering, no redirect)", () => {
  test("control: without Mystic Reversal, Wind Wall resolves first (LIFO) and counters Flash — the Runner never moves", async () => {
    const game = await flashWindWalled();
    await game.settle();
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
  });

  test("Mystic Reversal offers both chain spells (my Flash, their Wind Wall) as 'a spell'", async () => {
    const game = await flashWindWalled();
    const offered = (game.p1.option("cast", "mr")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual(["flash", "ww"]);
  });

  test("(a) Mystic Reversal on my OWN Flash: it resolves first and merely (re)gives me control of Flash — the chain order is unchanged, so Wind Wall still resolves next and counters Flash; Runner stays", async () => {
    const game = await flashWindWalled();
    await game.p1.cast("mr", { targets: "flash" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(chainView(game).map((c) => c.cardId)).toEqual(["flash", "ww", "mr"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mystic Reversal resolves
    // Chain order below it is untouched: Flash still sits UNDER Wind Wall.
    expect(chainView(game).map((c) => c.cardId)).toEqual(["flash", "ww"]);
    expect(game.chain().find((c) => c.cardId === "flash")?.controller).toBe(P1);
    expect(game.chain().find((c) => c.cardId === "ww")).toMatchObject({ controller: P2, targets: ["flash"] });
    await finish(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("runner")).toBe("battlefield-bf1"); // Flash countered → no move
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("mr")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b) Mystic Reversal on WIND WALL: I now control Wind Wall, but its only legal target is still my Flash (it can't be turned on Mystic Reversal or itself) — it resolves and counters Flash anyway; Runner stays", async () => {
    const game = await flashWindWalled();
    await game.p1.cast("mr", { targets: "ww" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mystic Reversal resolves
    expect(chainView(game).map((c) => c.cardId)).toEqual(["flash", "ww"]);
    expect(game.chain().find((c) => c.cardId === "ww")).toMatchObject({ controller: P1, targets: ["flash"] });
    await finish(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("runner")).toBe("battlefield-bf1"); // Flash countered → no move
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash"); // to its OWNER's (P2's) trash
    expect(game.p2.trash()).toContain("ww");
    expect(game.zoneOf("mr")).toBe("trash");
    // Nothing refunded anywhere.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
