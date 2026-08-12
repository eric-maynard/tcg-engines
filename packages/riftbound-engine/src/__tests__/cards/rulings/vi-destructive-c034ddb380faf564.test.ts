/**
 * Ruling c034ddb380faf564 — Vi, Destructive (OGN-036 → ogn-036-298) · Unit · [2][fury] · 3 Might
 *   "[Ganking] · Recycle 1 from your trash: Give me +1 [Might] this turn."
 *
 * Q: Can Vi's ability be used as often as I want?
 * A: Yes — nothing on the card limits the activations, so the only limit is how many cards you can recycle
 *    out of your trash. Each activation is a separate ability that resolves on its own, with the opponent
 *    getting priority in between; and it is an ordinary activated ability, so only on your turn in an Open
 *    State (never at action/reaction speed or in a showdown).
 * Rules: 416.3 (activated abilities, no inherent frequency limit), 381 (Open State, turn player),
 *        340 (priority passes between resolutions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VI = "ogn-036-298";

/** Vi in P1's base with `n` recyclable cards in the trash. */
function viWithTrash(n: number) {
  let s = scenario().unit(P1, "base", VI, "vi");
  for (let i = 0; i < n; i++) {
    s = s.trash(P1, { cardType: "spell", energyCost: 1, name: `Scrap ${i + 1}` }, `scrap${i + 1}`);
  }
  return s;
}

describe("Ruling c034ddb380faf564 — Vi's ability is unlimited, bounded only by the trash", () => {
  test("three activations off three trash cards take Vi from 3 to 6 [Might], one card at a time", async () => {
    const game = await viWithTrash(3).build();
    expect(game.p1.trash()).toHaveLength(3);
    for (let i = 1; i <= 3; i++) {
      await game.p1.activate("vi", 1, { answers: [`scrap${i}`] }); // #0 is the printed Ganking keyword
      await game.settle();
      expect(game.state("vi").might).toBe(3 + i);
      expect(game.p1.trash()).toHaveLength(3 - i);
    }
    expect(game.state("vi").mightModifier).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("with the trash empty the cost cannot be paid, so the ability is no longer offered", async () => {
    const game = await viWithTrash(1).build();
    await game.p1.activate("vi", 1);
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.can("activate", "vi")).toBe(false);
    const attempt = await game.p1.try((p) => p.activate("vi", 1));
    expect(attempt.ok).toBe(false);
  });

  test("each activation resolves individually and the opponent gets priority in between", async () => {
    const game = await viWithTrash(2).build();
    await game.p1.activate("vi", 1, { answers: ["scrap1"] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "vi", controller: P1, triggered: false, type: "ability" }),
    ]);
    expect(game.state("vi").might).toBe(3); // not yet
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // the opponent may respond between activations
    await game.p2.passPriority();
    expect(game.state("vi").might).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  test("the +1s are 'this turn' only — Vi is back to 3 [Might] next turn", async () => {
    const game = await viWithTrash(2).build();
    await game.p1.activate("vi", 1, { answers: ["scrap1"] });
    await game.settle();
    await game.p1.activate("vi", 1, { answers: ["scrap2"] });
    await game.settle();
    expect(game.state("vi").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("vi").might).toBe(3);
  });

  test("it is not an [Action]: on the opponent's turn, with a showdown running, Vi cannot be pumped", async () => {
    const game = await viWithTrash(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Warden" }, "warden")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.p1.can("activate", "vi")).toBe(false); // opponent's turn, open state
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "vi")).toBe(false); // …and not in the showdown either
    expect(game.p1.trash()).toHaveLength(2);
  });
});
