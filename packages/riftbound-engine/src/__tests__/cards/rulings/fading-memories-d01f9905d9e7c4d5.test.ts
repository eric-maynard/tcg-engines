/**
 * Ruling d01f9905d9e7c4d5 — Fading Memories (OGN-180 → ogn-180-298) · Action [4][chaos] "Give a unit at a battlefield or a gear
 *   [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × Tactical Retreat (UNL-175 → unl-175-219) · Reaction [2] "Choose a friendly unit. The next time it would die this turn, heal it,
 *     exhaust it, and recall it instead."   (Retreat ogn-104-298 is the ruling's other listed bounce answer.)
 *
 * Q: The opponent made my unit Temporary. In my Beginning Phase, can I respond to the Temporary kill trigger with Tactical Retreat?
 * A: Yes. Temporary's kill is a triggered ability on the chain; you may play a Reaction in response. Tactical Retreat resolves first
 *    (LIFO) and sets up the replacement; when the Temporary trigger then tries to kill the unit it is healed, exhausted and recalled
 *    to base instead of dying.
 * Rules: 816 (Temporary = start-of-Beginning-Phase kill trigger), 383/336 (respond to a trigger with Reactions), 371–373 (replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FADING_MEMORIES = "ogn-180-298";
const TACTICAL_RETREAT = "unl-175-219";

/** P2's turn. P1 holds bf1 with Bruiser (3) and has 3 ready order runes + Tactical Retreat in hand. P2: Fading Memories + [4][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .runes(P1, "order", 3)
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Bruiser" }, "bruiser")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, TACTICAL_RETREAT, "tr")
    .hand(P2, FADING_MEMORIES, "fading");
}

const hasTemporary = (game: Game, id: string) =>
  game.state(id).keywords.includes("Temporary") || game.state(id).grantedKeywords.some((k) => k.keyword === "Temporary");

/** P2 fades the Bruiser and ends the turn; returns at the start of P1's Beginning Phase with the Temporary kill on the chain. */
async function intoBeginningWithTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("fading", { targets: "bruiser" });
  await game.settle();
  expect(game.zoneOf("fading")).toBe("trash");
  expect(hasTemporary(game, "bruiser")).toBe(true);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bruiser", triggered: true })]);
  expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
  return game;
}

describe("Ruling d01f9905d9e7c4d5 — Tactical Retreat in response to the Temporary trigger saves the unit", () => {
  test("the Temporary kill is a chain item in P1's Beginning Phase and P1 holds priority: Tactical Retreat (Reaction) is playable in response", async () => {
    const game = await intoBeginningWithTemporaryTrigger();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Produce [2] + order at Reaction speed from the runes, then respond.
    await game.p1.tapRune();
    await game.p1.tapRune();
    await game.p1.recycleRune();
    expect(game.p1.can("cast", "tr")).toBe(true);
    await game.p1.cast("tr", { targets: "bruiser" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bruiser", "tr"]);
  });

  test("LIFO: Tactical Retreat resolves first; then the Temporary trigger 'kills' the Bruiser → replaced: healed, exhausted, recalled to base — NOT in the trash", async () => {
    const game = await intoBeginningWithTemporaryTrigger();
    await game.p1.tapRune();
    await game.p1.tapRune();
    await game.p1.recycleRune();
    await game.p1.cast("tr", { targets: "bruiser" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tactical Retreat resolves
    expect(game.zoneOf("tr")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bruiser"]);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // nothing has happened to it yet
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.trash()).not.toContain("bruiser");
    // The turn then proceeds normally into P1's main phase with the Bruiser alive.
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("control: without a response the Temporary trigger kills the Bruiser at the start of P1's Beginning Phase (before scoring — no hold point for bf1)", async () => {
    const game = await intoBeginningWithTemporaryTrigger();
    const before = game.p1.points();
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(before); // it was P1's only unit at bf1; killed before the hold is scored
  });
});
