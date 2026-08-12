/**
 * Interaction: Qiyana, Victorious (ogn-155-298) "[Deflect] / When I conquer, draw 1 or channel 1
 *              rune exhausted."
 *            × Blitzcrank, Impassive (ogn-067-298) "[Tank] / When you play me to a battlefield,
 *              you may move an enemy unit to here. / When I hold, return me to my owner's hand."
 *
 * Q: P1 moves Qiyana into an uncontested enemy battlefield, opening a non-combat Showdown, and
 *    wants to pull an enemy unit in with Blitzcrank before it closes. A help modal teaches the
 *    hotkey as "Q — End showdown / conquer the battlefield".
 *    (a) Does closing the showdown conquer, and does Qiyana's trigger fire, when an enemy unit is
 *        standing there? (b) When only P1's units remain? (c) When P1 already scored this
 *        battlefield this turn?
 *
 * Rules:
 *   348        all players pass Focus without acting ⇒ the Showdown Closes
 *   348.1      …and if it is a COMBAT Showdown, combat resolves instead of 348.2
 *   348.2      the non-combat close, whose only step is:
 *   348.2.a    control is established ONLY if just one player's Units remain there
 *   348.2.a.1  …and that is a Conquer only if that player has not yet Scored it this turn
 *   469.1      Conquer = gaining Control of a Battlefield you did not yet Score this turn
 *   466.5.d    the combat-side twin of 348.2.a.1
 *   190.4.c    control is not lost while a Showdown/Combat is ongoing there
 *   347.1      during a Showdown the player with Focus may play a card that is LEGALLY TIMED —
 *              a unit (standard timing) is not one, so Blitzcrank cannot enter this window
 *   159.2.a.1  [Action] is what extends play into Showdown Open States; Blitzcrank has neither
 *
 * Head-judge summary: closing a showdown and conquering are DIFFERENT events. A UI that labels the
 * close "conquer" is wrong in two of the three cases below.
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const QIYANA = "ogn-155-298";
const BLITZCRANK = "ogn-067-298";

/**
 * P1's turn. bfA is the enemy battlefield Qiyana walks into; bfB is P1's own (with an anchor unit,
 * so its control is durable). `guard` seeds an enemy unit AT bfA when a Might is given.
 */
function board(guardMight?: number) {
  const s = scenario()
    .active(P1)
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfB", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "base", QIYANA, "qiyana")
    .unit(P2, "base", { might: 2, name: "Pawn" }, "pawn")
    .hand(P1, BLITZCRANK, "blitz");
  if (guardMight !== undefined) {
    s.unit(P2, "bfA", { might: guardMight, name: "Guard" }, "guard");
  }
  return s;
}

/** What the close actually did, in the three terms a log line has to distinguish. */
function outcome(game: Game) {
  return {
    controller: game.gameState.battlefields.bfA?.controller ?? null,
    points: game.p1.points(),
    scored: [...(game.gameState.scoredThisTurn[P1] ?? [])],
  };
}

describe("Closing a showdown is not conquering — Qiyana, Victorious × Blitzcrank, Impassive", () => {
  test("(b) only P1's units remain ⇒ control is established, that IS a Conquer, 1 point, and Qiyana's trigger goes on the Chain (348, 348.2.a, 348.2.a.1, 469.1)", async () => {
    const game = await board().build();
    // Unit-less seeded control lapses at the first Open Cleanup, so bfA is uncontrolled by the
    // time Qiyana arrives — nobody's units but P1's are ever there.
    await game.p1.move("qiyana", "bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()?.prompt).toMatch(/Focus/);
    await game.settle();

    expect(outcome(game)).toEqual({ controller: P1, points: 1, scored: ["bfA"] });
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.seat).toBe(P1);
    expect(d.options.map((o) => o.label)).toEqual(["Draw 1", "Channel 1 rune exhausted"]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the conquer trigger's mode is chosen on resolution and actually does its thing", async () => {
    const draws = await board().build();
    await draws.p1.move("qiyana", "bfA");
    await draws.settle();
    const handBefore = draws.p1.hand().length;
    await draws.p1.chooseMode(0);
    await draws.settle();
    expect(draws.p1.hand()).toHaveLength(handBefore + 1);

    const channels = await board().build();
    await channels.p1.move("qiyana", "bfA");
    await channels.settle();
    const runesBefore = channels.p1.runes().length;
    await channels.p1.chooseMode(1);
    await channels.settle();
    expect(channels.p1.runes()).toHaveLength(runesBefore + 1);
    expect(channels.p1.runes({ ready: true })).toHaveLength(runesBefore); // channelled EXHAUSTED
  });

  test("the posed premise is refused: a unit is not legally timed inside a Showdown, so Blitzcrank cannot be played there (347.1, 159.2.a.1)", async () => {
    const game = await board().build();
    await game.p1.move("qiyana", "bfA");
    expect(game.actingSeat()).toBe(P1);
    // The Focus menu holds nothing but Pass (and Concede) — no play of any kind.
    expect(game.p1.legal().map((o) => o.verb).toSorted()).toEqual(["concede", "passFocus"]);
    expect(game.p1.can("play", "blitz")).toBe(false);
    const r = await game.p1.try((p) => p.play("blitz", { to: "bfA" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("blitz")).toBe("hand");
    // The showdown is untouched by the refused click.
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, showdownComplete: false });
  });

  test("…and Blitzcrank could never be played TO bfA in any window: a unit's destinations are base plus battlefields its controller CONTROLS", async () => {
    const game = await board().build();
    const location = game.p1.option("play", "blitz")?.fields.find((f) => f.arg === "to");
    expect(location?.options).toEqual(["base", "battlefield-bfB"]);
    expect(location?.options).not.toContain("battlefield-bfA");
  });

  test("Blitzcrank's pull is real where it is legal — played to P1's own bfB he drags the enemy Pawn to here", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "bfB" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("pawn")).not.toBe("base"); // dragged to bfB, then killed by the combat there
    expect(game.locationOf("blitz")).toBe("bfB");
    expect(game.violations()).toEqual([]);
  });

  test("(a) NO conquer with an enemy unit standing there: bfA stays P2's, P1 scores nothing and Qiyana never triggers (348.2.a, 190.4.c)", async () => {
    // An enemy unit at the battlefield means this is a COMBAT Showdown (344.1), so 348.1 routes to
    // combat rather than 348.2 — but the invariant the button gets wrong is the same one: closing
    // the showdown does not hand the battlefield over. The 9-Might Guard survives Qiyana's 4.
    const game = await board(9).build();
    const handBefore = game.p1.hand().length;
    const runesBefore = game.p1.runes().length;
    await game.p1.move("qiyana", "bfA");
    await game.settle();

    expect(outcome(game)).toEqual({ controller: P2, points: 0, scored: [] });
    expect(game.zoneOf("guard")).toBe("battlefield-bfA");
    expect(game.zoneOf("qiyana")).toBe("trash");
    expect(game.chain()).toEqual([]); // "when I conquer" never fired
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) contrast — the SAME close conquers once the enemy unit is gone: a 2-Might Guard dies and P1 takes the battlefield with the point", async () => {
    const game = await board(2).build();
    await game.p1.move("qiyana", "bfA");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(outcome(game)).toEqual({ controller: P1, points: 1, scored: ["bfA"] });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // Qiyana's mode
  });

  test("(c) already Scored this turn: control is established AGAIN, but there is no Conquer, no point and Qiyana stays silent (348.2.a.1, 469.1)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", QIYANA, "qiyana")
      .build();
    await game.advanceTurn(); // → P1's turn: the Hold at bfA Scores it
    expect(outcome(game)).toEqual({ controller: P1, points: 1, scored: ["bfA"] });
    const handBefore = game.p1.hand().length;
    const runesBefore = game.p1.runes().length;

    await game.p1.move("holder", "base"); // bfA empties and control lapses
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    await game.p1.move("qiyana", "bfA"); // non-combat showdown at an uncontrolled battlefield
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1 });
    await game.settle();

    // Control comes back…
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    // …but 348.2.a.1 / 469.1 both require a battlefield not yet Scored this turn.
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bfA"]);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("teaching: the three closes end in three DISTINCT states, so the log can name which happened instead of always saying 'conquered'", async () => {
    const enemyPresent = await board(9).build();
    await enemyPresent.p1.move("qiyana", "bfA");
    await enemyPresent.settle();

    const sole = await board().build();
    await sole.p1.move("qiyana", "bfA");
    await sole.settle();

    const alreadyScored = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", QIYANA, "qiyana")
      .build();
    await alreadyScored.advanceTurn();
    await alreadyScored.p1.move("holder", "base");
    await alreadyScored.p1.move("qiyana", "bfA");
    await alreadyScored.settle();

    expect(outcome(enemyPresent)).toEqual({ controller: P2, points: 0, scored: [] }); // no control
    expect(outcome(sole)).toEqual({ controller: P1, points: 1, scored: ["bfA"] }); // conquer + point
    expect(outcome(alreadyScored)).toEqual({ controller: P1, points: 1, scored: ["bfA"] }); // control, no new point
    // The discriminator between the last two is the trigger, not the controller: only a real
    // Conquer wakes Qiyana.
    expect((sole.decision() as ActionDecision | PickDecision).kind).toBe("pick");
    expect((alreadyScored.decision() as ActionDecision).kind).toBe("action");
  });
});
