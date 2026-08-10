/**
 * Ruling cb8979e78d6ae3f4 — Not So Fast (SFD-045 → sfd-045-221) · Spell · [Reaction] · Calm · 2 + [calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · 7 + [mind] · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Can you Not So Fast the on-play effect of Thousand-Tailed Watcher?
 * A: No. Not So Fast needs an enemy spell/ability that CHOOSES a friendly unit or gear; the Watcher's trigger is a blanket
 *    effect on all enemy units and chooses nothing. You may still play OTHER Reaction-speed cards in response to the
 *    trigger before the -3 resolves.
 * Rules: 355.9 (what "choose"/target means — "all enemy units" is not a choice), 425 (Counter needs a legal object on the
 *        chain), 336–340 (responding on the chain with Reactions; LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const WATCHER = "ogn-116-298";
/** Some OTHER Reaction: "+3 [Might] this turn" for 1. */
const BRACE = {
  abilities: [{ effect: { amount: 3, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Brace",
  timing: "reaction",
} as const;

/** P2's turn. P2: Watcher + exactly 7+[mind]. P1: Big (5) and Small (2) in base; Not So Fast, Brace; 3 energy + [calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .hand(P2, WATCHER, "watcher")
    .unit(P1, "base", { might: 5, name: "Big" }, "big")
    .unit(P1, "base", { might: 2, name: "Small" }, "small")
    .hand(P1, NOT_SO_FAST, "nsf")
    .hand(P1, BRACE, "brace")
    .resources(P1, { energy: 3, power: { calm: 1 } });
}

/** P2 plays the Watcher; its play trigger is on the chain and priority has come round to P1. */
async function watcherTriggerWithP1(): Promise<Game> {
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

describe("Ruling cb8979e78d6ae3f4 — Not So Fast has no legal object in the Watcher's untargeted trigger; other Reactions are fine", () => {
  test("the Watcher's trigger chooses nothing (no targets on its chain item), so Not So Fast — affordable — is offered no object and cannot be cast", async () => {
    const game = await watcherTriggerWithP1();
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } });
    const offered = (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual([]);
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.state("big").might).toBe(5); // nothing applied yet
  });

  test("…but another Reaction CAN be played in response: Brace (+3 on Big) goes above the trigger and resolves first (Big 8), then the -3 lands: Big 5, Small 1 (minimum 1)", async () => {
    const game = await watcherTriggerWithP1();
    expect(game.p1.can("cast", "brace")).toBe(true);
    await game.p1.cast("brace", { targets: "big" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["watcher", "brace"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Brace resolves
    expect(game.state("big").might).toBe(8);
    expect(game.chain().map((c) => c.cardId)).toEqual(["watcher"]);
    await game.settle(); // the Watcher's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("big").might).toBe(5); // 5 + 3 − 3
    expect(game.state("small").might).toBe(1); // 2 − 3 → minimum 1
    expect(game.state("watcher").might).toBe(7);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } }); // only Brace was paid for
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
