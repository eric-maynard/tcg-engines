/**
 * Acceptable Losses — ogn-179-298 · Spell · Chaos · 1 energy · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Each player kills one of their gear.
 *
 * Rules: this does not "choose"/target — on resolution every player (caster included) kills one
 * gear they control, each player selecting their own; a player with no gear is simply unaffected.
 *
 * rule 355.10.e — a per-player instruction is not targeting, so nothing is named at cast time;
 * every player, the caster included, picks their own gear as the spell resolves.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-179-298";
const GEAR = (name: string) => ({ cardType: "gear", energyCost: 1, name });

function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .gear(P1, GEAR("Mine A"), "g1a")
    .gear(P2, GEAR("Theirs A"), "g2a")
    .gear(P2, GEAR("Theirs B"), "g2b")
    .hand(P1, CARD, "al");
}

describe("Acceptable Losses (ogn-179-298)", () => {
  test("cost: 1 energy; resolves to the trash; not castable with 0 energy", async () => {
    const game = await board().build();
    await game.p1.cast("al");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1, triggered: false })]);
    await game.settle();
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("al")).toBe("trash");
    const poor = await scenario().gear(P1, GEAR("Mine A"), "g1a").hand(P1, CARD, "al").build();
    expect(poor.p1.can("cast", "al")).toBe(false);
  });

  test("the caster's own gear is killed too (with a single gear there is no choice to make)", async () => {
    const game = await board().build();
    await game.p1.cast("al");
    game.script(P1, ["g1a"]);
    game.script(P2, ["g2a"]);
    await game.settle();
    expect(game.zoneOf("g1a")).toBe("trash");
  });

  test("EACH player kills one of their gear — the opponent loses one as well (only one gear dies today)", async () => {
    const game = await board().build();
    await game.p1.cast("al");
    game.script(P1, ["g1a"]);
    game.script(P2, ["g2a"]);
    await game.settle();
    expect(game.zoneOf("g1a")).toBe("trash");
    const p2Dead = ["g2a", "g2b"].filter((g) => game.zoneOf(g) === "trash");
    expect(p2Dead).toHaveLength(1);
  });

  test("each player selects which of THEIR OWN gear dies — P2 is the one asked about g2a/g2b", async () => {
    const game = await board().build();
    await game.p1.cast("al");
    game.script(P1, ["g1a"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P2);
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["g2a", "g2b"]);
    await game.p2.pick("g2b");
    await game.settle();
    expect(game.zoneOf("g2b")).toBe("trash");
    expect(game.zoneOf("g2a")).toBe("base");
    expect(game.zoneOf("g1a")).toBe("trash");
  });

  test("a player with no gear is unaffected; the other player still kills one (caster has none here)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).gear(P2, GEAR("Theirs A"), "g2a").unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "al").build();
    await game.p1.cast("al");
    await game.settle();
    expect(game.zoneOf("g2a")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base"); // units are not gear
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("al")).toBe("trash");
  });

  test("Action timing: not castable on the opponent's turn outside a showdown; castable in a showdown", async () => {
    const closed = await board().active(P2).build();
    expect(closed.p1.can("cast", "al")).toBe(false);
    const game = await board()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "def")
      .unit(P2, "base", { might: 1 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "al")).toBe(true);
  });
});
