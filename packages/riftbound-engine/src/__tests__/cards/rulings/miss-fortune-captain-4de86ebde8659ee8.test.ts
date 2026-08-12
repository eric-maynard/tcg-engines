/**
 * Ruling 4de86ebde8659ee8 — Miss Fortune, Captain (OGN-162 → ogn-162-298)
 *   "[Ganking] The first time I move each turn, you may ready something else that's exhausted."
 *   × an inline [Reaction] "Deal 1 to a unit" in the opponent's hand
 *   × an inline "When I attack, deal 1 to a unit" unit (to contrast attack triggers).
 *
 * Q: Do movement triggers happen before the combat showdown starts, and can they be reacted to?
 * A: Yes. The standard move itself is not an ability and opens no chain, but a trigger it sets off
 *    does: that chain must fully resolve — with both players able to answer it — before the showdown
 *    from the same move begins. "When I attack" triggers are different: they belong to the
 *    showdown's own initial chain.
 * Rules: 143 (standard move), 344.2 (showdown staged in Cleanup), 383.3.a (optional trigger opt-in
 *        at finalization), 459.2.d.1 (attack triggers on the showdown's initial chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISS_FORTUNE = "ogn-162-298";

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

/** "When I attack, deal 1 to a unit." */
const RAIDER = {
  abilities: [
    {
      effect: { amount: 1, target: { type: "unit" }, type: "damage" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  might: 4,
  name: "Test Raider",
  rulesText: "When I attack, deal 1 to a unit.",
} as const;

function showdownActive(game: Game): boolean {
  return (game.gameState.interaction?.showdownStack ?? []).some((s) => s.active);
}

/** Miss Fortune in P1's base with an exhausted friend to ready; P2 holds bf1 with a 9-Might Wall. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .unit(P1, "base", { might: 2, name: "Tired" }, "tired", { exhausted: true })
    .hand(P2, STING, "sting");
}

describe("Ruling 4de86ebde8659ee8 — a movement trigger's chain resolves BEFORE the showdown that move causes", () => {
  test("Miss Fortune's move trigger is on the chain while NO showdown exists yet, and it is answerable by the opponent", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    // The optional trigger is offered to its controller at finalization (383.3.a).
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.chain().map((i) => i.cardId)).toEqual(["mf"]);
    expect(showdownActive(game)).toBe(false); // the showdown has NOT begun
    // P2 may answer the trigger with a Reaction before it resolves.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sting")).toBe(true);
    await game.p2.cast("sting", { targets: "mf" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["mf", "sting"]);
    // Once the chain empties the trigger has done its work and the showdown opens.
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.state("mf").damage).toBe(1);
    expect(game.state("tired").isReady).toBe(true);
    expect(showdownActive(game)).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("declining the trigger still resolves the (empty) chain first; only then does the showdown open", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    await game.p1.no();
    expect(game.state("tired").isReady).toBe(false);
    expect(showdownActive(game)).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  });

  test("control: a plain unit's standard move opens no chain at all — the showdown starts at once", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .hand(P2, STING, "sting")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.chain()).toEqual([]);
    expect(showdownActive(game)).toBe(true);
  });

  test("contrast: an ATTACK trigger is not a movement trigger — it appears on the showdown's own initial chain", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", RAIDER, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    expect(showdownActive(game)).toBe(true); // the showdown is already open…
    expect(game.chain().map((i) => i.cardId)).toEqual(["raider"]); // …and the trigger is inside it
    expect(game.violations()).toEqual([]);
  });
});
