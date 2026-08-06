/**
 * Stalwart Poro — ogn-052-298 · Unit · Calm · 2 energy · 2 Might · Poro
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *
 * Rule 814.1.c: Shield is "While I am a defender, I have +X [Might]" (X omitted = 1).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-052-298";

describe("Stalwart Poro (ogn-052-298)", () => {
  test("costs 2 energy, enters the base as a 2-Might unit with Shield; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").keywords).toContain("Shield");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("as a defender it fights with 3 Might: a 2-Might attacker dies and the Poro survives and holds", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P2, "base", { might: 2 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    // Designations are assigned when combat opens (Shield is live from here on, rule 814.1.d).
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 3 ≥ 2
    expect(game.zoneOf("poro")).toBe("battlefield-bf1"); // took 2 < 3
    expect(game.state("poro").damage).toBe(0); // damage clears after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("a 3-Might attacker trades with the defending Poro (3 vs 3: both die)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P2, "base", { might: 3 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("Shield does nothing while attacking: Poro (2) into a 2-Might defender — both die", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "guard")
      .unit(P1, "base", CARD, "poro")
      .build();
    await game.p1.move("poro", "bf1");
    expect(game.state("poro").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("the +1 ends with combat: after defending, the Poro is back to 2 Might", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P2, "base", { might: 1 }, "gnat")
      .build();
    await game.p2.move("gnat", "bf1");
    await game.settle();
    expect(game.zoneOf("gnat")).toBe("trash");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").combatRole).toBeNull();
  });
});
