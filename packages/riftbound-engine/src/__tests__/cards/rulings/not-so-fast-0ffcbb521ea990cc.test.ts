/**
 * Ruling 0ffcbb521ea990cc — Not So Fast (SFD-045 → sfd-045-221) [Reaction] · 2 + [calm]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Star-Crossed (UNL-128 → unl-128-219) [Reaction] · 3 + [chaos] "Return a friendly unit and an enemy
 *     unit to their owners' hands."
 *
 * Q: Can Not So Fast be used on Star-Crossed?
 * A: Yes. Star-Crossed must choose one of YOUR units as its "enemy unit" — a unit friendly to you — so it
 *    is a legal object for your Not So Fast. Both are Reactions, so NSF can answer it in the Closed state.
 *    LIFO: NSF resolves first and counters Star-Crossed, which does nothing and leaves the chain; both
 *    units stay put.
 * Rules: 340.1 (LIFO), 425.1.a (a countered spell does nothing), 331–333 (Reactions in Closed state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const STAR_CROSSED = "unl-128-219";

/** P2's turn. bf1 (P1) holds P1's Guard; P2's Raider in P2's base. P2 exactly affords Star-Crossed; P1 exactly affords Not So Fast. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, STAR_CROSSED, "sc")
    .hand(P1, NOT_SO_FAST, "nsf");
}

/** P2 casts Star-Crossed on (Raider = its friendly, Guard = its enemy) and passes priority to P1. */
async function starCrossed(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("sc", { targets: ["raider", "guard"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P2 })]);
  expect(game.chain()[0]!.targets).toEqual(expect.arrayContaining(["raider", "guard"]));
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 0ffcbb521ea990cc — Not So Fast counters an opponent's Star-Crossed", () => {
  test("Star-Crossed chose P1's Guard (friendly to P1) → P1's Not So Fast is legal against it, offered exactly that spell, and stacks on top for 2 + [calm]", async () => {
    const game = await starCrossed();
    expect(game.p1.can("cast", "nsf")).toBe(true);
    expect(game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options).toEqual([["sc"]]);
    await game.p1.cast("nsf", { targets: "sc" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "nsf"]);
  });

  test("LIFO: Not So Fast resolves first and counters Star-Crossed — it does nothing and leaves the chain; Guard and Raider both stay on the board; both spells to their owners' trash", async () => {
    const game = await starCrossed();
    await game.p1.cast("nsf", { targets: "sc" });
    // Resolve NSF only, then look at the chain.
    while (game.chain().length > 1 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("nsf")).toBe("trash");
    const rest = game.chain();
    if (rest.length === 1) {
      expect(rest[0]).toMatchObject({ cardId: "sc", countered: true });
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.p2.trash()).toContain("sc");
    expect(game.p1.trash()).toContain("nsf");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.p1.hand()).not.toContain("guard");
    expect(game.p2.hand()).not.toContain("raider");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, Star-Crossed returns both units to their owners' hands", async () => {
    const game = await starCrossed();
    await game.settle();
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.p1.hand()).toContain("guard");
    expect(game.p2.hand()).toContain("raider");
  });
});
