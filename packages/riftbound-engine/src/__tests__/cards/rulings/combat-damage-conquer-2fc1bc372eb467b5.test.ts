/**
 * Ruling 2fc1bc372eb467b5 — (no specific card) two invasions of a 2+2+1 battlefield
 *
 * Q: I hold a battlefield with two 2-Might units and a 1-Might unit (5 Might total).
 *    A: the opponent moves in ONE 6-Might unit — do I lose everything and does he conquer?
 *    B: he moves in a 3-Might and a 2-Might unit — same question.
 * A: A — his 6 covers lethal on all three (2/2/1); my 5 is not lethal on a 6-Might unit, so his unit
 *      remains alone and Conquers. B — his 5 kills all three of mine, my 5 kills both of his: "No Result",
 *      the battlefield becomes Uncontrolled and he does NOT conquer.
 * Rules: 465.2.a–c (sum each side's Might, attacker assigns first, damage is dealt simultaneously),
 *        465.2.c.3/.4 (lethal in full per unit; excess only on the last one), 466.3.a/.d (result / No
 *        Result), 466.5/466.5.b/466.5.d (Establish Control ⇒ Conquer; nobody left ⇒ Uncontrolled).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn. P2 holds bf1 with 2 + 2 + 1 Might. `attackers` are P1's invading units. */
function board(attackers: readonly { alias: string; might: number }[]) {
  let s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Twin A" }, "twinA")
    .unit(P2, "bf1", { might: 2, name: "Twin B" }, "twinB")
    .unit(P2, "bf1", { might: 1, name: "Runt" }, "runt");
  for (const a of attackers) {
    s = s.unit(P1, "base", { might: a.might, name: a.alias }, a.alias);
  }
  return s;
}

/** Drain the combat, answering any damage-assignment prompt with `plan` (only the entries it asks for). */
async function fight(game: Game, plan: Record<string, number>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "distribute") {
      const keys = d.buckets.map((b) => b.card ?? b.key);
      await game.seat(d.seat).distribute(Object.fromEntries(keys.map((k) => [k, plan[k] ?? 0])));
      continue;
    }
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      return;
    }
  }
}

describe("Ruling 2fc1bc372eb467b5 — 5 Might of defenders vs one 6-Might invader (A) and vs 3+2 (B)", () => {
  test("Scenario A: the lone 6-Might invader kills all three defenders, survives their 5 and Conquers", async () => {
    const game = await board([{ alias: "titan", might: 6 }]).build();
    await game.p1.move("titan", "bf1");
    expect(game.state("titan").combatRole).toBe("attacker");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // 6 to spend, lethal needs are 2 / 2 / 1 — the 6th point is the only real choice (465.2.c.4).
    await fight(game, { runt: 2, twinA: 2, twinB: 2 });
    expect(game.zoneOf("twinA")).toBe("trash");
    expect(game.zoneOf("twinB")).toBe("trash");
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.state("titan")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 5 < 6, then healed
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("Scenario B: 3 + 2 trades with 2 + 2 + 1 — everybody dies, 'No Result', the battlefield is Uncontrolled and nobody conquers", async () => {
    const game = await board([
      { alias: "bruiser", might: 3 },
      { alias: "scout", might: 2 },
    ]).build();
    await game.p1.move(["bruiser", "scout"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // Attacker: 5 = 2 + 2 + 1 exactly. Defender: 5 = 3 + 2 exactly. Both assignments are forced.
    await fight(game, { bruiser: 3, runt: 1, scout: 2, twinA: 2, twinB: 2 });
    expect(game.zoneOf("twinA")).toBe("trash");
    expect(game.zoneOf("twinB")).toBe("trash");
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null }); // 466.5.b
    expect(game.p1.points()).toBe(0); // no Conquer for the attacker
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
