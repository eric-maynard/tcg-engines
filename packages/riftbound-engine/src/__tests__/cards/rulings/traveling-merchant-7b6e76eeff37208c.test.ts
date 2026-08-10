/**
 * Ruling 7b6e76eeff37208c — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · 1 + [chaos] · "Return a unit at a battlefield with 3 [Might] or less to its owner's
 *   hand."   (Cleave ogn-004-298 is only mentioned as a way to bring bigger units into Gust range.)
 *
 * Q: The Merchant moves to a battlefield and its move trigger goes on the chain; the opponent Gusts it away in response.
 *    Does the discard/draw still resolve?
 * A: Yes. The trigger is already on the chain and resolves regardless of the Merchant leaving the board. Nuance: while the
 *    trigger is pending the Merchant is not yet an attacker — the showdown/combat cannot start until the chain is empty.
 * Rules: 359 (a chain item resolves independently of its source), 340.1 (LIFO), 323.9 / 344 (staged showdown opens only on
 *        an empty chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const GUST = "ogn-169-298";

/** P1's turn 3. P2 holds bf1 with a 4-Might Guard and has Gust + 1 + [chaos]. P1: ready Merchant in base, hand = two Junk cards. */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junkA")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junkB")
    .hand(P2, GUST, "gust")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

async function merchantMovesIn(game: Game): Promise<void> {
  await game.p1.move("merchant", "bf1");
  expect(game.locationOf("merchant")).toBe("bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
}

describe("Ruling 7b6e76eeff37208c — Gusting the Merchant in response does not stop its discard/draw", () => {
  test("nuance: with the move trigger pending the state is a CHAIN window (no showdown open yet) and the Merchant is not yet an attacker", async () => {
    const game = await board().build();
    await merchantMovesIn(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(showdown(game)).toBeUndefined();
    expect(game.state("merchant").combatRole).not.toBe("attacker");
    expect(game.p1.hand().toSorted()).toEqual(["junkA", "junkB"]); // nothing discarded/drawn yet
  });

  test("P2 Gusts the Merchant in response (legal: Reaction, 2 Might ≤ 3, at a battlefield); LIFO returns it to P1's hand first — the trigger stays on the chain", async () => {
    const game = await board().build();
    await merchantMovesIn(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "merchant" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "gust"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant"]);
  });

  test("the trigger then resolves anyway: P1 is asked which card to discard, discards it and draws 1; no showdown/combat ever happens and P2 keeps bf1", async () => {
    const game = await board().build();
    await merchantMovesIn(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "merchant" });
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = game.decision()?.kind === "pick" ? (game.decision() as Extract<ReturnType<Game["decision"]>, { kind: "pick" }>).options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("junkA");
    await game.p1.pick("junkA");
    await game.settle();
    expect(game.zoneOf("junkA")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "junkB", "merchant"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("guard").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
