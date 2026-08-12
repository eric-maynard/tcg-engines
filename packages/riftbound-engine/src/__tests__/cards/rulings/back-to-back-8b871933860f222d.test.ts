/**
 * Ruling 8b871933860f222d — Back to Back (OGN-206 → ogn-206-298) · Spell · Order · [3] · [Reaction]
 *   "Give two friendly units each +2 [Might] this turn."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] · "Deal 3 to a unit at a battlefield." (P1's opening spell)
 *
 * Q: P1 plays a spell targeting P2's unit. Can P2 play TWO reactions back to back before passing priority?
 * A: Yes. Playing a reaction does not hand priority over — you keep it and may add another item on top. Priority
 *    only passes when you choose to pass. Once both players pass in a row the chain resolves last-in-first-out.
 * Rules: 340 (the player who acts retains priority), 336/337 (chain, LIFO resolution),
 *        347 ([Reaction] speed while items are on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_TO_BACK = "ogn-206-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 defends bf1 with two bodies and holds two Back to Backs plus the [3][3] to play both. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Tank" }, "tank")
    .unit(P2, "bf1", { might: 4, name: "Buddy" }, "buddy")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, BACK_TO_BACK, "b2b1")
    .hand(P2, BACK_TO_BACK, "b2b2");
}

/** P1 opens with Hextech Ray at the Tank; P2 now holds priority. */
async function opened(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray", { targets: "tank" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
  return game;
}

describe("Ruling 8b871933860f222d — a reaction does not pass priority: P2 may stack two before passing", () => {
  test("after P2's FIRST reaction the chain is 2 deep and P2 is still the acting seat", async () => {
    const game = await opened();
    await game.p2.cast("b2b1", { targets: ["tank", "buddy"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "b2b1"]);
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
  });

  test("holding priority, P2 adds a SECOND reaction on top — three items, still P2 to act", async () => {
    const game = await opened();
    await game.p2.cast("b2b1", { targets: ["tank", "buddy"] });
    await game.p2.cast("b2b2", { targets: ["tank", "buddy"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "b2b1", "b2b2"]);
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    expect(game.p2.energy()).toBe(0);
  });

  test("priority only passes when P2 says so — then P1 gets it back with all three items still unresolved", async () => {
    const game = await opened();
    await game.p2.cast("b2b1", { targets: ["tank", "buddy"] });
    await game.p2.cast("b2b2", { targets: ["tank", "buddy"] });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
    expect(game.chain()).toHaveLength(3);
    expect(game.state("tank").might).toBe(4); // nothing has resolved yet
  });

  test("LIFO: the second Back to Back resolves first, then the first, then P1's Ray last", async () => {
    const game = await opened();
    await game.p2.cast("b2b1", { targets: ["tank", "buddy"] });
    await game.p2.cast("b2b2", { targets: ["tank", "buddy"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "b2b1"]);
    expect(game.state("tank").might).toBe(6);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.state("tank").might).toBe(8);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("tank")).toMatchObject({ damage: 3, might: 8 }); // +4 total, then the Ray's 3
    expect(game.state("buddy").might).toBe(8);
    expect(game.violations()).toEqual([]);
  });
});
