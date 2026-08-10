/**
 * Ruling b7702406697328e5 — Kai'Sa, Survivor (OGN-039 → ogn-039-298) · Champion Unit · Fury · 4 · 4 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.) When I conquer, draw 1."
 *   (Fury Rune ogn-007-298 is only listed as the Accelerate power source.)
 *
 * Q: What makes her strong if she's only 4 Might and the opponent can just focus combat damage on her?
 * A: (Strategy answer — the rules facts it relies on:) Accelerate lets her enter READY for [1][fury] and act at once; "When I
 *    conquer, draw 1" gives a card; the defender MAY focus its damage on her, and she must survive and still be on the
 *    battlefield when the conquer happens to draw — if she is the one killed, no draw even though her side conquers.
 * Rules: 805 (Accelerate), 143.4 (units enter exhausted otherwise), 465.2.c (defender assigns its damage among attackers),
 *        467 / 383 (conquer trigger needs her on the battlefield as it conquers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-039-298";

/** P1's turn: Kai'Sa in hand with [5]+[fury] (4 + Accelerate [1][fury]); a ready 4-Might Ally in base. P2 holds bf1 with a 4-Might Guard. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
    .hand(P1, KAISA, "kaisa");
}

/** Play Kai'Sa accelerated, attack bf1 with her + Ally, pass Focus around until the Guard's damage assignment is asked. */
async function attackTogether(game: Game): Promise<Extract<Decision, { kind: "distribute" }>> {
  await game.p1.play("kaisa", { accelerate: true });
  await game.settle();
  await game.p1.move(["kaisa", "ally"], "bf1");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 4 });
  return d as Extract<Decision, { kind: "distribute" }>;
}

describe("Ruling b7702406697328e5 — Kai'Sa, Survivor: Accelerate in ready, draw on conquer — but only if she survives the focus fire", () => {
  test("Accelerate: paying the optional [1][fury] she enters READY (5 energy + 1 fury → 0/0); unpaid she enters exhausted for just [4]", async () => {
    const game = await board().build();
    expect(game.p1.option("play", "kaisa")?.fields.find((f) => f.arg === "payOptional")?.options).toEqual([false, true]);
    await game.p1.play("kaisa", { accelerate: true });
    await game.settle();
    expect(game.state("kaisa")).toMatchObject({ isReady: true, location: "base", might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });

    const plain = await board().build();
    await plain.p1.play("kaisa");
    await plain.settle();
    expect(plain.state("kaisa")).toMatchObject({ isExhausted: true, location: "base" });
    expect(plain.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("entering ready she can attack immediately: alone into an EMPTY enemy battlefield she conquers and 'When I conquer, draw 1' gives P1 a card", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 4, name: "Guard" }, "guard")
      .hand(P1, KAISA, "kaisa")
      .build();
    const deck0 = game.p1.deck().length;
    await game.p1.play("kaisa", { accelerate: true });
    await game.settle();
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });

  test("attacking with Kai'Sa + Ally into the 4-Might Guard: the DEFENDER (P2) is asked how to split its 4 damage between the two attackers — either is lethal at 4", async () => {
    const game = await board().build();
    const d = await attackTogether(game);
    expect(d.buckets.map((b) => [b.card, b.lethal]).sort()).toEqual([
      ["ally", 4],
      ["kaisa", 4],
    ]);
  });

  test("P2 focuses all 4 on Kai'Sa: she dies, the Ally kills the Guard and P1 conquers bf1 — but Kai'Sa is in the trash at that point, so NO draw", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await attackTogether(game);
    await game.p2.distribute({ kaisa: 4 });
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.violations()).toEqual([]);
  });

  test("P2 puts the 4 on the Ally instead: Kai'Sa survives on bf1 as it is conquered → P1 draws 1", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await attackTogether(game);
    await game.p2.distribute({ ally: 4 });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });
});
