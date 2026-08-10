/**
 * Ruling eadb35290d1bc659 — Smoke Screen (OGN-093 → ogn-093-298) · [Reaction] · [2][mind] "Give a unit -4 [Might] this turn, to a
 *     minimum of 1 [Might]."
 *   × Cleave (OGN-004 → ogn-004-298) · [Action] · [1][fury] "Give a unit [Assault 3] this turn. (+3 [Might] while it's an attacker.)"
 *
 * Q: A 3-Might attacker; Smoke Screen and Cleave are both played — Smoke Screen resolving first, Cleave second. Final Might?
 * A: Effects apply in the order they resolve. Smoke Screen first: 3 - 4 → floor 1. Then Cleave: 1 + 3 = 4. Order matters —
 *    Cleave first then Smoke Screen gives 3 + 3 = 6, 6 - 4 = 2. Nuances: an Action can't be played in response to a
 *    Reaction (only on an empty chain); one chain at a time, but several chains can happen within one showdown.
 * Rules: 433 (Might arithmetic; "to a minimum" evaluated as the effect applies), 340 (LIFO within a chain), 340.2.a / 347
 *        (Focus passes after a chain in a showdown; Actions need an empty chain), 808 Assault.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const CLEAVE = "ogn-004-298";

/** P1's turn. P2 holds bf1 with a 3-Might Defender; P1's 3-Might Attacker in base. P1: Cleave + [1][fury]. P2: Smoke Screen + [2][mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  expect(game.state("atk")).toMatchObject({ combatRole: "attacker", might: 3 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling eadb35290d1bc659 — Smoke Screen before Cleave = 4; Cleave before Smoke Screen = 2", () => {
  test("one chain: P1 Cleaves, P2 responds with Smoke Screen — LIFO resolves Smoke Screen FIRST (3 → 1, the floor turns -4 into -2), then Cleave (Assault 3 → 4 while attacking); combat at 4 kills the 3-Might Defender", async () => {
    const game = await attack();
    await game.p1.cast("cleave", { targets: "atk" });
    await game.p1.passPriority();
    await game.p2.cast("smoke", { targets: "atk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "smoke"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    expect(game.state("atk")).toMatchObject({ might: 1, mightModifier: -2 });
    await game.acting().passPriority();
    await game.acting().passPriority(); // Cleave resolves
    expect(game.state("atk").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("atk").might).toBe(4);
    await game.settle(); // combat: 4 vs 3
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("two chains in one showdown, as literally asked: P2's Smoke Screen chain resolves (→ 1) — Cleave, an Action, is NOT playable in response to it — then Focus passes and P1's Cleave chain resolves (→ 4)", async () => {
    const game = await attack();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("smoke", { targets: "atk" });
    // Reaction window on Smoke Screen: P1 may only pass (Cleave is an Action).
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(false);
    await game.p1.passPriority(); // Smoke Screen resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("atk").might).toBe(1);
    // Chain empty inside the showdown → Focus moves on; P1 now opens a NEW chain with Cleave.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("cleave", { targets: "atk" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("atk").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("nuance, the other order: Cleave's chain resolves first (3 + 3 = 6 while attacking), then P2's Smoke Screen: 6 - 4 = 2", async () => {
    const game = await attack();
    await game.p1.cast("cleave", { targets: "atk" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave resolves
    expect(game.state("atk").might).toBe(6);
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    await game.p2.cast("smoke", { targets: "atk" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    expect(game.state("atk")).toMatchObject({ might: 2, mightModifier: -4 });
  });

  test("…and that 2-Might attacker fights at 2: the 3-Might Defender survives, the Attacker (taking 3) dies, P2 keeps bf1", async () => {
    const game = await attack();
    await game.p1.cast("cleave", { targets: "atk" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    await game.p2.cast("smoke", { targets: "atk" });
    await game.settle(); // resolves Smoke Screen, then combat: 2 vs 3
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("def")).toMatchObject({ zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
