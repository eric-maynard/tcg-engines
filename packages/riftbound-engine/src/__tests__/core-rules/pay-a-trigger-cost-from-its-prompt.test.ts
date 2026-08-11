/**
 * Core rules — paying a trigger's cost from INSIDE its own prompt
 * (rules 429.3 / 357.1.a / 444.2.c; DESIGN.md §Paying costs).
 *
 * CARD-INDEPENDENT: every unit below is an inline filler definition, shaped
 * like the cards the playtest report named — Blade Dancer ("you may exhaust me
 * and pay [rainbow] to ready it", "you may pay [1] to ready me") and Fiora
 * Worthy Opponent ("you may pay [order] to ready it").
 *
 * A Basic Rune's "[Exhaust]: Add [1]" / "Recycle this: Add [C]" are Reaction
 * [Add] abilities, activatable ANY time a cost must be paid — a trigger's own
 * "you may pay [C] to …" prompt included. Paying is manual (DESIGN.md), so the
 * prompt stays OPEN across the activation: the player taps runes and only then
 * accepts. What that forbids is the old behaviour this file pins down: hiding
 * "yes" whenever the pool as it stands cannot pay, which forced the player to
 * guess the cost and pre-tap before the ability was ever offered.
 *
 * Rules covered (riftbound-rules ids):
 *   429.3 / 357.1.a   Reaction [Add] abilities are usable during any payment
 *   444.2.c           a Pay demanded by a resolving/finalizing ability is a Pay step
 *   383.3.b.1 / 404.2 a cost NOTHING can fund is still only declinable
 *   164.2.a/b / 594   tap → Energy; recycle (ready or not) → Power of that Domain
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";
import type { YesNoDecision } from "../../harness";

/** Unit · "When you play me, you may pay [order] to draw 1." */
const MAY_PAY_ORDER = {
  abilities: [
    {
      condition: { cost: { power: ["order"] }, type: "pay-cost" },
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "order",
  energyCost: 0,
  might: 2,
  name: "Filler Order Payer",
};

/** Unit · "When you play me, you may pay [1] to draw 1." (Blade Dancer's second ability) */
const MAY_PAY_ENERGY = {
  abilities: [
    {
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Energy Payer",
};

/** Unit · "When you play me, you may kill another friendly unit to draw 1." — no rune can fund this. */
const MAY_KILL = {
  abilities: [
    {
      condition: { cost: { kill: { excludeSelf: true, type: "unit" } }, type: "pay-cost" },
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Kill Payer",
};

const yesNo = (d: unknown): YesNoDecision => d as YesNoDecision;

describe("429.3 / 357.1.a — a trigger's cost prompt IS a Pay step", () => {
  // The reported bug: Blade Dancer offered no Yes unless the player recycled
  // BEFORE choosing the unit. The pool is empty here and the [order] rune is
  // still ready, so "yes" must be offered — flagged as needing an Add first.
  test("empty pool + a ready [order] rune: the prompt opens, Yes is offered with needsAdd, and recycling mid-prompt makes it payable", async () => {
    const game = await scenario()
      .rune(P1, "order", { alias: "r1" })
      .hand(P1, MAY_PAY_ORDER, "u")
      .build();
    await game.p1.play("u");

    const before = yesNo(game.decision());
    expect(before).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(before.prompt).toContain("[order]");
    // Offered, not hidden — and it says what to do about it.
    expect(before.canAccept).toBe(true);
    expect(before.needsAdd).toMatchObject({ power: { order: 1 } });
    expect(before.needsAdd?.reason).toContain("recycle");

    // rule 429.3 — the Add is legal WHILE the prompt is open, and the prompt
    // survives it (nothing is auto-paid: this is the player's own click).
    expect(game.p1.can("recycleRune", "r1")).toBe(true);
    const added = await game.p1.try((p) => p.recycleRune("r1"));
    expect(added.ok).toBe(true);
    expect(game.p1.power("order")).toBe(1);

    const after = yesNo(game.decision());
    expect(after).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(after.needsAdd).toBeUndefined();

    await game.p1.yes();
    expect(game.p1.power("order")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // rule 164.2.a — the Energy half of the same window (Blade Dancer's "you may
  // pay [1] to ready me"): tapping a ready rune funds it from inside the prompt.
  test("empty pool + a ready rune: an energy cost is offered with needsAdd and funded by tapping mid-prompt", async () => {
    const game = await scenario()
      .rune(P1, "fury", { alias: "r1" })
      .hand(P1, MAY_PAY_ENERGY, "u")
      .build();
    await game.p1.play("u");

    const before = yesNo(game.decision());
    expect(before.canAccept).toBe(true);
    expect(before.needsAdd).toMatchObject({ energy: 1 });
    expect(before.needsAdd?.reason).toContain("tap");
    // The rune moves ride along on the yes/no decision, so a UI/AI reading the
    // decision alone can see how to pay.
    expect(before.actions?.some((a) => a.moveId === "exhaustRune")).toBe(true);

    expect(game.p1.can("tapRune", "r1")).toBe(true);
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(yesNo(game.decision()).needsAdd).toBeUndefined();

    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // rule 383.3.b.1 / 404.2 — with nothing left to tap or recycle the cost is
  // genuinely unpayable: no needsAdd, "yes" stays refused, No is clean.
  test("no rune to add from: Yes is not acceptable, no needsAdd, and declining leaves the board untouched", async () => {
    const game = await scenario().hand(P1, MAY_PAY_ORDER, "u").build();
    await game.p1.play("u");

    const d = yesNo(game.decision());
    expect(d).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    expect(d.needsAdd).toBeUndefined();
    const attempt = await game.p1.try((p) => p.yes());
    expect(attempt.ok).toBe(false);

    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  // rule-id: ven-067-166 — a cost a rune can NEVER fund ("kill another friendly
  // unit") is no Pay step for the rune window: the board stays frozen, and the
  // unpayable prompt is not dressed up as reachable.
  test("an object-only cost with no legal object opens no rune window and offers no Yes", async () => {
    const game = await scenario()
      .rune(P1, "fury", { alias: "r1" })
      .hand(P1, MAY_KILL, "u")
      .build();
    await game.p1.play("u");

    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(false);
      expect((d as YesNoDecision).needsAdd).toBeUndefined();
      // rule 444.2 — no Pay step here, so the runes stay frozen like any other
      // pending choice.
      expect(game.p1.can("tapRune", "r1")).toBe(false);
      await game.p1.no();
    }
    expect(game.violations()).toEqual([]);
  });
});
