/**
 * Interaction: Fizz, Trickster (sfd-140-221) × Twilight Step (ven-105-166) × Stargazer (ven-098-166)
 *
 *   Fizz, Trickster — Unit · Chaos · [3][chaos] · 3 Might
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3],
 *      ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its
 *      Power cost.)"
 *   Twilight Step — Spell · Chaos · [2][chaos] (no [Action]/[Reaction])
 *     "Move a unit with 3 [Might] or less.
 *      [Flow] [4][chaos] (You may play this from your trash for its Flow cost. Then banish it.)"
 *   Stargazer — Unit · Chaos · [5] · 4 Might
 *     "Spells with [Flow] you play from your trash cost [2] less, to a minimum of [1]."
 *
 * The question: two copies of Twilight Step sit in P1's trash and Stargazer is in P1's base.
 *   (a) Is Twilight Step eligible for Fizz — does "no more than [3]" read the printed base 2 or the
 *       Flow cost 4?
 *   (b) What does the Fizz play actually cost, and does Stargazer's discount touch it?
 *   (c) When the Fizz-played copy leaves the chain, is it trashed, banished or recycled — i.e. which
 *       delayed rider is armed?
 *   (d) Contrast, same turn: the SECOND copy played for its Flow cost — what is paid, where does it
 *       end up?
 *   (e) Does Flow change WHEN Twilight Step may be played?
 *
 * Answers / rule refs:
 *   (a) The PRINTED base — 2. A cost gate reads the Printed/Copied Base Cost, never a modified or
 *       alternate one (356.1.c), and the Flow cost is an ALTERNATE cost that only replaces the base
 *       during that particular play (829.1.c.1). Twilight Step is eligible; Onslaught (printed 4,
 *       Flow [4]) is not.
 *   (b) "Ignoring its Energy cost" zeroes only the Energy half — the [chaos] pip survives
 *       (356.1.b.2), so the Fizz play costs exactly one [chaos]. Stargazer's clause literally
 *       matches (a Flow spell played from your trash) but it is an ENERGY discount on a cost that
 *       is already 0, and Energy can't go below 0 (356.6); its "minimum of [1]" binds only its own
 *       reduction (356.4.e) and never raises a cost. It changes nothing, and never touches a pip.
 *   (c) RECYCLED. "Then recycle it" is a delayed replacement: "if it would leave the chain after
 *       becoming a finalized chain item, and leaving wasn't instructed by its own execution,
 *       recycle it instead" (390.3.a) — it fires on ordinary resolution. Flow's "then banish it"
 *       rider (829.1.b.1) is NOT armed: that rider exists only for a play made FOR the Flow cost,
 *       and this play was made under Fizz's permission for a modified base cost. Bottom of the Main
 *       Deck, not trash and not banishment.
 *   (d) The Flow play replaces the base with [4][chaos] (829.1.c.1 / 356.1.a); Stargazer's −[2]
 *       applies to the Energy component only → 2 energy + [chaos]. It is then BANISHED
 *       (829.1.b.1 / 390.3.a) — that copy can never be Fizzed again, while the recycled copy can be
 *       drawn.
 *   (e) NO — Flow changes only the ZONE a spell can be played from, never its timing or any other
 *       permission (829.1.b.2). Twilight Step has no [Action]/[Reaction], so it is main-phase-only
 *       either way. The Fizz play is an effect-instructed Limited Play whose timing is Fizz's own
 *       (419.3.b): it happens while a chain item resolves — a moment when P1 could not cast the
 *       card himself.
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const TWILIGHT_STEP = "ven-105-166"; // Spell · [2][chaos] · Flow [4][chaos]
const STARGAZER = "ven-098-166";
const ONSLAUGHT = "ven-081-166"; // Spell · [4] · Give a unit +6 Might this turn. Flow [4]
const DREDGE_UP = "ven-049-166"; // Spell · [2] · Draw 1. Flow [2]

function board(opts: { chaos?: number; energy?: number; stargazer?: boolean } = {}) {
  const base = scenario()
    .resources(P1, { energy: opts.energy ?? 8, power: { chaos: opts.chaos ?? 4 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .trash(P1, TWILIGHT_STEP, "ts1")
    .trash(P1, TWILIGHT_STEP, "ts2")
    .hand(P1, FIZZ, "fizz");
  return opts.stargazer === false ? base : base.unit(P1, "base", STARGAZER, "sg");
}

/** Play Fizz, accept the "you may", and return the pick of trash spells Fizz offers. */
async function fizzOffer(game: Game): Promise<PickDecision> {
  await game.p1.play("fizz");
  await game.p1.yes();
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  return d as PickDecision;
}

/** …then name `alias` and let the trigger resolve so the spell is actually PLAYED. */
async function fizzInto(game: Game, alias: string): Promise<void> {
  await fizzOffer(game);
  await game.p1.pick(alias);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Fizz × Twilight Step's Flow rider × Stargazer (playing a Flow spell out of the trash two different ways)", () => {
  test("(a) 'Energy cost no more than [3]' reads the PRINTED base cost (356.1.c): both Twilight Steps are offered despite their [4] Flow cost, while Onslaught (printed [4], Flow [4]) is not", async () => {
    const game = await board()
      .trash(P1, ONSLAUGHT, "ons")
      .trash(P1, DREDGE_UP, "dredge")
      .build();
    const pick = await fizzOffer(game);
    const keys = pick.options.map((o) => o.key).sort();
    // Flow is an ALTERNATE cost that only replaces the base during that play (829.1.c.1) — it is
    // not what the gate reads.
    expect(keys).toEqual(["dredge", "ts1", "ts2"]);
    expect(keys).not.toContain("ons");
  });

  test("(b) the Fizz play costs exactly one [chaos] — Energy is zeroed (356.1.b.2), and Stargazer's −[2]/'minimum of [1]' neither reduces it further (356.6) nor raises it (356.4.e)", async () => {
    const withSg = await board({ chaos: 4, energy: 8 }).build();
    await fizzInto(withSg, "ts1");
    // 8 → 5 energy and 4 → 3 chaos was Fizz's own [3][chaos]; the Twilight Step play then spent one
    // more [chaos] and NO energy at all.
    expect(withSg.p1.resources()).toEqual({ energy: 5, power: { chaos: 2 } });
    expect(withSg.zoneOf("ts1")).toBe("chain");

    // Same board without Stargazer: identical spend, so the discount provably did nothing.
    const noSg = await board({ chaos: 4, energy: 8, stargazer: false }).build();
    await fizzInto(noSg, "ts1");
    expect(noSg.p1.resources()).toEqual({ energy: 5, power: { chaos: 2 } });
  });

  test("(b) the surviving [chaos] pip is a real cost: with Fizz's own pip the only chaos available, Twilight Step is named but never played and nothing moves", async () => {
    // 419.2.a/419.3.c — affording the spell is no part of naming it; with no [chaos] left at
    // resolution the Limited Play simply does not happen.
    const game = await board({ chaos: 1, energy: 8 }).build();
    await fizzInto(game, "ts1");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("ts1")).toBe("trash"); // never left the trash
    expect(game.zoneOf("scout")).toBe("base"); // no move happened
    expect(game.p1.deck()).not.toContain("ts1"); // and nothing was recycled
  });

  test("(c) the Fizz-played copy is RECYCLED to the bottom of the Main Deck (390.3.a) — Flow's 'then banish it' rider (829.1.b.1) was never armed, so it is neither banished nor trashed", async () => {
    const game = await board().build();
    await fizzInto(game, "ts1");
    await game.p1.pick("scout"); // Twilight Step's own target, chosen as it is finalized
    await game.settle(); // sole destination bf1 is forced; showdown auto-resolves
    await game.settle();
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.zoneOf("ts1")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ts1"); // bottom of the deck
    expect(game.p1.trash()).not.toContain("ts1");
    expect(game.violations()).toEqual([]);
  });

  test("(d) SAME TURN, second copy for its Flow cost: [4][chaos] − Stargazer's [2] = 2 energy + [chaos], and it is BANISHED — while the Fizz-recycled copy is still in the deck", async () => {
    const game = await board().build();
    await fizzInto(game, "ts1");
    await game.p1.pick("scout");
    await game.settle();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 2 } });

    // The Flow play replaces the base cost entirely (829.1.c.1 / 356.1.a); Stargazer discounts only
    // the Energy component (356.4.e — the min of [1] binds that discount alone).
    expect(game.p1.can("cast", "ts2")).toBe(true);
    expect(game.p1.option("cast", "ts2")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("ts2", { flow: true, targets: "scout" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base"); // stepped home again
    expect(game.zoneOf("ts2")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("ts2");
    // The two riders diverge: one copy is drawable again, the other is gone for good.
    expect(game.p1.deck()).toContain("ts1");
    expect(game.p1.can("cast", "ts2")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(d) the Flow cost is what Stargazer discounts: 2 energy + [chaos] with Stargazer out, 4 energy + [chaos] without — the pip is never discounted either way", async () => {
    const withSg = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", STARGAZER, "sg")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .trash(P1, TWILIGHT_STEP, "ts")
      .build();
    expect(withSg.p1.can("cast", "ts")).toBe(true);
    await withSg.p1.cast("ts", { flow: true, targets: "scout" });
    expect(withSg.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });

    const noSg = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .trash(P1, TWILIGHT_STEP, "ts")
      .build();
    expect(noSg.p1.can("cast", "ts")).toBe(false); // 3 is one short of the undiscounted [4]

    const pipless = await scenario()
      .resources(P1, { energy: 9 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", STARGAZER, "sg")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .trash(P1, TWILIGHT_STEP, "ts")
      .build();
    expect(pipless.p1.can("cast", "ts")).toBe(false); // no amount of energy buys the [chaos]
  });

  test("(e) Flow changes only the ZONE, never the timing (829.1.b.2): with Focus in a showdown, and on the opponent's turn, neither the hand copy nor the trash copy may be played", async () => {
    const sd = await scenario()
      .resources(P1, { energy: 9, power: { chaos: 3 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", STARGAZER, "sg")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 1, name: "Wisp" }, "wisp")
      .hand(P1, TWILIGHT_STEP, "tsHand")
      .trash(P1, TWILIGHT_STEP, "tsTrash")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(sd.p1.can("cast", "tsHand")).toBe(false);
    expect(sd.p1.can("cast", "tsTrash")).toBe(false);

    const opp = await scenario()
      .active(P2)
      .resources(P1, { energy: 9, power: { chaos: 3 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", STARGAZER, "sg")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, TWILIGHT_STEP, "tsHand")
      .trash(P1, TWILIGHT_STEP, "tsTrash")
      .build();
    expect(opp.p1.can("cast", "tsHand")).toBe(false);
    expect(opp.p1.can("cast", "tsTrash")).toBe(false);
  });

  test("(e) the Fizz play borrows FIZZ's timing (419.3.b): it happens while a chain item resolves — a window in which P1 cannot cast the very same trash copy himself", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "ts1")).toBe(true); // neutral open state: a Flow play is legal
    await game.p1.play("fizz");
    // Fizz's trigger is on the chain: no longer a neutral open state, so Twilight Step (standard
    // timing, no [Action]) cannot be played by hand — Flow did not give it one.
    expect(game.p1.can("cast", "ts1")).toBe(false);
    await game.p1.yes();
    await game.p1.pick("ts1");
    expect(game.p1.can("cast", "ts2")).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // …and yet Fizz's Limited Play put the named copy onto the chain right there.
    expect(game.chain().map((c) => c.cardId)).toContain("ts1");
    expect(game.zoneOf("ts1")).toBe("chain");
  });
});
