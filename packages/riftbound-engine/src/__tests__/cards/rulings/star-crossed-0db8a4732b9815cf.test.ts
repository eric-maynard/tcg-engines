/**
 * Ruling 0db8a4732b9815cf — Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · 3+[chaos] · Reaction
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Star-Crossed #1 targets A and B; a second Star-Crossed is played in response targeting B and C. Is the second
 *    one still played/resolved even though B is a target of the first?
 * A: Yes. They are independent spells with independent targets. LIFO: #2 resolves first and returns B and C. Then #1
 *    resolves for its remaining valid target only — A goes to hand; the instruction on B (already gone) is ignored.
 *    Neither spell fizzles.
 * Rules: 336–340 (LIFO), 359.3.e.8 (partial targets), 355.10 (both targets needed only when PLAYED).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

/**
 * P1's turn. P1: A (2) in base and C (3) at bf1. P2: B (4) at bf2. Each player holds a Star-Crossed with exact cost.
 *   #1 (P1): friendly A, enemy B.   #2 (P2, in response): friendly B, enemy C.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "A" }, "a")
    .unit(P2, "bf2", { might: 4, name: "B" }, "b")
    .unit(P1, "bf1", { might: 3, name: "C" }, "c")
    .hand(P1, STAR_CROSSED, "sc1")
    .hand(P2, STAR_CROSSED, "sc2");
}

async function bothStarCrossedOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sc1", { targets: ["a", "b"] });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "sc2")).toBe(true);
  const pairs = game.p2.option("cast", "sc2")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  expect(pairs).toContainEqual(["b", "c"]); // B is still a legal (friendly, for P2) target although sc1 also names it
  await game.p2.cast("sc2", { targets: ["b", "c"] });
  return game;
}

describe("Ruling 0db8a4732b9815cf — two Star-Crossed sharing target B both stay on the chain and resolve", () => {
  test("the second Star-Crossed is legally PLAYED in response and sits on top of the first: chain = [sc1 {A,B}, sc2 {B,C}], both paid", async () => {
    const game = await bothStarCrossedOnChain();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sc1", controller: P1, targets: ["a", "b"] }),
      expect.objectContaining({ cardId: "sc2", controller: P2, targets: ["b", "c"] }),
    ]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("LIFO: sc2 resolves first and returns B (to P2's hand) and C (to P1's hand); sc1 is still on the chain and A is untouched so far", async () => {
    const game = await bothStarCrossedOnChain();
    await game.p2.passPriority();
    await game.p1.passPriority(); // sc2 resolves
    expect(game.zoneOf("sc2")).toBe("trash");
    expect(game.zoneOf("b")).toBe("hand");
    expect(game.p2.hand()).toContain("b");
    expect(game.zoneOf("c")).toBe("hand");
    expect(game.p1.hand()).toContain("c");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc1"]);
    expect(game.zoneOf("a")).toBe("base");
  });

  test("then sc1 resolves for its remaining valid target only: A returns to P1's hand; B (already in hand) is simply skipped — sc1 did not fizzle", async () => {
    const game = await bothStarCrossedOnChain();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc1")).toBe("trash");
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["a", "c"]));
    expect(game.zoneOf("b")).toBe("hand");
    expect(game.p2.hand()).toContain("b");
    expect(game.violations()).toEqual([]);
  });
});
