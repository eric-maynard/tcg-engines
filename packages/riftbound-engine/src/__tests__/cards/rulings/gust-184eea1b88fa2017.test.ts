/**
 * Ruling 184eea1b88fa2017 — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3
 *   [Might] or less to its owner's hand."
 *   × Evelynn, Entrancing (UNL-141 → unl-141-219) · 2 Might "[Hidden] [Backline] When you play me from face down on
 *     your turn, you may move an enemy unit at a different location to my battlefield."
 *
 * Q: When Evelynn is revealed (played from hidden), can the opponent Gust her, and what happens?
 * A: Yes. Playing her from facedown puts her play-trigger on the chain; Gust can be played in response, resolves
 *    first (LIFO) and returns Evelynn (2 Might, at a battlefield) to hand. Her trigger then resolves but she is no
 *    longer on the board to be a destination, so no enemy unit moves.
 * Rules: 811.1.c.3 (play from hidden opens a chain), 811.6, 332/336 (LIFO), move-to-"my battlefield" needs the source.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const EVELYNN = "unl-141-219";

/**
 * P1's turn. bf1 is P1's (a 3-Might Holder there) with Evelynn facedown since an earlier turn.
 * P2 holds bf2 with a 2-Might Foe (the enemy unit "at a different location"), Gust in hand and [1].
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .facedown(P1, "bf1", EVELYNN, "eve")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

/** P1 plays Evelynn from hidden and opts into her trigger (Foe is the only legal enemy unit elsewhere). */
async function revealEvelynn(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("reveal", "eve")).toBe(true);
  await game.p1.reveal("eve");
  // 1. She is played to bf1 and her "when you play me from face down" trigger is on the chain (P1's opt-in).
  expect(game.zoneOf("eve")).toBe("battlefield-bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "eve" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("foe");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "eve", controller: P1, targets: ["foe"], triggered: true })]);
  return game;
}

describe("Ruling 184eea1b88fa2017 — Gust in response to Evelynn's play-from-hidden bounces her and blanks her move trigger", () => {
  test("control: unanswered, Evelynn's trigger resolves and pulls the enemy Foe from bf2 to her battlefield", async () => {
    const game = await revealEvelynn();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.zoneOf("eve")).toBe("battlefield-bf1");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // moved in (a combat then ensues there)
  });

  test("2. with her trigger pending, P2 gets priority and Gust is legal with Evelynn (2 Might, at a battlefield) as a target", async () => {
    const game = await revealEvelynn();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("eve");
    await game.p2.cast("gust", { targets: "eve" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["eve", "gust"]); // Gust above her ability
    expect(game.p2.energy()).toBe(0);
  });

  test("3–4. Gust resolves first (LIFO) → Evelynn returns to P1's hand; her ability then resolves with no destination → Foe does NOT move", async () => {
    const game = await revealEvelynn();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "eve" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("eve")).toBe("hand");
    expect(game.p1.hand()).toContain("eve");
    expect(game.zoneOf("gust")).toBe("trash");
    // Her trigger is still on the chain, alone.
    expect(game.chain().map((c) => c.cardId)).toEqual(["eve"]);
    await game.settle(); // trigger resolves — nothing to move to
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("foe")).toBe("battlefield-bf2");
    expect(game.p2.units("bf2")).toEqual(["foe"]);
    expect(game.cardsAt("bf1")).toEqual(["holder"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
