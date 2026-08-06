/**
 * Flash — ogs-011-024 · Spell · Chaos · 2 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Move up to 2 friendly units to base.
 *
 * Rules: 813 (Reaction: playable during Closed states / showdowns on any player's
 * turn), "up to 2" → zero, one or two targets; only FRIENDLY units. A move caused
 * by an effect is not a Standard Move, so it does not exhaust the unit.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-011-024";
const CLEAVE = "ogn-004-298"; // opponent's 1-energy spell used to open a chain

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Alpha" }, "a")
    .unit(P1, "bf2", { might: 2, name: "Bravo" }, "b")
    .unit(P1, "bf1", { might: 2, name: "Charlie" }, "c")
    .unit(P2, "bf1", { might: 2, name: "Enemy" }, "e")
    .hand(P1, CARD, "flash");
}

describe("Flash (ogs-011-024)", () => {
  test("costs 2 energy; moves two friendly units (from different battlefields) to base without exhausting them; goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("flash", { targets: ["a", "b"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.state("a").isExhausted).toBe(false);
    expect(game.locationOf("c")).toBe("bf1");
    expect(game.locationOf("e")).toBe("bf1");
    expect(game.zoneOf("flash")).toBe("trash");
    const poor = await board().resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "flash")).toBe(false);
  });

  test("'up to 2': a single unit is fine; enemy units are never legal targets", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "flash")?.fields.find((f) => f.arg === "targets");
    expect(targets?.max).toBe(2);
    expect((targets?.options ?? []).flat()).not.toContain("e");
    const bad = await game.p1.try((p) => p.cast("flash", { targets: ["e"] }));
    expect(bad.ok).toBe(false);
    await game.p1.cast("flash", { targets: ["c"] });
    await game.settle();
    expect(game.locationOf("c")).toBe("base");
    expect(game.locationOf("a")).toBe("bf1");
  });

  test("[Reaction]: playable on the opponent's turn in response to their spell; resolves first (LIFO)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "a")
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "flash")
      .build();
    await game.p2.cast("cleave", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "flash")).toBe(true);
    await game.p1.cast("flash", { targets: ["a"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "flash"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("a")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  });

  test.failing("BUG: [Reaction] in a showdown — flashing the lone defender home leaves the attacker alone, so it wins the combat and conquers (rules 466.3.a, 466.5)", async () => {
    // Expected: Flash is castable with Focus mid-showdown (this part works); the defender reaches base
    // undamaged and, with only the attacker remaining, P2 establishes control of bf1 and scores the
    // conquer point. Actual: the engine recalls the attacker to base and bf1 stays with P1.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
      .hand(P1, CARD, "flash")
      .build();
    await game.p2.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "flash")).toBe(true);
    await game.p1.cast("flash", { targets: ["def"] });
    await game.settle();
    expect(game.locationOf("def")).toBe("base");
    expect(game.state("def").damage).toBe(0);
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
