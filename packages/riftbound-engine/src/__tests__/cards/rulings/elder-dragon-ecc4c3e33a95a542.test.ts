/**
 * Ruling ecc4c3e33a95a542 — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each location.
 *      Deal 1 to them."
 *   × Flash (OGS-011 → ogs-011-024) · [Reaction] · 2 · "Move up to 2 friendly units to base."
 *
 * Q: Opponent's Elder Dragon targets my two units at the two battlefields plus one in my base. I Flash the two battlefield
 *    units to base in response — are they dealt damage?
 * A: No. Each pick carries its own "at THAT location" restriction; a unit that has moved elsewhere by resolution no longer
 *    satisfies it and is unaffected. (The unit chosen in base is still there and is hit.)
 * Rules: 355.12–355.15 / 359.3.e.5 (each target re-checked against its own restriction on resolution; illegal → skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const FLASH = "ogs-011-024";

/** P2's turn with exactly 12 + 4 body. P1: A (3) at bf1, B (3) at bf2, C (3) in base; Flash + [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 4 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Alpha" }, "a")
    .unit(P1, "bf2", { might: 3, name: "Bravo" }, "b")
    .unit(P1, "base", { might: 3, name: "Charlie" }, "c")
    .hand(P2, ELDER_DRAGON, "dragon")
    .hand(P1, FLASH, "flash");
}

/** P2 plays the Dragon choosing A (bf1), B (bf2) and C (base); P2 passes → P1 to respond. */
async function dragonTargetsAllThree(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("dragon");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", max: 3, seat: P2, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["a", "b", "c"]);
  await game.p2.pick("c", "a", "b");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", targets: ["c", "a", "b"], triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling ecc4c3e33a95a542 — units Flashed away from where Elder Dragon chose them are not dealt its damage", () => {
  test("P1 Flashes A and B to base in response: chain is [Dragon trigger, Flash]; Flash resolves first and both are in base before the trigger resolves", async () => {
    const game = await dragonTargetsAllThree();
    expect(game.p1.can("cast", "flash")).toBe(true);
    await game.p1.cast("flash", { targets: ["a", "b"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "flash"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", triggered: true })]);
  });

  test("ruling: the trigger then resolves — A and B (no longer 'at bf1'/'at bf2') take NO damage and live; C, still in the base where it was chosen, takes 1 and dies to the Dragon's passive", async () => {
    const game = await dragonTargetsAllThree();
    await game.p1.cast("flash", { targets: ["a", "b"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "base" });
    const log = game.gameState.damageLog ?? [];
    expect(log.filter((r) => r.target === "a" || r.target === "b")).toEqual([]);
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Flash all three chosen units are dealt 1 where they stand and die", async () => {
    const game = await dragonTargetsAllThree();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
  });
});
