/**
 * Ruling 931f10dd51588d8f — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *     location. Deal 1 to them."
 *   × Not So Fast (SFD-045 → sfd-045-221) · 2+[calm] [Reaction] "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: Does Not So Fast counter the ENTIRE damage of Elder Dragon's play trigger to all chosen units?
 * A: Yes. The trigger is one chain item however many units it chose; Not So Fast counters the whole item (LIFO: it
 *    resolves first), so none of the damage instructions execute. Elder Dragon itself stays (it never used the chain).
 * Rules: 425.1.a (a countered ability does nothing and leaves the chain), 383 (trigger = single chain item), 336–340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const NOT_SO_FAST = "sfd-045-221";

/** P1's turn with exactly 12 + 4 body. P2 has one 3-Might unit at each of three locations (bf1, bf2, base) and Not So Fast with 2+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "A" }, "a")
    .unit(P2, "bf2", { might: 3, name: "B" }, "b")
    .unit(P2, "base", { might: 3, name: "C" }, "c")
    .hand(P1, ELDER_DRAGON, "elder")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** Play Elder Dragon and choose one enemy unit at each location (C, A, B). Leaves the trigger on the chain with P1's priority. */
async function elderChoosingAll(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("elder");
  expect(game.zoneOf("elder")).toBe("base"); // the unit is on the board; only its trigger uses the chain
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    if (d?.kind === "pick") {
      await game.p1.pick(d.options[0]!.key);
    }
  }
  expect(game.chain()).toHaveLength(1);
  expect(game.chain()[0]).toMatchObject({ cardId: "elder", controller: P1, triggered: true });
  expect([...(game.chain()[0]!.targets ?? [])].sort()).toEqual(["a", "b", "c"]); // ONE item, three chosen units
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // Closed state, respondable
  return game;
}

describe("Ruling 931f10dd51588d8f — Not So Fast counters Elder Dragon's whole play trigger", () => {
  test("control: unanswered, the trigger deals 1 to each chosen unit — and Elder Dragon's passive makes that 1 lethal: A, B and C all die", async () => {
    const game = await elderChoosingAll();
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
  });

  test("P2 answers with Not So Fast targeting the trigger (an enemy ability choosing P2's units): it resolves first and counters the ENTIRE item — no unit takes any damage, all three survive; Elder Dragon stays on the board; Not So Fast's cost is spent", async () => {
    const game = await elderChoosingAll();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(game.p2.option("cast", "nsf")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["elder"]]);
    await game.p2.cast("nsf", { targets: "elder" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["elder", "nsf"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    for (const u of ["a", "b", "c"]) {
      expect(game.state(u)).toMatchObject({ damage: 0 });
      expect(game.zoneOf(u)).not.toBe("trash");
    }
    expect(game.zoneOf("elder")).toBe("base"); // countering the ability does not touch the unit
    expect(game.state("elder").might).toBe(10);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
