/**
 * Ruling 77ce352e720f2a5f — Acceptable Losses (OGN-179 → ogn-179-298) · Spell · Chaos · [1] · [Action]
 *   "Each player kills one of their gear."
 *
 * Q: Can you play Acceptable Losses without controlling a gear yourself?
 * A: Yes. It does not target, so nothing has to be legal for it to be played. On resolution every player who does
 *    control gear picks one of THEIRS to kill; a player with none simply cannot follow that instruction and it is
 *    ignored. It is even legal when NOBODY controls gear — the effect just does nothing and the cost is still paid.
 * Rules: 355.10.e (per-player instruction, not targeting), 355.8 (only targets gate putting a spell on the chain),
 *        359.3.e.6 / 359.3.e.11 (perform as much as possible, ignore the impossible), 357 (cost paid regardless).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const TRINKET = { cardType: "gear", name: "Trinket" } as const;

/** P1's turn with exactly [1]; who owns gear varies per case. */
function board() {
  return scenario().resources(P1, { energy: 1 }).hand(P1, ACCEPTABLE_LOSSES, "al");
}

describe("Ruling 77ce352e720f2a5f — Acceptable Losses is playable with no gear of your own, or with none anywhere", () => {
  test("caster owns NO gear, opponent does: the spell is offered, takes no target, and still costs [1]", async () => {
    const game = await board().gear(P2, TRINKET, "theirs").build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.can("cast", "al")).toBe(true);
    await game.p1.cast("al");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("…and on resolution only the gear-owning player loses anything; the gearless caster is skipped, unprompted", async () => {
    const game = await board().gear(P2, TRINKET, "theirs").build();
    await game.p1.cast("al");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("NOBODY controls gear: the spell is still a legal play (FAQ #10842) and simply does nothing", async () => {
    const game = await board().build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.p1.can("cast", "al")).toBe(true);
    await game.p1.cast("al");
    await game.settle();
    expect(game.zoneOf("al")).toBe("trash"); // resolved, not countered or fizzled out of existence
    expect(game.p1.energy()).toBe(0); // the cost was paid all the same
    expect(game.violations()).toEqual([]);
  });

  test("control — the caster's own gear is not spared when he does have one", async () => {
    const game = await board().gear(P1, TRINKET, "mine").gear(P2, TRINKET, "theirs").build();
    await game.p1.cast("al");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
  });
});
