/**
 * Ruling 81ae24ccaa2ea59b — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · [2]
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: How does Mask of Foresight behave in 2v2 — does "friendly" cover my TEAMMATE's units?
 * A: Yes. In a team game a teammate's objects are friendly, so your Mask fires for your teammate's lone
 *    attacker/defender exactly as it does for your own, and stacks per Mask you control.
 * Rules: 489.8.e / 740.1.a (teammates' objects are friendly), 740.2.a ("alone" = no other friendly unit at that
 *        battlefield), 383 (triggered ability).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { peekCurrentState, replaceCurrentState } from "../../../harness/internal";

const MASK_OF_FORESIGHT = "ogn-060-298";

/**
 * 2v2: P1+P3 against P2+P4. P1 owns the Mask. bf1 belongs to the opposing team (P2 defends it).
 * The builder has no team knob, so the team map is seeded onto the built state (setup only).
 */
async function teamBoard(masks: number, extraAlly: boolean, active = P1): Promise<Game> {
  let b = scenario({ players: 4 })
    .turn(2)
    .active(active)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .unit(P3, "base", { might: 3, name: "Ally" }, "ally");
  for (let i = 0; i < masks; i++) {
    b = b.gear(P1, MASK_OF_FORESIGHT, `mask${i}`);
  }
  if (extraAlly) {
    b = b.unit(P1, "base", { might: 3, name: "Buddy" }, "buddy");
  }
  const game = await b.build();
  const st = structuredClone(peekCurrentState(game.engine));
  (st as { teams?: Record<string, number> }).teams = { [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 };
  replaceCurrentState(game.engine, st);
  game.engine.getFlowManager()?.syncState(st);
  expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
  return game;
}

/** Resolve everything on the chain without letting the combat run. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 16 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (await game.acceptTriggerOrder()) {
      continue; // two Masks ⇒ 383.3.d order offer; the scan order is fine
    }
    return;
  }
}

describe("Ruling 81ae24ccaa2ea59b — Mask of Foresight's 'friendly' reaches a teammate's lone attacker in 2v2", () => {
  test("the Mask owner's own lone attacker gets +1", async () => {
    const game = await teamBoard(1, false);
    await game.p1.move("mine", "bf1");
    await drainChain(game);
    expect(game.state("mine")).toMatchObject({ baseMight: 3, might: 4, mightModifier: 1 });
  });

  test("stacking works for the owner: two Masks give the lone attacker +2", async () => {
    const game = await teamBoard(2, false);
    await game.p1.move("mine", "bf1");
    await drainChain(game);
    expect(game.state("mine")).toMatchObject({ might: 5, mightModifier: 2 });
  });

  // Expected +1 from P1's Mask on P3's lone attacker (teammates are friendly, 489.8.e).
  // Actual: the trigger does not fire at all for a teammate's unit — Ally stays a flat 3 (mightModifier 0).
  test.failing("BUG: ruling 81ae24ccaa2ea59b — a TEAMMATE's lone attacker gets nothing; the Mask only sees its own controller's units", async () => {
    const game = await teamBoard(1, false, P3);
    await game.seat(P3).move("ally", "bf1");
    await drainChain(game);
    expect(game.state("ally")).toMatchObject({ baseMight: 3, might: 4, mightModifier: 1 });
  });

  // Same cause: with no trigger for the teammate at all, two Masks are still worth nothing to Ally.
  test.failing("BUG: ruling 81ae24ccaa2ea59b — two Masks should make the teammate's lone attacker +2; it stays +0", async () => {
    const game = await teamBoard(2, false, P3);
    await game.seat(P3).move("ally", "bf1");
    await drainChain(game);
    expect(game.state("ally")).toMatchObject({ might: 5, mightModifier: 2 });
  });

  test("'alone' still means alone — a second friendly unit at the battlefield switches the trigger off", async () => {
    const game = await teamBoard(1, true);
    await game.p1.move(["mine", "buddy"], "bf1");
    await drainChain(game);
    expect(game.state("mine")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("buddy")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
