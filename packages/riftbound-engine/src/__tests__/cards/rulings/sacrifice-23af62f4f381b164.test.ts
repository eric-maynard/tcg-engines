/**
 * Ruling 23af62f4f381b164 — Sacrifice (UNL-173 → unl-173-219) · Reaction [1] "As an additional cost to play this, kill a
 *     friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Tactical Retreat (UNL-175 → unl-175-219) · Reaction [2] "Choose a friendly unit. The next time it would die this
 *     turn, heal it, exhaust it, and recall it instead."   (Retreat ogn-104 / Baited Hook ogn-242 are cited only as contrast.)
 *
 * Q: I control a single Mighty unit that has Tactical Retreat's shield; I Sacrifice it — what happens?
 * A: You choose it for the kill cost; the replacement intercedes (heal, exhaust, recall instead of dying). A cost that
 *    was replaced still counts as paid (357.2.a), so Sacrifice is played and resolves: draw 2, channel 1 rune exhausted.
 *    The unit survives in base. (Contrast Baited Hook, where the kill is an effect instruction, not a cost.)
 * Rules: 357.2.a (replaced costs are paid), 366 ff. (replacement effects), 355.10.c (cost ≠ target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const TACTICAL_RETREAT = "unl-175-219";

/**
 * P1's turn with [3] (Tactical Retreat 2 + Sacrifice 1). P1's ONLY unit: a damaged 6-Might "Big" at its bf1. Known deck top.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Big" }, "big", { damage: 2 })
    .hand(P1, TACTICAL_RETREAT, "retreat")
    .hand(P1, SACRIFICE, "sac")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function shielded(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("retreat", { targets: "big" });
  await game.settle();
  expect(game.zoneOf("retreat")).toBe("trash");
  expect(game.zoneOf("big")).toBe("battlefield-bf1");
  expect(game.p1.units()).toEqual(["big"]); // the single Mighty unit
  return game;
}

describe("Ruling 23af62f4f381b164 — Sacrificing a Tactical-Retreat-shielded unit: cost counts as paid, unit survives, spell resolves", () => {
  test("Big (6 Might, Mighty) is the one legal payment for Sacrifice's additional cost", async () => {
    const game = await shielded();
    expect(game.p1.can("cast", "sac")).toBe(true);
    const field = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice");
    expect(field?.options).toEqual(["big"]);
  });

  test("paying the cost: the kill is REPLACED — Big is healed (2 → 0 damage), exhausted and recalled to base instead of going to the trash — and Sacrifice is nonetheless on the chain with its energy paid", async () => {
    const game = await shielded();
    await game.p1.cast("sac", { sacrifice: "big" });
    expect(game.zoneOf("big")).toBe("base");
    expect(game.state("big")).toMatchObject({ damage: 0, isExhausted: true, might: 6 });
    expect(game.p1.trash()).not.toContain("big");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sac", controller: P1, triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
  });

  test("resolution: P1 draws 2 and channels 1 rune exhausted; Big is still alive in base afterwards", async () => {
    const game = await shielded();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("sac", { sacrifice: "big" });
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.zoneOf("big")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without the shield the same cast really kills Big (to trash) and still draws 2 / channels 1", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("sac", { sacrifice: "big" });
    expect(game.zoneOf("big")).toBe("trash");
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2", "retreat"]);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
  });
});
