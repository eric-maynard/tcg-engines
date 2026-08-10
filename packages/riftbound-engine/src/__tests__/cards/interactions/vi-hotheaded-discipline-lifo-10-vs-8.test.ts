/**
 * Interaction: Vi, Hotheaded (unl-030-219) · Champion Unit · Fury · 4 · 3 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *      [2][fury]: Double my Might this turn."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · Reaction
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 432.1 / 432.1.a (Double = increase by the CURRENT value at the moment the doubling
 * resolves; it becomes a fixed +N for the stated duration and never re-scales), 432.2 (limited
 * action), 340.1 (LIFO — the newest finalized chain item resolves first), 337.4 (priority after
 * finalizing), 809 (Deflect taxes only OPPONENTS choosing Vi, by 1 power of any domain).
 *
 * Question: P1's main phase; Vi (3) in base, Discipline in hand.
 *   (a) P1 activates the double and, while it is on the chain, responds with Discipline on Vi:
 *       8 or 10?
 *   (b) The double resolves first, Discipline afterwards: result?
 *   (c) No Discipline, two activations in sequence: 9 or 12? With Discipline between them?
 *   (d) Does P1 pay the Deflect surcharge for its own Discipline? Would P2?
 *   (e) Vi's Might at end of turn in each line?
 * Expected: (a) chain [double][Discipline]; Discipline resolves first → 5, P1 draws 1; the double
 * then sees 5 → +5 → 10. (b) 3 → 6 → 8. (c) 3 → 6 → 12 (each activation is its own [2][fury] and
 * the second doubles the post-first value); with Discipline between: 3 → 6 → 8 → 16. (d) P1 pays
 * exactly 2 for Discipline; P2 would owe 2 + 1 power of any domain and cannot choose Vi without it.
 * (e) every modifier is "this turn": Vi is 3 again after the turn ends; the drawn card stays.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI_HOTHEADED = "unl-030-219";
const DISCIPLINE = "ogn-058-298";
const DOUBLE = 1; // ability index on Vi: #0 = Deflect keyword, #1 = "[2][fury]: Double my Might this turn"

/** P1's turn: Vi (3) in base, Discipline in hand, an ordinary neighbour; P2 holds bf1 with a bystander. */
function board(res: { energy: number; power?: Record<string, number> } = { energy: 4, power: { fury: 1 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Bystander" }, "bystander")
    .unit(P1, "base", VI_HOTHEADED, "vi")
    .unit(P1, "base", { might: 2, name: "Neighbour" }, "neighbour")
    .hand(P1, DISCIPLINE, "disc");
}

const might = (game: Game) => game.state("vi").might;

describe("Vi, Hotheaded × Discipline — doubling reads the CURRENT Might at resolution (LIFO: 10 vs 8)", () => {
  test("setup sanity: Vi is 3 Might with Deflect; P1 can both activate the double and cast Discipline right now", async () => {
    const game = await board().build();
    expect(game.state("vi")).toMatchObject({ baseMight: 3, might: 3, zone: "base" });
    expect(game.state("vi").keywords).toContain("Deflect");
    expect(game.p1.can("activate", "vi")).toBe(true);
    expect(game.p1.can("cast", "disc")).toBe(true);
  });

  // ── (a) Discipline in response to the double → 10 ───────────────────────────────────────────

  test("(a) after activating, P1 still holds priority with the double on the chain and may respond with its own Reaction: chain = [Vi's ability, Discipline on top]", async () => {
    const game = await board().build();
    await game.p1.activate("vi", DOUBLE);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } }); // [2][fury] paid
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: false })]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "vi" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vi", "disc"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "disc", controller: P1, targets: ["vi"], triggered: false });
    expect(might(game)).toBe(3); // nothing has resolved yet
  });

  test("(a) LIFO (340.1): Discipline resolves first (3 → 5, P1 draws 1), then the double sees 5 → +5 → Vi = 10, not 8", async () => {
    const game = await board().build();
    const deck = game.p1.deck().length;
    await game.p1.activate("vi", DOUBLE);
    await game.p1.cast("disc", { targets: "vi" });
    // Step it: both pass → the top item (Discipline) resolves alone.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(might(game)).toBe(5);
    expect(game.p1.hand()).toHaveLength(1); // Discipline gone, drew 1
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["vi"]); // the double still waits
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(might(game)).toBe(10);
    expect(game.state("vi")).toMatchObject({ baseMight: 3, might: 10 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) double first, Discipline afterwards → 8 ─────────────────────────────────────────────

  test("(b) contrast: let the double resolve alone (3 → 6), THEN cast Discipline (+2) → 8 — same two cards, 10 vs 8 purely from resolution order", async () => {
    const game = await board().build();
    await game.p1.activate("vi", DOUBLE);
    await game.settle();
    expect(might(game)).toBe(6);
    await game.p1.cast("disc", { targets: "vi" });
    await game.settle();
    expect(might(game)).toBe(8);
    expect(game.p1.hand()).toHaveLength(1); // drew 1 either way
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(b) the +N from a double is FIXED once created (432.1.a): a later Discipline adds a flat +2 on top of the +3, it does not get doubled retroactively", async () => {
    const game = await board().build();
    await game.p1.activate("vi", DOUBLE);
    await game.settle();
    const afterDouble = might(game); // 6 = 3 + 3
    await game.p1.cast("disc", { targets: "vi" });
    await game.settle();
    expect(might(game) - afterDouble).toBe(2);
  });

  // ── (c) two activations ─────────────────────────────────────────────────────────────────────

  test("(c) two activations in sequence, each paying its own [2][fury]: 3 → 6 → 12 (the second double reads the post-first value — not 9)", async () => {
    const game = await board({ energy: 4, power: { fury: 2 } }).build();
    await game.p1.activate("vi", DOUBLE);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    await game.settle();
    expect(might(game)).toBe(6);
    await game.p1.activate("vi", DOUBLE);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(might(game)).toBe(12);
  });

  test("(c) a second activation is NOT available in response to the first (Closed state) — the two doubles are sequential, never stacked on one chain by P1", async () => {
    const game = await board({ energy: 4, power: { fury: 2 } }).build();
    await game.p1.activate("vi", DOUBLE);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "vi")).toBe(false);
    expect(game.p1.can("cast", "disc")).toBe(true); // a Reaction, by contrast, is fine here
  });

  test("(c) with Discipline cast BETWEEN the two activations: 3 → 6 → 8 → 16", async () => {
    const game = await board({ energy: 6, power: { fury: 2 } }).build();
    await game.p1.activate("vi", DOUBLE);
    await game.settle();
    expect(might(game)).toBe(6);
    await game.p1.cast("disc", { targets: "vi" });
    await game.settle();
    expect(might(game)).toBe(8);
    await game.p1.activate("vi", DOUBLE);
    await game.settle();
    expect(might(game)).toBe(16);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(c) three cheap contrasts of 'current value': 2 activations with Discipline in RESPONSE to the second → 3 → 6 → (8) → 16 as well; Discipline in response to the FIRST → 3 → (5) → 10 → 20", async () => {
    const late = await board({ energy: 6, power: { fury: 2 } }).build();
    await late.p1.activate("vi", DOUBLE);
    await late.settle(); // 6
    await late.p1.activate("vi", DOUBLE);
    await late.p1.cast("disc", { targets: "vi" }); // resolves first: 8, then double: 16
    await late.settle();
    expect(might(late)).toBe(16);

    const early = await board({ energy: 6, power: { fury: 2 } }).build();
    await early.p1.activate("vi", DOUBLE);
    await early.p1.cast("disc", { targets: "vi" }); // 5, then double: 10
    await early.settle();
    expect(might(early)).toBe(10);
    await early.p1.activate("vi", DOUBLE); // sees 10 → 20
    await early.settle();
    expect(might(early)).toBe(20);
  });

  // ── (d) Deflect: own controller free, opponent taxed ────────────────────────────────────────

  test("(d) Deflect taxes OPPONENTS only (809): P1's own Discipline on Vi costs exactly its printed 2 energy — no extra power, even with power available to 'pay' it", async () => {
    const game = await board({ energy: 4, power: { calm: 1, fury: 1 } }).build();
    await game.p1.cast("disc", { targets: "vi" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, fury: 1 } });
    await game.settle();
    expect(might(game)).toBe(5);
    // …and P1 can still afford the double afterwards: 5 → 10.
    await game.p1.activate("vi", DOUBLE);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1, fury: 0 } });
    await game.settle();
    expect(might(game)).toBe(10);
  });

  test("(d) P1's own Discipline with ZERO power in pool is still castable on Vi (nothing to surcharge)", async () => {
    const game = await board({ energy: 2, power: { fury: 0 } }).build();
    expect(game.p1.power()).toBe(0);
    await game.p1.cast("disc", { targets: "vi" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(might(game)).toBe(5);
  });

  test("(d) an OPPONENT's Discipline on Vi (in response to the double) owes 2 energy + 1 power of ANY domain; it resolves first → 5 → double → 10 all the same", async () => {
    const game = await board()
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .hand(P2, DISCIPLINE, "p2disc")
      .build();
    await game.p1.activate("vi", DOUBLE);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "p2disc")).toBe(true);
    await game.p2.cast("p2disc", { targets: "vi" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // 2 + the Deflect power (off-domain is fine)
    expect(game.chain().map((i) => i.cardId)).toEqual(["vi", "p2disc"]);
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(might(game)).toBe(10);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // P2 is the one who draws off its own Discipline
  });

  test("(d) …and without a spare power P2 cannot choose Vi at all (the neighbour is fine at plain cost)", async () => {
    const game = await board()
      .resources(P2, { energy: 2 })
      .hand(P2, DISCIPLINE, "p2disc")
      .build();
    await game.p1.activate("vi", DOUBLE);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    const offered = ((game.p2.option("cast", "p2disc")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][]).map((t) => t[0]);
    expect(offered).not.toContain("vi");
    expect(offered).toContain("neighbour");
    const r = await game.p2.try((p) => p.cast("p2disc", { targets: "vi" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("p2disc")).toBe("hand");
    await game.p2.cast("p2disc", { targets: "neighbour" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("neighbour").might).toBe(4);
    expect(might(game)).toBe(6); // the double resolved on an untouched 3
  });

  // ── (e) end of turn ─────────────────────────────────────────────────────────────────────────

  test("(e) every modifier here is 'this turn': the 10-line, the 8-line, the 12-line and the 16-line all revert to 3 once the turn ends; the drawn card stays in hand", async () => {
    const lines: { name: string; run: (g: Game) => Promise<void>; peak: number; res: { energy: number; power: Record<string, number> }; drew: number }[] = [
      {
        drew: 1,
        name: "10 (Discipline in response)",
        peak: 10,
        res: { energy: 4, power: { fury: 1 } },
        run: async (g) => {
          await g.p1.activate("vi", DOUBLE);
          await g.p1.cast("disc", { targets: "vi" });
          await g.settle();
        },
      },
      {
        drew: 1,
        name: "8 (double then Discipline)",
        peak: 8,
        res: { energy: 4, power: { fury: 1 } },
        run: async (g) => {
          await g.p1.activate("vi", DOUBLE);
          await g.settle();
          await g.p1.cast("disc", { targets: "vi" });
          await g.settle();
        },
      },
      {
        drew: 0,
        name: "12 (two doubles)",
        peak: 12,
        res: { energy: 4, power: { fury: 2 } },
        run: async (g) => {
          await g.p1.activate("vi", DOUBLE);
          await g.settle();
          await g.p1.activate("vi", DOUBLE);
          await g.settle();
        },
      },
      {
        drew: 1,
        name: "16 (double, Discipline, double)",
        peak: 16,
        res: { energy: 6, power: { fury: 2 } },
        run: async (g) => {
          await g.p1.activate("vi", DOUBLE);
          await g.settle();
          await g.p1.cast("disc", { targets: "vi" });
          await g.settle();
          await g.p1.activate("vi", DOUBLE);
          await g.settle();
        },
      },
    ];
    for (const line of lines) {
      const game = await board(line.res).build();
      const hand = game.p1.hand().length; // just Discipline
      await line.run(game);
      expect({ line: line.name, might: might(game) }).toEqual({ line: line.name, might: line.peak });
      const handAfter = game.p1.hand().length;
      // Discipline lines: −1 (cast) +1 (draw); the two-doubles line never touches the hand.
      expect({ hand: handAfter, line: line.name }).toEqual({ hand, line: line.name });
      expect({ discInTrash: game.zoneOf("disc") === "trash", line: line.name }).toEqual({ discInTrash: line.drew === 1, line: line.name });
      await game.advanceTurn(); // → P2's turn: this turn's Ending Step expired everything
      expect(game.turnPlayer()).toBe(P2);
      expect({ line: line.name, might: might(game) }).toEqual({ line: line.name, might: 3 });
      expect(game.state("vi")).toMatchObject({ baseMight: 3, mightModifier: 0 });
      expect(game.p1.hand()).toHaveLength(handAfter); // the drawn card stays drawn
      expect(game.trace().expiration.flatMap((p) => p.expired)).toContain("mightModifier:vi");
    }
  });
});
