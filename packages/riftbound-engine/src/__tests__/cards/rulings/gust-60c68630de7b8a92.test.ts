/**
 * Ruling 60c68630de7b8a92 — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or
 *     less to its owner's hand."
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · 1 Might "[Hidden] When you play me, give me +3 [Might] this turn."
 *
 * Q: Do "On Play" (When you play me) effects use the Chain, so opponents can react with cards like Gust?
 * A: Yes. E.g. Teemo played from hidden: his +3 Might on-play ability is placed on the Chain, the opponent receives
 *    priority and may react with Gust before it resolves.
 * Rules: 383.3 (triggered abilities go on the chain), 330–337 (Closed state, priority, Reactions), 811 (play from hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";
const GUST = "ogn-169-298";

/** Turn 3, P1 active and holding bf1 where Teemo was hidden earlier. P2: Gust + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

async function teemoPlayedFromHidden(): Promise<Game> {
  const game = await board().build();
  await game.p1.reveal("teemo");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("teemo");
  }
  expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
  return game;
}

describe("Ruling 60c68630de7b8a92 — 'When you play me' abilities are chain items that opponents can react to", () => {
  test("Teemo's on-play ability is ON THE CHAIN as a triggered item (not applied instantly): he is still 1 Might", async () => {
    const game = await teemoPlayedFromHidden();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true, type: "ability" })]);
    expect(game.state("teemo")).toMatchObject({ might: 1, mightModifier: 0 });
  });

  test("the state is Closed: after P1 passes, P2 holds priority with the ability pending and Gust is a legal Reaction", async () => {
    const game = await teemoPlayedFromHidden();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
    expect(game.p2.can("cast", "gust")).toBe(true);
  });

  test("P2 reacts with Gust: it stacks above the on-play ability and resolves first — Teemo returns to hand un-boosted; then the ability resolves to nothing", async () => {
    const game = await teemoPlayedFromHidden();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "teemo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.state("teemo").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
