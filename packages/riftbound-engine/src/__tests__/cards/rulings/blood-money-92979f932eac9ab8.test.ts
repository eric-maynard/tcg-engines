/**
 * Ruling 92979f932eac9ab8 — Blood Money (SFD-162 → sfd-162-221)
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) × Retreat (OGN-104 → ogn-104-298) × Fight or Flight (OGN-168)
 *   × Discipline (ogn-058-298, a +Might Reaction) — (The Boss OGN-269 / Hidden Blade OGN-213 named as analogues)
 *
 *   Blood Money — Action [2]: "Kill a unit at a battlefield with 2 [Might] or less. If it was an enemy unit, play a
 *     Gold gear token exhausted. If it was a friendly unit, play two Gold gear tokens exhausted."
 *   Zhonya's Hourglass — Gear: "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   Retreat — Reaction [1]: "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   Fight or Flight — [Hidden][Action] 2: "Move a unit from a battlefield to its base."
 *
 * Q: How does Blood Money work when the target is saved (Zhonya's / recall) or leaves / grows before it resolves?
 * A: The Gold does not require the kill to succeed, only that the target is still LEGAL so its controller can be read.
 *    Zhonya's: unit stays on the board (recalled) → Gold is made. Left the battlefield (Retreat to hand, Fight or
 *    Flight to base) or Might raised above 2 in response → target illegal → no kill payoff, no Gold.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLOOD_MONEY = "sfd-162-221";
const ZHONYAS = "ogn-077-298";
const RETREAT = "ogn-104-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. P2's Mark (2) at P2's bf1. P1 has Blood Money + [2]. P2 gets 3 energy + mind/calm for its answers. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 1, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Mark" }, "mark")
    .unit(P2, "bf1", { might: 5, name: "Anchor" }, "anchor") // keeps bf1 occupied whatever happens to Mark
    .hand(P1, BLOOD_MONEY, "bm");
}

const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((g) => game.state(g).name === "Gold");

/** P1 casts Blood Money at Mark and passes; P2 now holds chain priority. */
async function bloodMoneyThenP2(game: Game): Promise<void> {
  await game.p1.cast("bm", { targets: "mark" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bm", controller: P1, targets: ["mark"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 92979f932eac9ab8 — Blood Money pays Gold only while its target stays legal", () => {
  test("control: unanswered, Mark dies and P1 banks exactly one exhausted Gold", async () => {
    const game = await board().build();
    await bloodMoneyThenP2(game);
    await game.settle();
    expect(game.zoneOf("mark")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(1);
    expect(game.state(goldOf(game, "p1")[0] as string)).toMatchObject({ isExhausted: true, isToken: true });
    expect(goldOf(game, "p2")).toEqual([]);
  });

  test("Zhonya's Hourglass saves Mark (Zhonya's dies instead; Mark healed, exhausted, recalled to base) — Mark stayed on the board, so P1 STILL gets the Gold", async () => {
    const game = await board().gear(P2, ZHONYAS, "zh").build();
    await bloodMoneyThenP2(game);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("mark")).toBe("base");
    expect(game.state("mark")).toMatchObject({ damage: 0, isExhausted: true });
    expect(goldOf(game, "p1")).toHaveLength(1);
    expect(game.zoneOf("bm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Retreat in response returns Mark to hand: Blood Money resolves with an illegal target — nothing killed, NO Gold", async () => {
    const game = await board().hand(P2, RETREAT, "retreat").build();
    await bloodMoneyThenP2(game);
    expect(game.p2.can("cast", "retreat")).toBe(true);
    await game.p2.cast("retreat", { targets: "mark" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mark")).toBe("hand");
    expect(game.zoneOf("bm")).toBe("trash");
    expect(goldOf(game, "p1")).toEqual([]);
    expect(goldOf(game, "p2")).toEqual([]);
    expect(game.p1.energy()).toBe(0); // nothing refunded either
  });

  test("Fight or Flight (P2's, hidden at bf1) in response sends Mark to base: still on the board but no longer 'a unit at a battlefield' → illegal target, Mark lives, NO Gold", async () => {
    const game = await board().facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof").build();
    await bloodMoneyThenP2(game);
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["mark"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.acting().pick("mark");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["bm", "fof"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mark")).toBe("base");
    expect(game.state("mark").damage).toBe(0);
    expect(goldOf(game, "p1")).toEqual([]);
    expect(game.zoneOf("bm")).toBe("trash");
  });

  test("Discipline in response (+2 → Mark is 4 Might): the '2 or less' target is now illegal — Mark survives at bf1 and NO Gold is made", async () => {
    const game = await board().hand(P2, DISCIPLINE, "disc").build();
    await bloodMoneyThenP2(game);
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "mark" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("mark").might).toBe(4);
    expect(game.zoneOf("mark")).toBe("battlefield-bf1");
    expect(goldOf(game, "p1")).toEqual([]);
    expect(game.zoneOf("bm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
