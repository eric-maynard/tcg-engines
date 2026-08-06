/**
 * Ruling 23c9277d071cd1f7 — Promising Future (OGN-115 → ogn-115-298)
 *   Spell · Mind · 5 + [mind]: "Each player looks at the top 5 cards of their Main Deck, banishes one of
 *    them, then recycles the rest. Starting with the next player, each player plays those cards, ignoring
 *    Energy costs. (They must still pay Power costs.)"
 *   × Wind Wall (ogn-064-298) [Reaction] 3 + [calm][calm]: "Counter a spell."
 *   × Stupefy (ogn-095-298) [Reaction] 1: "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *
 * Q: Can a counterspell chosen with Promising Future counter another chosen card?
 * A: Yes — if it finalizes after an eligible spell and has a legal target then. Banishing is a public first
 *    pass; counterspell targets are chosen only when it is finalized. In 2p, the turn player's counterspell
 *    is seen by the opponent before they choose; the opponent's card is queued and finalized FIRST, then
 *    the turn player's counterspell (newer, resolves first) may target and counter it. If the opponent
 *    instead picks a permanent (or an un-targetable spell), the counterspell has no legal target, cannot be
 *    finalized, and returns to banishment.
 * Rules: 355.5, 355.8, 358.5, 337.1.b, 340.1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const WIND_WALL = "ogn-064-298";
const STUPEFY = "ogn-095-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future ${n}` });

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1: exactly 5 + [mind] for Promising Future plus [calm][calm] for Wind Wall's POWER cost (its
 * 3 Energy is ignored). P1's top 5: Wind Wall + four 3-cost units. P2's top 5: Stupefy, a 3-cost unit
 * "b-unit", and three more units; P2 has NO resources (Stupefy's [1] is ignored; the unit's 3 too).
 * P2's 9-Might Wall at bf1 is Stupefy's would-be target.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1, calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .deck(P1, [WIND_WALL, U(2), U(3), U(4), U(5), U(6)], ["windwall", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [STUPEFY, U(2), U(3), U(4), U(5), U(6)], ["stupefy", "bUnit", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

const keysOf = (d: Decision | null) => (d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Cast Promising Future and resolve it up to the first look-at-5 prompt (P1's). */
async function castToFirstPass(game: Game): Promise<Pick> {
  await game.p1.cast("pf", { answers: [] });
  expect(game.p1.energy()).toBe(0);
  expect(game.p1.power("mind")).toBe(0);
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(keysOf(d).sort()).toEqual(["a2", "a3", "a4", "a5", "windwall"]);
  return d as Pick;
}

describe("Ruling 23c9277d071cd1f7 — a counterspell banished with Promising Future can counter the opponent's chosen spell", () => {
  test("Promising Future is castable on P1's turn for 5 + [mind] and goes on the chain", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "pf")).toBe(true);
    await game.p1.cast("pf", { answers: ["wall"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["pf"]);
  });

  // Expected: first pass — P1 (turn player) is shown a1..a5 and banishes Wind Wall; that choice is public, THEN
  // P2 is shown b1..b5 and chooses. The other four of each go to the bottom (a6 / b6 on top).
  // Actual: Promising Future resolves with no look/banish/recycle step at all (decks untouched).
  test("ruling 23c9277d071cd1f7 — first pass: P1 picks (Wind Wall → banishment) BEFORE P2 is asked; rest recycled; engine has no such step", async () => {
    const game = await board().build();
    await castToFirstPass(game);
    await game.p1.pick("windwall");
    // P1's choice is already public/banished when P2 gets to look.
    expect(game.zoneOf("windwall")).toBe("banishment");
    const d2 = game.decision();
    expect(d2).toMatchObject({ kind: "pick", seat: P2 });
    expect(keysOf(d2).sort()).toEqual(["b3", "b4", "b5", "bUnit", "stupefy"]);
    await game.p2.pick("stupefy");
    expect(game.p1.deck()[0]).toBe("a6");
    expect(game.p1.deck().slice(-4).sort()).toEqual(["a2", "a3", "a4", "a5"]);
    expect(game.p2.deck()[0]).toBe("b6");
    expect(game.p2.deck().slice(-4).sort()).toEqual(["b3", "b4", "b5", "bUnit"]);
  });

  // Expected: second pass starts with the NEXT player: P2's Stupefy is queued/finalized first (P2 chooses the
  // Wall, pays no Energy), then P1's Wind Wall is finalized — its target is chosen NOW (355.5) and Stupefy is a
  // legal one. Wind Wall (P1 pays only [calm][calm]) is newer → resolves first (340.1) and counters Stupefy:
  // the Wall keeps 9 Might, P2 draws nothing; both spells end in their owners' trash, banishments empty.
  // Actual: none of this exists in the engine.
  test.failing("BUG: ruling 23c9277d071cd1f7 — P2's Stupefy finalizes first, then P1's Wind Wall targets and COUNTERS it (Wall stays 9, P2 draws 0); engine does not implement the play pass", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await castToFirstPass(game);
    await game.p1.pick("windwall");
    await game.p2.pick("stupefy");
    // Drive the play pass: answer target prompts as they come — P2 first (Stupefy → wall), then P1 (Wind Wall → stupefy).
    let sawP2First = false;
    for (let i = 0; i < 6; i++) {
      const stop = await game.settle();
      if (stop.reason !== "unanswered") {
        break;
      }
      const d = game.decision() as Decision;
      if (d.seat === P2) {
        expect(sawP2First || !game.chain().some((c) => c.cardId === "windwall")).toBe(true);
        sawP2First = true;
        await game.p2.answer(keysOf(d).includes("wall") ? "wall" : (keysOf(d)[0] as string));
      } else {
        expect(sawP2First).toBe(true); // the turn player's counterspell finalizes AFTER the opponent's card (337.1.b)
        expect(keysOf(d)).toContain("stupefy"); // a legal target exists at finalization (355.5/355.8)
        await game.p1.answer("stupefy");
      }
    }
    expect(sawP2First).toBe(true);
    expect(game.chain()).toEqual([]);
    // Costs: Energy ignored, Power still paid.
    expect(game.p1.power("calm")).toBe(0);
    expect(game.p2.energy()).toBe(0);
    // Stupefy was countered: no -1 Might, no draw.
    expect(game.state("wall").might).toBe(9);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("pf")).toBe("trash");
  });

  // Expected ("The opponent can avoid this…"): P2, having seen Wind Wall, banishes the UNIT instead. P2 plays it
  // for 0 Energy; Wind Wall then has no spell to target → cannot be finalized (355.8), the attempt is undone
  // (358.5) and Wind Wall stays in P1's banishment with P1's [calm][calm] unspent.
  // Actual: not implemented.
  test.failing("BUG: ruling 23c9277d071cd1f7 — if P2 picks a permanent, P1's Wind Wall has no legal target, is not finalized and remains BANISHED (calm unspent); engine does not implement the play pass", async () => {
    const game = await board().build();
    await castToFirstPass(game);
    await game.p1.pick("windwall");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("bUnit");
    // Drive whatever the engine asks (unit destination etc.); Wind Wall must never be offered a target.
    for (let i = 0; i < 6; i++) {
      const stop = await game.settle({ policy: "first" });
      if (stop.reason !== "unanswered") {
        break;
      }
      const d = game.decision() as Decision;
      expect(d.seat === P1 && keysOf(d).length > 0 && d.prompt.toLowerCase().includes("target")).toBe(false);
      await game.seat(d.seat).answer(d.kind === "pick" ? (d.options[0]?.key as string) : "decline");
    }
    expect(game.chain()).toEqual([]);
    // P2's unit was played free of Energy.
    expect(game.p2.units()).toContain("bUnit");
    expect(game.p2.energy()).toBe(0);
    // Wind Wall: never finalized → still banished, nothing paid, not in trash.
    expect(game.zoneOf("windwall")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["windwall"]);
    expect(game.p1.power("calm")).toBe(2);
    expect(game.p1.trash()).not.toContain("windwall");
  });
});
