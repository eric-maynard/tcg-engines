/**
 * Ruling 0bd3756faa1cf5b8 — Lunar Boon (UNL-125 → unl-125-219) · Spell · Chaos · [3] · [Reaction]
 *   "Discard 1, then draw 2."
 *
 * Q: Can I play Lunar Boon with no (other) cards in hand?
 * A: Yes. The discard is part of the effect, not a cost ("to"/"in order to" phrasing is absent), so the
 *    spell is playable with an empty hand; on resolution you discard zero cards (do as much as you can)
 *    and still draw 2.
 * Rules: 359.3.e.11 / 422.4 (impossible instruction is skipped, rest still happens), 355.1 (costs vs effects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LUNAR_BOON = "unl-125-219";
const FILLER = { cardType: "unit", energyCost: 2, might: 2, name: "Filler" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, LUNAR_BOON, "boon");
}

describe("Ruling 0bd3756faa1cf5b8 — Lunar Boon is playable with an empty hand: discard 0, still draw 2", () => {
  test("with Boon as the ONLY card in hand it is a legal play (the discard is an effect, not a cost) and casting it spends the [3]", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toEqual(["boon"]);
    expect(game.p1.can("cast", "boon")).toBe(true);
    await game.p1.cast("boon");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("boon")).toBe("chain");
    expect(game.p1.hand()).toEqual([]); // nothing left to discard
  });

  test("on resolution nothing is discarded (no prompt, trash holds only Boon itself) and P1 still draws the top 2", async () => {
    const game = await board().build();
    await game.p1.cast("boon");
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no dangling discard prompt
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.trash()).toEqual(["boon"]);
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("d3")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with one other card in hand that card IS discarded first, then 2 are drawn", async () => {
    const game = await board().hand(P1, FILLER, "junk").build();
    await game.p1.cast("boon");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
      await game.settle();
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
  });
});
