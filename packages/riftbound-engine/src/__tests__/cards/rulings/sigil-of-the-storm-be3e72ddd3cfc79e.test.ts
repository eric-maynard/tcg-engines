/**
 * Ruling be3e72ddd3cfc79e — Sigil of the Storm (OGN-287 → ogn-287-298) · Battlefield
 *   "When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)"
 *   × Seal of Strength (ogn-163-298) · Gear — "[Exhaust]: [Reaction] — [Add] [body]."
 *
 * Q: Can I tap a Seal to pay for Sigil of the Storm?
 * A: No. The Sigil demands the game action "recycle a rune". A Seal only ADDS Power; it never recycles a
 *    rune, so it cannot stand in. You must actually recycle one of your runes.
 * Rules: 471.2 (Conquer effects), 143/205 (recycling a rune is its own game action, distinct from adding
 *        Power), 355.10.d (a "one of your runes" pick ranges over runes only).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SIGIL_OF_THE_STORM = "ogn-287-298";
const SEAL_OF_STRENGTH = "ogn-163-298";

/** P1's turn. bf1 is the Sigil, empty and uncontrolled; P1 walks in to conquer it. */
function board(runes: number) {
  const b = scenario()
    .battlefield("bf1", { controller: null, def: SIGIL_OF_THE_STORM, inert: false })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .gear(P1, SEAL_OF_STRENGTH, "seal");
  return runes > 0 ? b.runes(P1, "body", runes) : b;
}

describe("Ruling be3e72ddd3cfc79e — the Sigil demands a real rune recycle; a Seal cannot substitute", () => {
  test("ruling: conquering raises the recycle choice, and it offers ONLY runes — the Seal is not an option", async () => {
    const game = await board(2).build();
    await game.p1.move("ally", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");

    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.options?.map((o) => String(o.key)) ?? [];
    expect(keys.sort()).toEqual(game.p1.runes().slice().sort());
    expect(keys).not.toContain("seal");
  });

  test("ruling: answering it really recycles a rune — the rune leaves the pool for the rune deck", async () => {
    const game = await board(2).build();
    const pool = game.p1.runes();
    const runeDeck = game.p1.runeDeck().length;

    await game.p1.move("ally", "bf1");
    await game.settle();
    await game.p1.pick(pool[0] as string);
    await game.settle();

    expect(game.p1.runes()).toEqual([pool[1] as string]);
    expect(game.p1.runeDeck().length).toBe(runeDeck + 1);
    expect(game.p1.points()).toBe(1); // the conquer itself still scored
  });

  test("ruling: the Seal is untouched by all of this — it is neither spent nor exhausted", async () => {
    const game = await board(2).build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    await game.p1.pick(game.p1.runes()[0] as string);
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.state("seal").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("with no runes on the board the requirement finds nothing to recycle — a Seal still cannot fill in", async () => {
    const game = await board(0).build();
    expect(game.p1.runes()).toEqual([]);
    await game.p1.move("ally", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.p1.runes()).toEqual([]);
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.state("seal").isExhausted).toBe(false);
    expect(game.p1.points()).toBe(1);
  });
});
