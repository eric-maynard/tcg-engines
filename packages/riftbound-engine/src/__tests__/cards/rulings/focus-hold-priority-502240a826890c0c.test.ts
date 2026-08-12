/**
 * Ruling 502240a826890c0c — (no specific card) holding priority after starting a chain in a showdown
 *
 * Q: If I have Focus in a showdown and start with an Action, can I immediately play a Reaction, or does
 *    priority pass automatically to my opponent?
 * A: Priority first goes back to the player who ADDED the item, so yes — you may add reactions on top of
 *    your own Action before passing. You cannot "chain block": the opponent still gets full opportunity to
 *    respond to the original Action, only later. Once both pass in succession the top item resolves and
 *    priority goes to the controller of the next item.
 * Rules: 340.1 (adding an item does not pass priority), 340.2/340.3 (all pass ⇒ top resolves),
 *        340.4 (priority to the controller of the newest remaining item), 347.1 (Focus starts a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** [Reaction] "Counter a spell." */
const NULLIFY = {
  abilities: [
    { effect: { target: { type: "spell" }, type: "counter" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Nullify",
  rulesText: "[Reaction] Counter a spell.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, RALLY, "act")
    .hand(P1, STING, "rea1")
    .hand(P1, STING, "rea2")
    .hand(P2, NULLIFY, "nullify")
    .hand(P2, STING, "psting");
}

describe("Ruling 502240a826890c0c — the Focus holder keeps priority after their Action", () => {
  test("after playing the Action the acting seat is STILL the caster — they may add a Reaction immediately, without the opponent acting in between", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ focusPlayer: P1 });
    await game.p1.cast("act", { targets: "scout" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("rea1", { targets: "wall" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["act", "rea1"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("rea2", { targets: "wall" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["act", "rea1", "rea2"]);
    expect(game.decision()).toMatchObject({ seat: P1 });
    // nothing has resolved while P1 stacked items
    expect(game.state("scout").might).toBe(2);
    expect(game.state("wall").damage).toBe(0);
  });

  test("no chain blocking: the opponent still gets a full window on the original Action — they answer AFTER P1 passes, and may counter it", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("act", { targets: "scout" });
    await game.p1.cast("rea1", { targets: "wall" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "nullify")).toBe(true);
    const offered = (game.p2.option("cast", "nullify")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("act"); // the buried Action is still answerable
    await game.p2.cast("nullify", { targets: "act" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["act", "rea1", "nullify"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // nullify resolves
    expect(game.zoneOf("act")).toBe("trash");
    await game.p1.passPriority();
    await game.p2.passPriority(); // rea1 resolves
    expect(game.state("wall").damage).toBe(1);
    expect(game.state("scout").might).toBe(2); // the countered Action never gave +2
  });

  test("after the top item resolves priority returns to the controller of the next item — not automatically to the opponent", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.cast("act", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.cast("psting", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // psting (top, P2's) resolves
    expect(game.state("scout").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["act"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 owns "act"
    expect(game.p1.can("cast", "rea1")).toBe(true);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("scout").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
