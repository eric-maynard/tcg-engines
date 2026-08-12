/**
 * Interaction: Sigil of the Storm (ogn-287-298) "When you conquer here, you must recycle one of
 *   your runes. (This doesn't choose anything.)"
 *   × Battle Mistress (sfd-203-221, Legend) "When you recycle a rune, you may exhaust me to play a
 *     Gold gear token exhausted. When one or more enemy units die, ready me."
 *   × Vi, Destructive (ogn-036-298) "[Ganking] …"
 *
 * Question: both seats trade the Sigil back and forth for ten consecutive turns.
 *  (a) Does each Conquer cost the conquering seat exactly one rune — and what happens on the turn a
 *      seat controls zero runes: is the Conquer blocked, or is the impossible instruction ignored?
 *  (b) Does Battle Mistress fire on every Sigil recycle, including the turns she is already
 *      exhausted (she readies only when one or more enemy units die)?
 *  (c) A seat conquers, loses the Sigil, then takes it back in the SAME turn — second point? second
 *      rune recycle?
 *  (d) After ten turns, is rune accounting exact?
 *
 * Rules:
 *  - 469.1 — Conquer = gaining control of a battlefield you did not YET SCORE this turn.
 *  - 470 — a player Scores at most once per battlefield per turn; 471.2.c — a later control change
 *    that turn is not a Score, so "when you conquer here" does not fire again.
 *  - 416 / 416.6 — the chosen rune goes to the bottom of its owner's Rune Deck.
 *  - 055 — an instruction that is impossible is simply ignored; nothing else about the turn changes.
 *  - 383.3.a / 383.3.b — a "you may <pay a cost> to …" trigger is settled at FINALIZATION: the cost
 *    is the base cost, and an unpayable one means the option is never offered (404.2).
 *  - 319.6 / 323.6 — a battlefield whose controller has no unit there loses its controller at the
 *    next Open-State Cleanup, which is how control genuinely changes hands here.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, type Seat, scenario } from "../../../harness";

const SIGIL = "ogn-287-298";
const VI = "ogn-036-298"; // 3 Might [Ganking] champion
const BATTLE_MISTRESS = "sfd-203-221";
const HEXTECH_RAY = "ogn-009-298"; // [Action] · 1 + [fury] · deal 3 to a unit at a battlefield

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function board() {
  return scenario()
    .victoryScore(50) // the game must not end mid-experiment
    .battlefield("bf1", { controller: null, def: SIGIL, inert: false })
    .unit(P1, "base", VI, "vi1")
    .unit(P2, "base", VI, "vi2")
    .legend(P1, BATTLE_MISTRESS, "mistress")
    .runes(P1, "fury", 4)
    .runes(P2, "fury", 4);
}

/** board runes + rune deck — the invariant "no rune is duplicated or lost". */
function runeTotal(game: Game, seat: Seat): number {
  return game.seat(seat).runes().length + game.seat(seat).runeDeck().length;
}

/** Answer whatever the Sigil / Battle Mistress raise: recycle the first rune, decline the exhaust. */
async function answerSigil(game: Game, seat: Seat, opts: { exhaustMistress?: boolean } = {}): Promise<void> {
  for (let guard = 0; guard < 6; guard++) {
    await game.settle();
    const d = game.seat(seat).decision();
    if (d?.kind === "pick") {
      await game.seat(seat).pick((d.options[0] as { key: string }).key);
    } else if (d?.kind === "yes-no") {
      await (opts.exhaustMistress ? game.seat(seat).yes() : game.seat(seat).no());
    } else {
      return;
    }
  }
}

describe("Sigil of the Storm re-conquered — ten turns of rune drain", () => {
  test("(a) one Conquer = exactly one rune off the board and onto the bottom of that seat's Rune Deck; the pick is forced", async () => {
    const game = await board().build();
    const totalBefore = runeTotal(game, P1);
    await game.p1.move("vi1", "bf1"); // 469.1 — Conquer
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    await game.p1.pick("k1");
    await answerSigil(game, P1);
    expect(game.p1.runes()).toEqual(["k2", "k3", "k4"]);
    expect(game.p1.runeDeck().at(-1)).toBe("k1"); // 416 — the bottom
    expect(runeTotal(game, P1)).toBe(totalBefore); // conserved
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(a) with ZERO runes the Conquer is NOT blocked — the impossible instruction is just ignored (055)", async () => {
    const game = await scenario()
      .victoryScore(50)
      .battlefield("bf1", { controller: null, def: SIGIL, inert: false })
      .unit(P1, "base", VI, "vi1")
      .legend(P1, BATTLE_MISTRESS, "mistress")
      .build();
    expect(game.p1.runes()).toEqual([]);
    await game.p1.move("vi1", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("open"); // no prompt, no freeze
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the Conquer stands
    expect(game.p1.points()).toBe(1); // and so does the point
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
    await game.p1.endTurn(); // the rest of the turn is unaffected
  });

  test("(b) Battle Mistress fires on the Sigil recycle and may exhaust for an EXHAUSTED Gold gear token", async () => {
    const game = await board().build();
    await game.p1.move("vi1", "bf1");
    await game.settle();
    await game.p1.pick("k1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("mistress").isExhausted).toBe(true);
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.state(game.p1.gear()[0]!).isExhausted).toBe(true);
  });

  test("(b) while she is ALREADY exhausted the option is not offered at all — the cost rides on finalization (383.3.a/b, 404.2)", async () => {
    const game = await board().build();
    // Exhaust her on an earlier rune recycle in the same turn…
    await game.p1.recycleRune("k1", "fury");
    await game.p1.yes();
    await game.settle();
    expect(game.state("mistress").isExhausted).toBe(true);
    expect(game.p1.gear()).toHaveLength(1);

    // …then conquer. The rune is still recycled, but no "you may exhaust me" appears.
    await game.p1.move("vi1", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // the forced Sigil recycle
    await game.p1.pick("k2");
    expect(game.decision()?.kind).not.toBe("yes-no"); // unpayable ⇒ removed unasked
    await game.settle();
    expect(game.p1.gear()).toHaveLength(1); // still exactly one Gold token
    expect(game.zoneOf("k2")).toBe("runeDeck"); // the mandatory recycle happened anyway
    expect(game.violations()).toEqual([]);
  });

  test("(b) she readies only when one or more enemy units die — being exhausted is otherwise permanent for the turn", async () => {
    const game = await board()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 1, name: "Chump" }, "chump")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.recycleRune("k1", "fury");
    await game.p1.yes();
    await game.settle();
    expect(game.state("mistress").isExhausted).toBe(true);

    // A rune recycle alone does not ready her, and neither does anything short of an enemy death.
    await game.p1.recycleRune("k2", "fury");
    await game.settle();
    expect(game.state("mistress").isExhausted).toBe(true);

    await game.p1.cast("ray", { targets: "chump" });
    await game.settle();
    expect(game.zoneOf("chump")).toBe("trash");
    expect(game.state("mistress").isExhausted).toBe(false); // "when one or more enemy units die, ready me"
    expect(game.violations()).toEqual([]);
  });

  test("(c) conquer, lose it, take it back in the SAME turn: no second point and no second Sigil trigger (469.1 / 470 / 471.2.c)", async () => {
    const game = await board()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.move("vi1", "bf1"); // Conquer #1
    await game.settle();
    await game.p1.pick("k1");
    await answerSigil(game, P1);
    expect(game.p1.points()).toBe(1);
    const runesAfterFirst = [...game.p1.runes()];

    // Kill my own holder: bf1 empties, so its controller lapses at the next Open Cleanup (323.6).
    await game.p1.cast("ray", { targets: "vi1" });
    await game.settle();
    expect(game.zoneOf("vi1")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();

    // Walk back in during the same turn: control is regained, but bf1 was already Scored this turn.
    await game.p1.move("spare", "bf1");
    const stop = await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(stop.reason).toBe("open"); // 471.2.c — not a Conquer ⇒ no Sigil prompt at all
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.p1.points()).toBe(1); // 470 — at most one Score per battlefield per turn
    expect(game.p1.runes()).toEqual(runesAfterFirst); // and no second rune recycled
    expect(game.violations()).toEqual([]);
  });

  test("(d) ten consecutive turns of trading the Sigil: runes conserved, points only ever go up, invariants silent", async () => {
    const game = await board().build();
    const startTotalP1 = runeTotal(game, P1);
    const startTotalP2 = runeTotal(game, P2);
    let p1Points = 0;
    let p2Points = 0;

    for (let turn = 0; turn < 10; turn++) {
      const seat = game.turnPlayer();
      const hand = game.seat(seat);
      const mine = seat === P1 ? "vi1" : "vi2";
      const controller = game.gameState.battlefields.bf1?.controller ?? null;
      if (game.locationOf(mine) === "bf1") {
        // Retreat: the battlefield empties and control lapses at the Open Cleanup (319.6/323.6).
        await hand.move(mine, "base");
        await answerSigil(game, seat);
        expect(game.gameState.battlefields.bf1?.controller).toBeNull();
      } else if (controller === null) {
        // Walk in: Conquer, score, and pay the Sigil's rune.
        await hand.move(mine, "bf1");
        await answerSigil(game, seat);
        expect(game.gameState.battlefields.bf1?.controller).toBe(seat);
      }
      // Nobody's rune count may drift, and nothing may go negative, at any point.
      expect(runeTotal(game, P1)).toBe(startTotalP1);
      expect(runeTotal(game, P2)).toBe(startTotalP2);
      expect(game.p1.energy()).toBeGreaterThanOrEqual(0);
      expect(game.p2.energy()).toBeGreaterThanOrEqual(0);
      expect(game.p1.points()).toBeGreaterThanOrEqual(p1Points);
      expect(game.p2.points()).toBeGreaterThanOrEqual(p2Points);
      p1Points = game.p1.points();
      p2Points = game.p2.points();
      await game.advanceTurn();
      await answerSigil(game, game.turnPlayer());
    }

    expect(game.turnNumber()).toBe(12); // started on turn 2, ran ten turns
    expect(game.isOver()).toBe(false);
    expect(runeTotal(game, P1)).toBe(startTotalP1);
    expect(runeTotal(game, P2)).toBe(startTotalP2);
    // Both seats actually took the Sigil at least once during the run.
    expect(p1Points).toBeGreaterThan(0);
    expect(p2Points).toBeGreaterThan(0);
    expect(game.violations()).toEqual([]);
  });
});
