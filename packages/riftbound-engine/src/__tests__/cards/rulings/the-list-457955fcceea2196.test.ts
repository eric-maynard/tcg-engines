/**
 * Ruling 457955fcceea2196 — The List (UNL-138 → unl-138-219) · Gear · Chaos · [1]
 *   "As you play this, name a tag.
 *    [Exhaust]: Give a unit with the named tag -2 [Might] this turn."
 *
 * Q: Can The List's ability be reacted to?
 * A: The [Exhaust] ability, yes — an activated ability goes on the Chain like a spell, creating a Closed
 *    State in which the opponent gets a Reaction window before the -2 resolves. The "as you play this, name a
 *    tag" half, no — it happens while the Gear itself is being played, and permanents finalize immediately
 *    with no Reaction window. Timing: the ability is still Main-Phase-in-an-Open-State only.
 * Rules: 377.3 / 406.4 (activated abilities use the chain and open a Reaction window),
 *        358 (a permanent's play finalizes at once — no window), 406.1 (activation timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_LIST = "unl-138-219";

/** P1 plays The List and names "Poro"; P2 owns a Poro-tagged 3-Might unit. */
async function listNamingPoro(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 3 })
    .unit(P2, "base", { might: 3, name: "Poro Pal", tags: ["Poro"] }, "poro")
    .hand(P1, THE_LIST, "list")
    .build();
  await game.p1.play("list");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  await game.p1.name("Poro");
  expect(game.state("list").meta).toMatchObject({ namedTag: "Poro" });
  return game;
}

describe("Ruling 457955fcceea2196 — The List's [Exhaust] ability can be reacted to; the naming cannot", () => {
  test("the [Exhaust] ability goes on the chain and hands the opponent a Reaction window before it resolves", async () => {
    const game = await listNamingPoro();

    await game.p1.activate("list", 1); // #0 is the play-time naming
    expect(game.chain()).toMatchObject([{ cardId: "list", targets: ["poro"], triggered: false }]);
    expect(game.state("poro").might).toBe(3); // not applied yet

    await game.p1.passPriority();
    // The opponent really is offered the window.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });

    await game.settle();
    expect(game.state("poro").might).toBe(1);
    expect(game.state("list").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("while that ability sits on the chain, its controller is in a Closed State — no main-phase actions, only pass", async () => {
    const game = await listNamingPoro();
    await game.p1.activate("list", 1);

    expect(game.p1.legal().map((o) => o.key)).toEqual(["concede:-", "passChainPriority:-"]);
  });

  // Playing a permanent finalizes at once, so the "as you play this, name a tag" step gives nobody a
  // Reaction window: the naming is an `asYouPlay` name-card step, resolved inline off the Chain.
  test("ruling 457955fcceea2196 — the play-time naming opens no Reaction window", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P2, "base", { might: 3, name: "Poro Pal", tags: ["Poro"] }, "poro")
      .hand(P1, THE_LIST, "list")
      .build();

    await game.p1.play("list");

    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  });
});
