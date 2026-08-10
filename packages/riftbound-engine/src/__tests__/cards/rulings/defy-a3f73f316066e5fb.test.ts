/**
 * Ruling a3f73f316066e5fb — Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] · "Counter a spell that costs no more than [4] and no
 *   more than [rainbow]."   × Bellows Breath (SFD-080 → sfd-080-221) · Action [1][mind] · "[Repeat] [1][mind] — Deal 1 to up to three
 *   units at the same location."
 *
 * Q: How does Defy work on a Repeated spell (e.g. Bellows Breath with its Repeat paid)? Does it counter one execution or both?
 * A: The whole spell. Repeat does not create a second spell — it is one chain object that would execute twice; countering it
 *    removes it entirely: no damage from either execution. Defy checks the printed cost ([1][mind]) so the paid Repeat doesn't
 *    put it out of range; the Repeat is paid up front and nothing is refunded.
 * Rules: 820 (Repeat: additional cost, one spell executes twice), 425 (counter → trash, no effect), 412.1.c / 356 (costs not
 *        refunded), Defy compares printed cost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn: exactly [2] + 2 mind (base + Repeat). P2: two 2-Might units at P2's bf1, Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Twin A" }, "a")
    .unit(P2, "bf1", { might: 2, name: "Twin B" }, "b")
    .hand(P1, BELLOWS_BREATH, "breath")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Bellows Breath WITH Repeat on {A, B}. */
async function repeatedBreath(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("breath", { repeat: 1, targets: ["a", "b"] });
  return game;
}

describe("Ruling a3f73f316066e5fb — Defy counters a Repeated Bellows Breath in its entirety", () => {
  test("Repeat is paid while casting: ONE Bellows Breath item is on the chain and P1 has spent [2] + 2 mind (base [1][mind] + Repeat [1][mind])", async () => {
    const game = await repeatedBreath();
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "breath", controller: P1, targets: ["a", "b"], triggered: false, type: "spell" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("control: un-Defied, the repeated Breath deals 1 twice to each Twin — both 2-Might Twins die", async () => {
    const game = await repeatedBreath();
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
  });

  test("Defy may target it despite the paid Repeat (printed cost [1][mind] ≤ [4]/[rainbow]); it counters the single spell: Breath → trash, NO damage from either execution, nothing refunded", async () => {
    const game = await repeatedBreath();
    await game.p1.passPriority();
    const targets = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toContainEqual(["breath"]);
    await game.p2.cast("defy", { targets: "breath" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["breath", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("breath")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect((game.gameState.damageLog ?? []).length).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // Repeat cost lost too
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
