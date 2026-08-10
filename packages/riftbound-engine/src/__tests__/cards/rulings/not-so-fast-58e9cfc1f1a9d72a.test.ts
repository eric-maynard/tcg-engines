/**
 * Ruling 58e9cfc1f1a9d72a — Not So Fast (SFD-045 → sfd-045-221) · Reaction spell · Calm · [2][calm]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7][mind] · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Can Not So Fast block the play effect of Thousand-Tailed Watcher?
 * A: No. Not So Fast needs an enemy spell/ability that CHOOSES (targets) a friendly unit or gear. The Watcher's
 *    trigger is a blanket effect on all enemy units — it chooses nothing — so it is not a legal object for
 *    Not So Fast.
 * Rules: 355.9.b (what "chooses" means), 425 (counter needs a legal object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const WATCHER = "ogn-116-298";

/** P2's turn. P2: Watcher in hand + [7][mind]. P1: two units (5 and 2 Might) in base, Not So Fast + [2][calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .hand(P2, WATCHER, "watcher")
    .unit(P1, "base", { might: 5, name: "Big" }, "big")
    .unit(P1, "base", { might: 2, name: "Small" }, "small")
    .hand(P1, NOT_SO_FAST, "nsf")
    .resources(P1, { energy: 2, power: { calm: 1 } });
}

/** P2 plays the Watcher; its play trigger sits on the chain and P1 holds priority. */
async function watcherTriggerPendingWithP1(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("watcher");
  expect(game.zoneOf("watcher")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P2, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 58e9cfc1f1a9d72a — Not So Fast cannot counter Thousand-Tailed Watcher's untargeted play trigger", () => {
  test("with the Watcher's trigger on the chain, Not So Fast is offered no legal object and is not castable (P1 can afford it)", async () => {
    const game = await watcherTriggerPendingWithP1();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    const opt = game.p1.option("cast", "nsf");
    const offered = (opt?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual([]);
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf"));
    expect(r.ok).toBe(false);
    // Nothing changed yet: the -3 applies only when the trigger resolves.
    expect(game.state("big").might).toBe(5);
  });

  test("the trigger then resolves as a blanket effect: every enemy (P1) unit gets -3 this turn, min 1 — Big 5→2, Small 2→1; Not So Fast stays in hand", async () => {
    const game = await watcherTriggerPendingWithP1();
    await game.p1.passPriority();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("big").might).toBe(2);
    expect(game.state("small").might).toBe(1);
    expect(game.state("watcher").might).toBe(7);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.violations()).toEqual([]);
  });
});
