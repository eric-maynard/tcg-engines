/**
 * Interaction: a [Ganking] unit whose CONTROL has changed hands (ogn-232-298 Fiora, Victorious
 * is the reported case; any Ganking unit under Possession behaves the same).
 *
 * Question: P1 owns a Ganking unit at bfA but P2 controls it. Who may make its Ganking move?
 *
 * Rules: 127.1 (a player performs actions with objects they CONTROL, not the ones they own),
 * 350.1 (moving a unit is done by its controller), 810.1.b (Ganking adds battlefield→battlefield
 * to that unit's Standard Move).
 *
 * Expected: gankingMove is offered to — and legal for — P2 only; P1 (the owner) may neither
 * see nor execute it. `standardMove` already behaves this way.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GANKER = { cardType: "unit", keywords: ["Ganking"], might: 3, name: "Stolen Ganker" };

function board(active: typeof P1 | typeof P2) {
  return scenario()
    .active(active)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .card("ganker", { controller: P2, def: GANKER, owner: P1, zone: "bfA" });
}

describe("Ganking move follows CONTROL, not ownership (127.1)", () => {
  test("the owner (P1) is not offered — and cannot execute — the ganking move of a unit P2 controls", async () => {
    const game = await board(P1).build();
    const offered = game.p1
      .legal()
      .filter((l) => JSON.stringify(l).toLowerCase().includes("gank"));
    expect(offered).toEqual([]);
    const attempt = await game.p1.try((p) => p.gank("ganker", "bfB"));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("ganker")).toBe("battlefield-bfA");
  });

  test("the controller (P2) may gank it on their own turn", async () => {
    const game = await board(P2).build();
    await game.p2.gank("ganker", "bfB");
    await game.settle();
    expect(game.zoneOf("ganker")).toBe("battlefield-bfB");
  });
});
