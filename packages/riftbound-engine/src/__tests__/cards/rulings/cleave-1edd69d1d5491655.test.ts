/**
 * Ruling 1edd69d1d5491655 — Cleave (OGN-004 → ogn-004-298) · Spell · Fury · 1 · [Action] "Give a unit [Assault 3] this turn."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Spell · Mind · 2 + [mind] · [Reaction] "Give a unit -4 [Might] this turn, min 1."
 *   (+ Stupefy ogn-095-298 in Player A's hand as a Reaction witness.)
 *
 * Q: In a showdown, Player A attacks and passes; Player B reacts with Smoke Screen. May Player A now play Cleave (an
 *    Action) right away?
 * A: No. While Smoke Screen is on the chain (B has Focus) A may only play Reactions. When both pass, Smoke Screen
 *    resolves and — as the last chain item resolving — Priority and Focus pass to A automatically; with the chain
 *    empty A may now play an Action such as Cleave. The showdown only proceeds to damage once both pass Focus in a row.
 * Rules: 145.2 (Actions need an empty chain / open state), 341–343 (Focus; passing with an empty chain passes Focus),
 *        336.3 (priority passes automatically when a chain item resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const SMOKE_SCREEN = "ogn-093-298";
const STUPEFY = "ogn-095-298";

/** P1 (Player A)'s turn: Bruiser (5) attacks P2's Guard (3) at bf1. A holds Cleave + Stupefy (2 energy); B holds Smoke Screen (2 + [mind]). */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

const labels = (game: Game, seat: "p1" | "p2") => game[seat].legal().map((o) => o.verb);

/** A attacks and passes Focus; B Smoke Screens the Bruiser. */
async function attackPassSmoke(game: Game): Promise<void> {
  await game.p1.move("bruiser", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]);
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("smoke", { targets: "bruiser" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["smoke"]);
}

describe("Ruling 1edd69d1d5491655 — no Action (Cleave) while a Reaction sits on the chain; Focus returns to A after it resolves", () => {
  test("A attacks with an empty chain and Focus: Cleave (Action) IS legal then; passing with an empty chain hands Focus to B, who plays Smoke Screen", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.passFocus();
    expect(game.p2.can("cast", "smoke")).toBe(true);
    expect(game.p1.legal()).toEqual([]); // B has Focus, A has nothing to do yet
    await game.p2.cast("smoke", { targets: "bruiser" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // B keeps priority first
  });

  test("with Smoke Screen on the chain and priority passed to A: A may play a REACTION (Stupefy) but NOT the Action Cleave", async () => {
    const game = await board().build();
    await attackPassSmoke(game);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "stupefy")).toBe(true);
    expect(game.p1.can("cast", "cleave")).toBe(false);
    expect(labels(game, "p1").sort()).toEqual(["cast", "concede", "passPriority"]);
    const r = await game.p1.try((p) => p.cast("cleave", { targets: "bruiser" }));
    expect(r.ok).toBe(false);
  });

  test("both pass → Smoke Screen resolves (Bruiser 5 → 1); Priority AND Focus pass automatically to A with an empty chain, and NOW Cleave is legal", async () => {
    const game = await board().build();
    await attackPassSmoke(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("bruiser").might).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, focusPlayer: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "bruiser" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.p1.energy()).toBe(1);
  });

  test("the showdown only moves to damage after both pass Focus in a row: Cleave resolves (+3 as attacker → 4), then both pass and combat is dealt (1 + Assault 3 = 4 vs 3: Guard dies, Bruiser survives and conquers)", async () => {
    const game = await board().build();
    await attackPassSmoke(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    await game.p1.cast("cleave", { targets: "bruiser" });
    // Resolve Cleave only.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("bruiser").grantedKeywords).toContainEqual({ duration: "turn", keyword: "Assault", value: 3 });
    // Still in the showdown — no damage has been dealt yet.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("guard").damage).toBe(0);
    expect(game.state("bruiser").damage).toBe(0);
    await game.settle(); // both pass Focus in a row → combat damage
    expect(game.zoneOf("guard")).toBe("trash"); // took 4 ≥ 3
    expect(game.locationOf("bruiser")).toBe("bf1"); // 4 Might in combat, took 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
