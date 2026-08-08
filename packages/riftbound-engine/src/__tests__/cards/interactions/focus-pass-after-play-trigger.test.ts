/**
 * Interaction: playing a unit as a Focus action when that unit has a "When you play me" trigger
 * (reported against Morgana, Vindictive ven-017-166 played via [Ambush], but card-independent —
 * every filler definition below is inline).
 *
 * Rules: 340.2.a / 347.1.b (taking a Focus action passes Focus once the action finishes),
 * 346 / 346.1 (Focus passes when a chain that was OPENED BY PLAYING A CARD empties; a chain
 * opened by a triggered/Add ability does not pass Focus).
 *
 * A unit resolves immediately on play, so its play trigger is the item that OPENS the chain.
 * That chain still belongs to the Focus action of playing a card, so when it empties Focus must
 * move to the next Relevant Player — exactly as it does for a vanilla Reaction unit.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Unit · 2 Might · [Reaction] · "When you play me, draw 1." */
const REACTION_PLAY_DRAWER = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  might: 2,
  name: "Filler Reaction Play Drawer",
  timing: "reaction",
};

/** Unit · 2 Might · [Reaction] · no abilities — the control case. */
const REACTION_VANILLA = {
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  might: 2,
  name: "Filler Reaction Vanilla",
  timing: "reaction",
};

function showdownOf(game: G) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  const top = stack[stack.length - 1];
  return top?.active ? top : undefined;
}

/** P1 moves U to an empty uncontrolled battlefield → Non-Combat Showdown, P1 holds Focus. */
async function showdownWithP1Focus(handDef: unknown): Promise<G> {
  const game = await scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
    .unit(P2, "base", { might: 2, name: "Filler X" }, "X")
    .hand(P1, handDef as never, "newbie")
    .build();
  await game.p1.move("U", "bf1");
  expect(showdownOf(game)?.focusPlayer).toBe(P1);
  return game;
}

describe("Focus passes after playing a unit as a Focus action, even when its play trigger opens the chain (340.2.a / 346 / 347.1.b)", () => {
  test("control: a vanilla Reaction unit played with Focus passes Focus to P2", async () => {
    const game = await showdownWithP1Focus(REACTION_VANILLA);
    await game.p1.play("newbie", { to: "base" });
    expect(game.chain()).toEqual([]);
    expect(showdownOf(game)?.focusPlayer).toBe(P2);
  });

  test("a Reaction unit whose 'When you play me' trigger opens the chain also passes Focus once that chain empties", async () => {
    const game = await showdownWithP1Focus(REACTION_PLAY_DRAWER);
    const hand0 = game.p1.hand().length;
    await game.p1.play("newbie", { to: "base" });
    expect(game.chain()).toHaveLength(1); // the play trigger opened the chain
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand().length).toBe(hand0 - 1 + 1); // the trigger did resolve
    expect(game.chain()).toEqual([]);
    expect(showdownOf(game)?.focusPlayer).toBe(P2);
    expect(showdownOf(game)?.passedPlayers ?? []).toEqual([]);
  });
});
