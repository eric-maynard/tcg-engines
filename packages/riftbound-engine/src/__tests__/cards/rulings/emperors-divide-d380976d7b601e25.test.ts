/**
 * Ruling d380976d7b601e25 — Emperor's Divide (SFD-043 → sfd-043-221) · Spell · Calm · 2 · Action · [Hidden]
 *   "Move any number of friendly units at a battlefield to their base."
 *
 * Q: Can Emperor's Divide pull units back from several battlefields, or just one?
 * A: Just one — "at A battlefield" is singular: pick one battlefield and move any number of your units from THAT
 *    location to base. Moved units keep their Ready/Exhausted state on arrival.
 * Rules: 355.12–355.14 ("any number of" target sets), 144/456 (moves keep the unit's state; not a recall).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DIVIDE = "sfd-043-221";

/**
 * P1's turn with exactly [2]. P1: A (ready) + B (exhausted) at bf1, C (exhausted) at bf2, D in base. P2: Foe at bf3.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "A" }, "a")
    .unit(P1, "bf1", { might: 3, name: "B" }, "b", { exhausted: true })
    .unit(P1, "bf2", { might: 2, name: "C" }, "c", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "D" }, "d")
    .unit(P2, "bf3", { might: 4, name: "Foe" }, "foe")
    .hand(P1, EMPERORS_DIVIDE, "divide");
}

function targetSets(game: Game): string[] {
  const sets = (game.p1.option("cast", "divide")?.fields.find((f) => f.arg === "targets")?.options ?? []) as (string | string[])[];
  return sets.map((s) => [s].flat().toSorted().join("+")).toSorted();
}

describe("Ruling d380976d7b601e25 — Emperor's Divide names ONE battlefield", () => {
  test("every legal target set is drawn from a single battlefield: {A}, {B}, {A,B} from bf1 or {C} from bf2 — never A/B mixed with C; base unit D and the enemy Foe are never offered", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).toEqual(expect.arrayContaining(["a", "b", "a+b", "c"]));
    expect(sets.some((s) => s.split("+").includes("c") && s !== "c")).toBe(false);
    expect(sets.some((s) => s.split("+").includes("d"))).toBe(false);
    expect(sets.some((s) => s.split("+").includes("foe"))).toBe(false);
  });

  test("naming units from two battlefields (A + C) is rejected outright — nothing paid, nothing on the chain", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.cast("divide", { targets: ["a", "c"] }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("divide")).toBe("hand");
  });

  test("choosing bf1's A and B moves both to base and leaves C at bf2; they keep their state — A arrives ready, B arrives still exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["a", "b"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.locationOf("c")).toBe("bf2");
    expect(game.state("a").isReady).toBe(true);
    expect(game.state("b").isExhausted).toBe(true);
    expect(game.state("c").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("'any number' may also be just one of them: choosing only B leaves A behind at bf1", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["b"] });
    await game.settle();
    expect(game.locationOf("b")).toBe("base");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
