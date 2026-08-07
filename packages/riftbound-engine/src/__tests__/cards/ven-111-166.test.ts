/**
 * Minah Swiftfoot — ven-111-166 · Unit · Chaos · 6 energy + [chaos] · 6 Might
 *
 *   When I move to a battlefield, choose one —
 *     • Each player discards 1.
 *     • Each player draws 1.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Only a move whose DESTINATION is a battlefield triggers (447 / ogn-222 ruling): base → bf yes,
 *     bf → base no, and being PLAYED onto the board is not a move at all (446.2).
 *  2. The mode is chosen by Minah's controller when the trigger resolves; it is symmetric — "each
 *     player" — so the opponent draws / discards too. Each player picks their OWN discard (419).
 *  3. 422.4 — a player with an empty hand simply skips the discard; the other player still discards.
 *  4. Moving into an enemy-occupied battlefield: the trigger is put on the chain and resolves BEFORE
 *     combat damage, so both players have already drawn when the 6-Might Minah fights.
 *  5. Moved by a spell (Ride the Wind) rather than her Standard Move still counts as moving (449).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-111-166";
const FILLER = "ogn-175-298"; // vanilla 3-Might unit used as hand/deck cards
const RIDE_THE_WIND = "ogn-173-298"; // [Action] 2 + [chaos]: Move a friendly unit and ready it.

function board(p1Hand: string[] = ["p1junk"], p2Hand: string[] = ["p2junk"]) {
  const b = scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "minah")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .deckTop(P1, FILLER, "p1top")
    .deckTop(P2, FILLER, "p2top");
  for (const a of p1Hand) {
    b.hand(P1, FILLER, a);
  }
  for (const a of p2Hand) {
    b.hand(P2, FILLER, a);
  }
  return b;
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Move Minah to `to`, expect the mode prompt for P1 and take `mode` (0 = discard, 1 = draw). */
async function moveAndChoose(game: Game, to: string, mode: 0 | 1) {
  await game.p1.move("minah", to);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "minah", controller: P1, triggered: true })]);
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" && d.options.length).toBe(2);
  await game.p1.chooseMode(mode);
  await game.settle();
}

/** Answer any per-player discard picks: each seat throws away the card aliased `<seat>junk`. */
async function answerDiscards(game: Game) {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick") {
      return;
    }
    await game.seat(d.seat).pick(d.seat === P1 ? "p1junk" : "p2junk");
    await game.settle();
  }
}

describe("Minah Swiftfoot (ven-111-166)", () => {
  test("costs 6 energy + 1 chaos power; 6-Might unit enters the base and playing her is NOT a move (no trigger)", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { chaos: 1 } }).hand(P1, CARD, "minah").hand(P2, FILLER, "p2junk").build();
    await game.p1.play("minah");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("minah")).toBe("base");
    expect(game.state("minah")).toMatchObject({ baseMight: 6, might: 6 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand()).toEqual(["p2junk"]);
  });

  test("cost negative space: 6 energy without chaos power, or 5 energy + chaos → not playable", async () => {
    const noPower = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).hand(P1, CARD, "minah").build();
    expect(noPower.p1.can("play", "minah")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).hand(P1, CARD, "minah").build();
    expect(noEnergy.p1.can("play", "minah")).toBe(false);
  });

  test("moving to an open battlefield triggers; mode 'each player draws 1' → both hands grow by exactly one (their own top card)", async () => {
    const game = await board().build();
    await moveAndChoose(game, "bf1", 1);
    expect(game.locationOf("minah")).toBe("bf1");
    expect(game.p1.hand().sort()).toEqual(["p1junk", "p1top"]);
    expect(game.p2.hand().sort()).toEqual(["p2junk", "p2top"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // BUG — expected (419): mode 1 makes EACH player discard 1 — with one card each, p1junk and p2junk
  // both end in their owners' trashes and nobody draws. Actual: the discard mode parsed as raw text
  // (`{type:"raw"}`), so choosing it does nothing.
  test("mode 'each player discards 1' → each player puts one card from hand into their own trash", async () => {
    const game = await board().build();
    await moveAndChoose(game, "bf1", 0);
    await answerDiscards(game);
    expect(game.zoneOf("p1junk")).toBe("trash");
    expect(game.zoneOf("p2junk")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("p1top"); // nothing drawn
  });

  // BUG — expected: with several cards each player CHOOSES their own discard (P2 answers for P2's
  // hand); the kept cards stay. Actual: raw mode, no prompts, nothing discarded.
  test("discard mode with 2 cards each — each player picks their own card; the other card stays in hand", async () => {
    const game = await board(["p1keep", "p1junk"], ["p2keep", "p2junk"]).build();
    await moveAndChoose(game, "bf1", 0);
    await answerDiscards(game);
    expect(game.zoneOf("p1junk")).toBe("trash");
    expect(game.zoneOf("p2junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["p1keep"]);
    expect(game.p2.hand()).toEqual(["p2keep"]);
  });

  // BUG — expected (422.4): P1 has no hand → P1 skips, but P2 still discards p2junk. Actual: raw mode.
  test("discard mode when you have no cards — you skip it, the opponent still discards", async () => {
    const game = await board([], ["p2junk"]).build();
    await moveAndChoose(game, "bf1", 0);
    await answerDiscards(game);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("p2junk")).toBe("trash");
  });

  test("moving from a battlefield back to base does NOT trigger (destination must be a battlefield)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "minah")
      .hand(P1, FILLER, "p1junk")
      .hand(P2, FILLER, "p2junk")
      .build();
    await game.p1.move("minah", "base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.locationOf("minah")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.hand()).toEqual(["p1junk"]);
    expect(game.p2.hand()).toEqual(["p2junk"]);
  });

  test("another unit's move to a battlefield does not trigger her", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["p1junk"]);
    expect(game.p2.hand()).toEqual(["p2junk"]);
  });

  test("moving into an enemy-held battlefield: the trigger resolves (both draw) BEFORE combat; then 6-Might Minah kills the 4-Might guard and conquers", async () => {
    const game = await board().build();
    await moveAndChoose(game, "bf2", 1);
    // Draws already happened; combat then resolved via settle().
    expect(game.p1.hand().sort()).toEqual(["p1junk", "p1top"]);
    expect(game.p2.hand().sort()).toEqual(["p2junk", "p2top"]);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("minah")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("moved by a spell (Ride the Wind) to a battlefield still triggers the mode choice", async () => {
    const game = await board()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "minah" });
    await game.settle();
    // Destination prompt for the spell's move, if the engine asks for it.
    if (game.decision()?.kind === "pick" && (game.decision() as { semantics?: string }).semantics === "destination") {
      await game.p1.pick("bf1");
      await game.settle();
    } else if (game.decision()?.kind === "pick" && (game.decision() as { options: { key: string }[] }).options.some((o) => o.key.includes("bf1"))) {
      const opt = (game.decision() as { options: { key: string }[] }).options.find((o) => o.key.includes("bf1"));
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
      await game.settle();
    }
    expect(game.locationOf("minah")).toBe("bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.chooseMode(1);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["p1junk", "p1top"]);
    expect(game.p2.hand().sort()).toEqual(["p2junk", "p2top"]);
  });

  test("draw mode is truly 'each player': with both hands empty, each player ends with exactly their own top card", async () => {
    const game = await board([], []).build();
    await moveAndChoose(game, "bf1", 1);
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.p2.hand()).toEqual(["p2top"]);
  });

  test("parsed abilities: one move-to-battlefield self trigger whose effect is a 2-option choice (discard-each / draw-each)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 6, might: 6, name: "Minah Swiftfoot", powerCost: ["chaos"] });
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; trigger: unknown; effect: { type: string; options: { effect: { type: string; player?: string; amount?: number } }[] } };
    expect(ab).toMatchObject({ trigger: { event: "move-to-battlefield", on: "self" }, type: "triggered" });
    expect(ab.effect.type).toBe("choice");
    expect(ab.effect.options).toHaveLength(2);
    expect(ab.effect.options[1]?.effect).toMatchObject({ amount: 1, player: "each", type: "draw" });
  });

  // BUG — expected: option 1 is a structured `discard` for each player (amount 1). Actual: raw text.
  test("the 'Each player discards 1' mode is parsed as a discard effect (player: each, amount 1), not raw text", async () => {
    const ab = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as { effect: { options: { effect: { type: string; player?: string; amount?: number } }[] } };
    expect(ab.effect.options[0]?.effect).toMatchObject({ amount: 1, player: "each", type: "discard" });
  });
});
