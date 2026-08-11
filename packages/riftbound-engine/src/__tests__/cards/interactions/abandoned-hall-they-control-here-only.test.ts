/**
 * Interaction: Abandoned Hall (unl-205-219) × Discipline (ogn-058-298)
 *
 *   Abandoned Hall — Battlefield   "When a player plays a spell, THEY may give a unit THEY control HERE
 *                                   +1 [Might] this turn."
 *   Discipline — Spell · Calm · 2  "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 190.6.c (a battlefield ability that names a SPECIFIC player — "they" — is controlled by that player,
 * who puts it on the chain and makes ALL its choices, regardless of who controls the battlefield; the CR writes
 * this rule around Abandoned Hall by name), 190.6.a / 190.6.d (the default "you" on a battlefield = its
 * controller — overridden here), 740.1.a ("they control" = current control, not ownership), 053.3 ("here" is
 * the battlefield's self-reference), 355.8 (valid choices for all targets are required to put the ability on the
 * chain at all), 383.3.a / 383.3.a.1 / 383.3.a.2 (a leading "they may" is a finalization-time opt-in; declining
 * removes the item and it is considered never to have triggered), 355.9.a.1 / 355.9.b (an unqualified "a unit"
 * is every unit on the board), 412.1.b (a countered spell was never played).
 *
 * Board: P1's turn. P1 controls the Hall (bf "hall") with unit X standing there; P2 has unit Y at the Hall and
 * unit Z at bf2. P1 casts a cheap Action spell, P2 answers with Discipline (a Reaction) in that window.
 *
 * Question: (a) whose trigger is it — P1 (battlefield controller) or P2 (spell player)? (b) which units are in
 * the candidate set: X, Y, Z? (c) with NO P2 unit at the Hall, does P2 get a decline-only prompt or nothing at
 * all? (d) contrast in the same window: Discipline's own unqualified "a unit" — may P2 pick P1's X, or a unit in
 * a base? (e) if P1 counters Discipline, does the Hall still trigger for P2?
 *
 * Expected: (a) P2 — the player who played the spell (190.6.c). (b) {Y} only: "they control" prunes X, "here"
 * prunes Z. (c) nothing at all — 355.8 means the ability is never placed, so no decision point exists. (d) every
 * unit on the board, X and both bases included. (e) no — 412.1.b, the countered spell was never played (but
 * Defy itself IS P1's played spell and wakes the Hall for P1).
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HALL = "unl-205-219";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298"; // [Reaction] 1 + [calm]: counter a spell costing <= 4 and <= 1 power

/** Inline 1-cost [Action] spell with no Might text: P1's chain item, the window P2 answers into. */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Quick Study",
  timing: "action",
} as const;

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Ids offered by the current pick prompt, sorted. */
function picksOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => (o.card ?? o.key) as string).sort() : [];
}

/** P1 controls the live Hall with X on it; P2 has Y there and Z at bf2; both players keep a unit in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("hall", { controller: P1, def: HALL, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "hall", { might: 2, name: "X" }, "x")
    .unit(P2, "hall", { might: 2, name: "Y" }, "y")
    .unit(P2, "bf2", { might: 2, name: "Z" }, "z")
    .unit(P1, "base", { might: 1, name: "P1 Homebody" }, "pHome")
    .unit(P2, "base", { might: 1, name: "P2 Homebody" }, "eHome")
    .hand(P1, STUDY, "study")
    .hand(P2, DISCIPLINE, "disc");
}

/** P1 casts Study and passes → P2 holds priority and may answer with its Reaction. */
async function p2Window(game: Game): Promise<void> {
  await game.p1.cast("study");
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

describe("(a) 190.6.c — the Hall's trigger belongs to the player who played the spell, not to the Hall's controller", () => {
  test("P2's Discipline resolving hands the Hall trigger to P2: the chain item's controller is P2 and P2 is the one asked 'you may'", async () => {
    const game = await board().build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "y" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves → the Hall triggers
    const hall = game.chain().find((c) => c.cardId === "hall");
    expect(hall).toMatchObject({ controller: P2, triggered: true });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "hall" } });
  });

  test("P1's control of the battlefield gives P1 nothing: P1 is never the seat asked, and declining as P2 leaves every Might untouched", async () => {
    const game = await board().build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "y" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1).toBe(false);
    await game.p2.no();
    expect(game.state("x").might).toBe(2);
    expect(game.state("y").might).toBe(4); // Discipline's own +2 only
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) 740.1.a + 053.3 — 'a unit THEY control HERE' is doubly pruned: only P2's units, only at the Hall", () => {
  test("with two P2 units at the Hall the menu is exactly those two — P1's X (here, but not theirs) and P2's Z (theirs, but not here) are absent", async () => {
    const game = await board().unit(P2, "hall", { might: 2, name: "Y2" }, "y2").build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "y" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(picksOffered(game)).toEqual(["y", "y2"]);
    const offered = picksOffered(game);
    expect(offered).not.toContain("x");
    expect(offered).not.toContain("z");
    expect(offered).not.toContain("eHome");
  });

  test("the chosen unit alone gets +1: Y2 → 3 while X, Z and both bases are unchanged", async () => {
    const game = await board().unit(P2, "hall", { might: 2, name: "Y2" }, "y2").build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "y" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.yes();
    await game.p2.pick("y2");
    await game.p2.passPriority();
    await game.p1.passPriority(); // the Hall trigger resolves
    expect(game.state("y2").might).toBe(3);
    expect(game.state("y").might).toBe(4); // Discipline's +2, no Hall bonus
    expect(game.state("x").might).toBe(2);
    expect(game.state("z").might).toBe(2);
    expect(game.state("eHome").might).toBe(1);
  });

  test("a lone candidate is bound without a question — Y is the only unit P2 controls here (402.2)", async () => {
    const game = await board().build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "z" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.yes();
    expect(game.chain().find((c) => c.cardId === "hall")?.targets).toEqual(["y"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("y").might).toBe(3); // Hall's +1 only; Discipline went to Z
    expect(game.state("z").might).toBe(4);
  });
});

describe("(c) 355.8 — with no P2 unit at the Hall the ability is never put on the chain: no prompt, not even a decline", () => {
  /** Same board minus Y: P2's only units are Z (bf2) and the base Homebody. */
  function noHolder() {
    return scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("hall", { controller: P1, def: HALL, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "hall", { might: 2, name: "X" }, "x")
      .unit(P2, "bf2", { might: 2, name: "Z" }, "z")
      .unit(P2, "base", { might: 1, name: "P2 Homebody" }, "eHome")
      .hand(P1, STUDY, "study")
      .hand(P2, DISCIPLINE, "disc");
  }

  test("Discipline resolves and NOTHING of the Hall reaches the chain — P2 is not asked a decline-only question", async () => {
    const game = await noHolder().build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "z" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["study"]);
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P2).toBe(false);
    expect(d?.kind === "pick" && d.seat === P2).toBe(false);
  });

  test("P1's own spell still wakes the Hall for P1 in the same game — the silence above is the empty candidate set, not a dead battlefield", async () => {
    const game = await noHolder().build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "z" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves, no Hall trigger
    await game.settle(); // Study resolves → the Hall triggers for P1 (X is here) and stops at its question
    expect(game.chain().find((c) => c.cardId === "hall")).toMatchObject({ controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });
});

describe("(d) 355.9.a.1 / 355.9.b — Discipline's unqualified 'a unit' is every unit on the board", () => {
  test("in the very same window P2 may aim Discipline at P1's X or at a unit sitting in either base", async () => {
    const game = await board().build();
    await p2Window(game);
    const offered = targetsOffered(game, P2, "disc");
    expect(offered).toContain(game.card("x"));
    expect(offered).toContain(game.card("y"));
    expect(offered).toContain(game.card("z"));
    expect(offered).toContain(game.card("pHome"));
    expect(offered).toContain(game.card("eHome"));
  });

  test("P2 really can pump the opponent's X with Discipline — the doubly-closed Hall scope and the wide-open spell scope coexist", async () => {
    const game = await board().build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "x" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("x").might).toBe(4);
    await game.p2.yes(); // the Hall trigger is still P2's, and still only offers P2's units here
    expect(game.chain().find((c) => c.cardId === "hall")?.targets).toEqual(["y"]);
  });
});

describe("(e) 412.1.b — a countered spell was never played, so it generates no Hall trigger", () => {
  test("P1's Defy counters Discipline: P2 is never offered the Hall, Y stays at 2 and P2 never drew", async () => {
    const game = await board().hand(P1, DEFY, "defy").build();
    const p2Hand = game.p2.hand().length;
    await p2Window(game);
    await game.p2.cast("disc", { targets: "y" });
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "disc" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Defy resolves → Discipline is countered
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("y").might).toBe(2); // no +2, no Hall +1
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // spent Discipline, drew nothing
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P2).toBe(false);
  });

  test("Defy itself IS a played spell of P1's, so the Hall triggers for P1 and X (P1's unit here) takes the +1", async () => {
    const game = await board().hand(P1, DEFY, "defy").build();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "y" });
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "disc" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "hall" } });
    await game.p1.yes();
    expect(game.chain().find((c) => c.cardId === "hall")?.targets).toEqual(["x"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("x").might).toBe(3);
    expect(game.state("y").might).toBe(2);
  });
});
