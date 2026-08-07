/**
 * Ruling 0c7d5d4fd0c393b4 — Lux, Crownguard (ogs-014-024) · Champion Unit · Order · 4 · 2 Might
 *   "[Exhaust]: [Reaction] — [Add] [2]. Use only to play spells. (Abilities that add resources can't be
 *    reacted to.)"
 *   × Hard Bargain (sfd-136-221) "[Reaction] [Repeat][2] Counter a spell unless its controller pays [2]."
 *   × Dredge Up (ven-049-166) — plain 2-cost spell, "Draw 1."
 *
 * Q: Can I use Lux's ability to pay for Hard Bargain('s [2] ransom)?
 * A: No. Lux's [2] may pay a spell's COSTS while that spell is being played (357.1, 357.1.a). Hard
 *    Bargain's "unless its controller pays [2]" is executed later, when Hard Bargain resolves (158.1) — it
 *    is not a cost of playing the targeted spell, and Lux restricts her energy to playing spells (429.3),
 *    so it cannot fund that payment (or any payment demanded while a spell/ability resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LUX = "ogs-014-024";
const HARD_BARGAIN = "sfd-136-221";
const DREDGE_UP = "ven-049-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn: ready Lux in base, Dredge Up in hand; P2 holds Hard Bargain with 2 energy. */
function board(p1Energy: number) {
  return scenario()
    .resources(P1, { energy: p1Energy })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", LUX, "lux")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P2, HARD_BARGAIN, "hb");
}

/** P1 casts Dredge Up, P2 responds with Hard Bargain on it and passes back to P1 (HB still on the chain). */
async function dredgeGetsBargained(game: Game): Promise<void> {
  await game.p1.cast("dredge");
  await game.p1.passPriority();
  await game.p2.cast("hb", { targets: "dredge" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb"]);
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
}

describe("Ruling 0c7d5d4fd0c393b4 — Lux's [Add] [2] pays spell costs, not Hard Bargain's ransom", () => {
  test("what Lux IS for: with 0 energy P1 exhausts Lux for [2] (resolves immediately, no chain) and uses it to play the 2-cost Dredge Up (357.1.a)", async () => {
    const game = await board(0).build();
    expect(game.p1.can("cast", "dredge")).toBe(false); // nothing to pay with yet
    expect(game.p1.can("activate", "lux")).toBe(true);
    await game.p1.activate("lux");
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]); // "[Add]" abilities don't use the chain
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "dredge")).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("dredge");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash"); // cast from hand (no Flow) → trash
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // drew 1
  });

  test("Lux's ability is a Reaction: P1 may exhaust her while Hard Bargain is on the chain, and the [2] lands in P1's pool at once", async () => {
    const game = await board(2).build();
    await dredgeGetsBargained(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("activate", "lux")).toBe(true);
    await game.p1.activate("lux");
    expect(game.p1.energy()).toBe(2);
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "hb"]); // still nothing added to the chain
  });

  test("…but that energy cannot meet Hard Bargain's 'unless its controller pays [2]': Dredge Up is countered (no draw) and Lux's [2] is left unspent in the pool (158.1, 429.3)", async () => {
    const game = await board(2).build();
    const hand0 = game.p1.hand().length;
    await dredgeGetsBargained(game);
    await game.p1.activate("lux"); // P1's only energy is now Lux's spell-only [2]
    expect(game.p1.energy()).toBe(2);
    // Everyone passes; if the engine nevertheless asks P1 to pay, P1 tries to — it must not work.
    game.script(P1, [(d) => (d.kind === "yes-no" ? true : undefined)]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("dredge")).toBe("trash"); // countered → trash, did nothing
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // no "Draw 1"
    expect(game.p1.energy()).toBe(2); // Lux's energy was not (could not be) spent on the ransom
  });

  // The contrast that makes the ruling meaningful: with 2 ORDINARY energy left when Hard Bargain
  // resolves, its controller is asked whether to pay [2]; paying lets Dredge Up resolve (draw 1) and empties
  // the pool.
  test("ruling 0c7d5d4fd0c393b4 (contrast) — with 2 real energy P1 IS asked to pay Hard Bargain's [2]; paying saves Dredge Up (draw 1, energy 0)", async () => {
    const game = await board(4).build(); // 4 - 2 (Dredge Up) = 2 ordinary energy left
    const hand0 = game.p1.hand().length;
    await dredgeGetsBargained(game);
    expect(game.p1.energy()).toBe(2);
    await game.p1.passPriority(); // Hard Bargain resolves
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // Dredge Up resolved: drew 1
    expect(game.state("lux").isExhausted).toBe(false); // Lux was never needed
  });
});
