/**
 * Ruling 015d02561ba7debc — "Ahri Legend" = Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend · Calm/Mind
 *     "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Does the ability trigger when several enemy units attack together, and does it affect all of them?
 * A: Yes — it triggers once PER attacking unit (each is individually declared an attacker); each trigger resolves on its own
 *    unit and gives it -1. Three attackers ⇒ three triggers. (No "attacks alone" requirement, unlike Yi.)
 * Rules: 383.4.e (attack triggers per unit gaining the Attacker designation), 464.2.c.3, 383.3.d (same-controller ordering).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";

/** P1's turn. P2 (Fox legend) holds bf1 with a stunned Guard (4). P1 has three ready attackers in base: A (3), B (2), C (5). */
function board() {
  return scenario()
    .legend(P2, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", { might: 3, name: "Attacker A" }, "a")
    .unit(P1, "base", { might: 2, name: "Attacker B" }, "b")
    .unit(P1, "base", { might: 5, name: "Attacker C" }, "c");
}

/** Resolve the initial chain (Fox triggers) by passing priority; stop in the open showdown before combat damage. */
async function drainInitialChain(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
}

describe("Ruling 015d02561ba7debc — Nine-Tailed Fox triggers once per attacking unit and shrinks each of them", () => {
  test("three units attack together → THREE separate Fox triggers on the initial chain, all controlled by P2", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b", "c"], "bf1");
    expect(["a", "b", "c"].map((u) => game.state(u).combatRole)).toEqual(["attacker", "attacker", "attacker"]);
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P2, timing: "FIN" });
      expect(d.items).toHaveLength(3);
      await game.acceptTriggerOrder();
    }
    const foxItems = game.chain().filter((c) => c.cardId === "fox" && c.triggered);
    expect(foxItems).toHaveLength(3);
    expect(foxItems.every((c) => c.controller === P2)).toBe(true);
    // Nothing applied yet — they are chain items.
    expect(["a", "b", "c"].map((u) => game.state(u).might)).toEqual([3, 2, 5]);
  });

  test("each trigger resolves individually on ITS attacker: A 3→2, B 2→1, C 5→4 (every attacker is affected, not just one)", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b", "c"], "bf1");
    await drainInitialChain(game);
    expect(game.state("a")).toMatchObject({ might: 2, mightModifier: -1 });
    expect(game.state("b")).toMatchObject({ might: 1, mightModifier: -1 });
    expect(game.state("c")).toMatchObject({ might: 4, mightModifier: -1 });
    expect(game.state("guard").might).toBe(4); // the defender is untouched
  });

  test("control — a single attacker gives exactly one trigger", async () => {
    const game = await board().build();
    await game.p1.move("c", "bf1");
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.chain().filter((x) => x.cardId === "fox" && x.triggered)).toHaveLength(1);
    await drainInitialChain(game);
    expect(game.state("c").might).toBe(4);
    expect(game.state("a").might).toBe(3);
  });

  test("the combat then uses the reduced Mights: 2 + 1 + 4 = 7 into the stunned Guard (4) — Guard dies, P1 conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b", "c"], "bf1");
    await drainInitialChain(game);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
