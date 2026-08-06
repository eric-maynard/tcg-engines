/**
 * Zephyr Sage — ogs-005-024 · Unit · Calm · 6 energy + [calm] · 6 Might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *
 * Rule 814.1.c: Shield is "While I am a defender, I have +X [Might]" (X omitted = 1);
 * 814.1.d.1: it lasts as long as the Defender designation does.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-005-024";

function defending(attackerMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "sage")
    .unit(P2, "base", { might: attackerMight }, "raider");
}

describe("Zephyr Sage (ogs-005-024)", () => {
  test("costs 6 energy + 1 calm; enters the base as a 6-Might unit with Shield", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "sage").build();
    await game.p1.play("sage");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("sage")).toBe("base");
    expect(game.state("sage").might).toBe(6);
    expect(game.state("sage").keywords).toContain("Shield");
  });

  test("not playable without the calm power or with only 5 energy", async () => {
    const noCalm = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "sage").build();
    expect(noCalm.p1.can("play", "sage")).toBe(false);
    const low = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "sage").build();
    expect(low.p1.can("play", "sage")).toBe(false);
  });

  test("Shield: defending against a 6-Might attacker it survives (6 < 7) and kills the attacker", async () => {
    const game = await defending(6).build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("sage").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 7 ≥ 6
    expect(game.zoneOf("sage")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("sage").might).toBe(6); // +1 ends with the Defender designation
  });

  test("Shield: a 7-Might attacker trades with the defending Sage (7 vs 7: both die)", async () => {
    const game = await defending(7).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sage")).toBe("trash");
  });

  test("Shield does nothing while attacking: Sage (6) into a 6-Might defender — both die", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6 }, "guard")
      .unit(P1, "base", CARD, "sage")
      .build();
    await game.p1.move("sage", "bf1");
    expect(game.state("sage").combatRole).toBe("attacker");
    expect(game.state("sage").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("sage")).toBe("trash");
  });
});
