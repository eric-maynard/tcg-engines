/**
 * Ruling 219b69b0caf4f4ee — Hard Bargain (SFD-136 → sfd-136-221) · Reaction · [2]
 *   "[Repeat] [2] — Counter a spell unless its controller pays [2]."
 *
 * Q: Can I play Hard Bargain with nothing on the chain?
 * A: No. "Counter a spell" needs a spell to choose, and a card can only be played when every object
 *    it must choose exists. With an empty chain there is no legal target, so the play is illegal.
 * Rules: 355.8 / 358.1 (all chosen objects must be legal when the card is played), 358.4 (an
 *        illegal play is cancelled), 347 ([Reaction] widens the timing, not the targeting).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";
const VOID_SEEKER = "ogn-024-298"; // [3]+[fury] Action — "Deal 4 to a unit at a battlefield. Draw 1."

/** P1's turn. P1 holds Hard Bargain (+ plenty of energy) and a Void Seeker to put on the chain; P2 has a Wall at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .hand(P1, HARD_BARGAIN, "hb")
    .hand(P1, VOID_SEEKER, "vs");
}

describe("Ruling 219b69b0caf4f4ee — Hard Bargain needs a spell on the chain; it cannot be played into an empty chain", () => {
  test("premise: the chain is empty and P1 can comfortably afford Hard Bargain's [2]", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(8);
  });

  test("ruling: with an empty chain Hard Bargain is not a legal play — it is absent from the menu and casting it is refused", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "hb")).toBe(false);
    expect(game.p1.option("cast", "hb")).toBeUndefined();
    expect(game.p1.legal().some((o) => o.card === "hb")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("hb"));
    expect(attempt.ok).toBe(false);
    // The failed attempt cost nothing and put nothing on the chain (358.4).
    expect(game.zoneOf("hb")).toBe("hand");
    expect(game.p1.energy()).toBe(8);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: put a spell on the chain and Hard Bargain becomes legal at once, naming that spell", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "wall" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    expect(game.p1.can("cast", "hb")).toBe(true);
    const targets = (game.p1.option("cast", "hb")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["vs"]);
    await game.p1.cast("hb", { targets: "vs" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "hb"]);
  });

  test("…and once that spell has left the chain again Hard Bargain is unplayable once more", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "wall" });
    expect(game.p1.can("cast", "hb")).toBe(true);
    await game.settle(); // Void Seeker resolves and goes to the trash
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(4);
    expect(game.p1.can("cast", "hb")).toBe(false);
  });
});
