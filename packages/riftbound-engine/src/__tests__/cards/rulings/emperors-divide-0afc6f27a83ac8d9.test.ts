/**
 * Ruling 0afc6f27a83ac8d9 — Emperor's Divide (SFD-043 → sfd-043-221) · Spell · Calm · [2] · [Hidden] [Action]
 *   "Move any number of friendly units at a battlefield to their base."
 *
 * Q: Can I move units from different battlefields with Emperor's Divide?
 * A: No. "at a battlefield" is singular — choose one battlefield and move any number of friendly units from
 *    that location only. Units moved this way keep their current state (Ready / Exhausted) when they arrive.
 * Rules: 355.11.b (singular location template ⇒ one battlefield), 355.13 ("any number"), 446 (a move does not
 *        change ready/exhausted state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DIVIDE = "sfd-043-221";

/** P1's turn, [2]. P1 has A (ready) + B (exhausted) at bf1, C at bf2; P2 holds bf3. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "A" }, "a")
    .unit(P1, "bf1", { might: 3, name: "B" }, "b", { exhausted: true })
    .unit(P1, "bf2", { might: 2, name: "C" }, "c")
    .unit(P2, "bf3", { might: 4, name: "Foe" }, "foe")
    .hand(P1, EMPERORS_DIVIDE, "divide");
}

function targetSets(game: Game): string[] {
  const sets = (game.p1.option("cast", "divide")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
  return sets.map((s) => [...s].toSorted().join("+")).toSorted();
}

describe("Ruling 0afc6f27a83ac8d9 — Emperor's Divide moves units from ONE battlefield only", () => {
  test("the legal target sets never mix bf1 units (A/B) with the bf2 unit (C): every offered set is drawn from a single battlefield", async () => {
    const game = await board().build();
    const sets = targetSets(game);
    expect(sets).toEqual(expect.arrayContaining(["a", "b", "a+b", "c"]));
    expect(sets.some((s) => s.includes("c") && s !== "c")).toBe(false); // C only ever alone
    expect(sets.some((s) => s.includes("foe"))).toBe(false); // enemy never
  });

  test("naming A (bf1) together with C (bf2) is rejected outright — nothing is paid, nothing goes on the chain", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.cast("divide", { targets: ["a", "c"] }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("divide")).toBe("hand");
  });

  test("choosing one battlefield (bf1) moves both A and B home and leaves C at bf2; moved units keep their state — A arrives ready, B arrives still exhausted", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["a", "b"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.locationOf("c")).toBe("bf2");
    expect(game.state("a")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.state("b")).toMatchObject({ isExhausted: true, isReady: false });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
