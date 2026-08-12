/**
 * Ruling 8688de5085177845 — (no specific card) recycling out of a trash.
 *   Exercised with Forge of the Future (OGN-212 → ogn-212-298) "Kill this: Recycle up to 4 cards from trashes."
 *
 * Q: When an effect recycles cards from a trash, do I choose which cards, or must it be the "top" card?
 * A: You choose. A trash is an UNORDERED, public zone — there is no top card to be forced onto, and any
 *    subset of the eligible cards is an equally legal answer.
 * Rules: 355.10.a.1 (trashes are Public, so their cards are ordinary chooseable objects),
 *        355.10.d.2 (a lone candidate is still a choice), 355.13 ("up to N" may be answered with fewer),
 *        416 (Recycle = to the bottom of the owner's Main Deck).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGE = "ogn-212-298";
const JUNK = (n: number) => ({ cardType: "unit", energyCost: 2, might: 2, name: `Junk ${n}` }) as const;

type PickDecision = Extract<Decision, { kind: "pick" }>;

/** P1's turn. Forge in play; four distinct cards sitting in the trashes. */
function board() {
  return scenario()
    .gear(P1, FORGE, "forge")
    .trash(P1, JUNK(1), "t1")
    .trash(P1, JUNK(2), "t2")
    .trash(P1, JUNK(3), "t3")
    .trash(P2, JUNK(4), "t4");
}

/** Activate the Forge and pass priority until the recycle pick is in front of P1. */
async function activateToPick(game: Game): Promise<PickDecision> {
  await game.p1.activate("forge");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      return d as PickDecision;
    }
    if (d?.kind !== "action") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  throw new Error(`no recycle pick appeared: ${JSON.stringify(game.decision())}`);
}

describe("Ruling 8688de5085177845 — the recycler picks which trash cards go back; there is no 'top of trash'", () => {
  test("the harness surfaces a PICK listing every eligible card in the trashes — the player is asked, not handed a fixed card", async () => {
    const game = await board().build();
    const d = await activateToPick(game);
    expect(d.seat).toBe(P1);
    const keys = d.options.map((o) => o.card ?? o.key).sort();
    // The Forge itself is in the trash by now (it was the cost), so it is on the list too.
    expect(keys).toEqual(["forge", "t1", "t2", "t3", "t4"]);
    expect(d.min).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("picking t2 and t4 recycles exactly those two — the rest stay in the trash", async () => {
    const game = await board().build();
    await activateToPick(game);
    await game.p1.pick("t2", "t4");
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.zoneOf("t2")).toBe("mainDeck");
    expect(game.zoneOf("t4")).toBe("mainDeck");
    expect(game.p2.deck()).toContain("t4"); // back to its OWNER's deck
    expect(game.zoneOf("t1")).toBe("trash");
    expect(game.zoneOf("t3")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a different subset is equally legal from the same position: t1 and t3 instead", async () => {
    const game = await board().build();
    await activateToPick(game);
    await game.p1.pick("t1", "t3");
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.zoneOf("t1")).toBe("mainDeck");
    expect(game.zoneOf("t3")).toBe("mainDeck");
    expect(game.zoneOf("t2")).toBe("trash");
    expect(game.zoneOf("t4")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("'up to 4' may be answered with zero — nothing is forced out of the trash (355.13)", async () => {
    const game = await board().build();
    await activateToPick(game);
    await game.p1.decline();
    await game.settle();
    for (const c of ["t1", "t2", "t3"]) {
      expect(game.zoneOf(c)).toBe("trash");
    }
    expect(game.zoneOf("t4")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
