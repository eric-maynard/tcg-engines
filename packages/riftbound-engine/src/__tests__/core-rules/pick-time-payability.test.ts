/**
 * Core rules — PICK-TIME payability of a surcharged target prompt
 * (rules 809.1.c.1 / 809.1.d / 429.3 / 355.14.d; DESIGN.md §Paying costs).
 *
 * CARD-INDEPENDENT: every unit below is an inline filler definition.
 *
 * The follow-up to "pay a trigger's cost from inside its prompt": a
 * [Deflect]-taxed `choose-target` / `pick-many` used to bake its option list at
 * RAISE time by filtering candidates against the pool as it then stood, and
 * never re-derived it — so a rune recycled while the prompt was open could not
 * bring a filtered-out target back. It now works the way the yes/no path does:
 *
 *   · every legal candidate stays listed, carrying its `surcharge` and (while
 *     the pool is short but a rune Add could still close the gap) a `needsAdd`;
 *   · the ANSWER is what gets refused, leaving the state untouched;
 *   · rune Adds (exhaustRune / recycleRune) are legal with the prompt open, and
 *     each one re-derives every option's payable state;
 *   · a surcharge NOTHING could ever fund is still no legal choice (809.1.d),
 *     exactly as an unfundable "yes" is still only declinable.
 *
 * Rules covered (riftbound-rules ids):
 *   809.1.c.1        the surcharge is owed as the target is CHOSEN — the pick IS the payment
 *   809.1.d          a surcharge the chooser can never cover is not a legal choice
 *   429.3 / 594      Reaction [Add] abilities are usable during any payment; recycling ignores readiness
 *   355.14.d         a multi-target set's surcharge ACCUMULATES as picks are added
 *   355.13           "up to N" / "any number": zero is always a legal answer
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import type { Decision, PickDecision } from "../../harness";

const pick = (d: Decision | null): PickDecision => d as PickDecision;

/** Enemy unit with [Deflect] 1 — costs 1 Power of any Domain to CHOOSE. */
const DEFLECTOR = {
  abilities: [{ keyword: "Deflect", type: "keyword", value: 1 }],
  cardType: "unit",
  domain: "calm",
  energyCost: 0,
  keywords: ["Deflect"],
  might: 4,
  name: "Filler Deflector",
};

/** Unit · "When you play me, deal 2 to an enemy unit." — one mandatory target. */
const SINGLE_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Single Pinger",
};

/** Unit · "When you play me, deal 1 to up to two enemy units." — an accumulating set. */
const UP_TO_PINGER = {
  abilities: [
    {
      effect: { amount: 1, target: { controller: "enemy", quantity: { upTo: 2 }, type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Up-To Pinger",
};

describe("809.1.c.1 / 429.3 — a [Deflect]-taxed target pick is a Pay step, gated when ANSWERED", () => {
  // The reported gap: with an empty pool the Deflect unit vanished from the
  // prompt, and recycling a rune could not bring it back (the option list was
  // baked when the prompt was raised).
  test("empty pool + a rune to recycle: the taxed target is LISTED with its surcharge and needsAdd, recycling mid-prompt makes it selectable, and answering charges it", async () => {
    const game = await scenario()
      .rune(P1, "order", { alias: "r1" })
      .unit(P2, "base", DEFLECTOR, "d")
      .unit(P2, "base", { might: 4, name: "Plain" }, "plain")
      .hand(P1, SINGLE_PINGER, "p")
      .build();
    await game.p1.play("p");

    const before = pick(game.decision());
    expect(before).toMatchObject({ kind: "pick", seat: P1 });
    // Listed, not hidden — and it says exactly what is missing.
    const taxed = before.options.find((o) => o.card === "d");
    expect(taxed).toBeDefined();
    expect(taxed?.surcharge).toBe(1);
    expect(taxed?.needsAdd?.reason).toContain("recycle");
    // The untaxed candidate is unaffected.
    expect(before.options.find((o) => o.card === "plain")?.needsAdd).toBeUndefined();
    // rule 809.1.d — the answer is refused while the pool cannot cover it, and
    // refusing changes nothing: the prompt is still open on the same options.
    const early = await game.p1.try((p) => p.pick("d"));
    expect(early.ok).toBe(false);
    expect(pick(game.decision()).options.map((o) => o.card).sort()).toEqual(["d", "plain"]);

    // rule 429.3 / 594 — the Add is legal WHILE the prompt is open, and the
    // prompt survives it (nothing is auto-tapped: this is the player's click).
    expect(game.p1.can("recycleRune", "r1")).toBe(true);
    // The rune moves ride along on the pick decision, so a UI/AI reading the
    // decision alone can see how to fund the target it wants.
    expect(before.actions?.some((a) => a.moveId === "recycleRune")).toBe(true);
    const added = await game.p1.try((p) => p.recycleRune("r1"));
    expect(added.ok).toBe(true);
    expect(game.p1.power("order")).toBe(1);

    // Re-derived: the same option is now payable.
    const after = pick(game.decision());
    expect(after.options.find((o) => o.card === "d")?.needsAdd).toBeUndefined();
    expect(after.options.find((o) => o.card === "d")?.surcharge).toBe(1);

    await game.p1.pick("d");
    expect(game.p1.power("order")).toBe(0); // 809.1.c.1 — charged as it was chosen
    await game.settle();
    expect(game.state("d").damage).toBe(2);
    expect(game.state("plain").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // rule 809.1.d — mirrors the yes/no path (45d6955): a cost NOTHING could fund
  // is not dressed up as reachable. With no rune in the pool the taxed unit is
  // not a legal choice at all, and the untaxed one still resolves cleanly.
  test("no rune to add from: the taxed target is not offered, the free ones still are, and answering is clean", async () => {
    const game = await scenario()
      .unit(P2, "base", DEFLECTOR, "d")
      .unit(P2, "base", { might: 4, name: "Plain A" }, "a")
      .unit(P2, "base", { might: 4, name: "Plain B" }, "b")
      .hand(P1, SINGLE_PINGER, "p")
      .build();
    await game.p1.play("p");

    const d = pick(game.decision());
    expect(d.options.map((o) => o.card).sort()).toEqual(["a", "b"]);
    expect((await game.p1.try((p) => p.pick("d"))).ok).toBe(false);
    // rule 444.2 — nothing to add, so no rune window is claimed either: the
    // taxed unit is dropped outright rather than dressed up as reachable.
    expect(d.options.every((o) => o.needsAdd === undefined)).toBe(true);
    // rule 650 — `concede` rides on every Decision; no rune ability does.
    expect((d.actions ?? []).filter((a) => a.moveId !== "concede")).toEqual([]);

    await game.p1.pick("a");
    await game.settle();
    expect(game.state("a").damage).toBe(2);
    expect(game.state("d").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // rule 355.14.d — the set's surcharge ACCUMULATES: with 1 Power the first
  // Deflect pick is fine and the second is not, so the two-target answer is
  // refused; a recycle mid-prompt funds it and the same answer then lands.
  test("a multi-target set: the second taxed pick is unaffordable and the whole set is refused, until a rune Add funds it", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .rune(P1, "fury", { alias: "r1" })
      .unit(P2, "base", DEFLECTOR, "d1")
      .unit(P2, "base", DEFLECTOR, "d2")
      .hand(P1, UP_TO_PINGER, "p")
      .build();
    await game.p1.play("p");

    const d = pick(game.decision());
    expect(d.options.map((o) => [o.card, o.surcharge ?? 0]).sort()).toEqual([
      ["d1", 1],
      ["d2", 1],
    ]);
    // Each alone is payable from the single Power, so neither is flagged…
    expect(d.options.every((o) => o.needsAdd === undefined)).toBe(true);
    // …but together they cost 2 (355.14.d) and the answer is refused, unpaid.
    expect((await game.p1.try((p) => p.pick("d1", "d2"))).ok).toBe(false);
    expect(game.p1.power("fury")).toBe(1);

    // rule 429.3 — funding the shortfall from inside the prompt.
    expect(game.p1.can("recycleRune", "r1")).toBe(true);
    await game.p1.recycleRune("r1");
    expect(game.p1.power("fury")).toBe(2);

    await game.p1.pick("d1", "d2");
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect([game.state("d1").damage, game.state("d2").damage]).toEqual([1, 1]);
    expect(game.violations()).toEqual([]);
  });

  // rule 355.13 — "up to N" always allows zero, so a set nobody can pay for
  // never traps the chooser: declining leaves the pool and the board alone.
  test("an 'up to N' set whose taxed picks are unaffordable can always be declined, and the decline costs nothing", async () => {
    const game = await scenario()
      .rune(P1, "fury", { alias: "r1" })
      .unit(P2, "base", DEFLECTOR, "d1")
      .hand(P1, UP_TO_PINGER, "p")
      .build();
    await game.p1.play("p");

    const d = pick(game.decision());
    expect(d.allowDecline).toBe(true);
    expect(d.options.find((o) => o.card === "d1")?.needsAdd?.reason).toContain("recycle");

    await game.p1.decline();
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.state("d1").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // A prompt with no surcharge at all is untouched by any of this: no per-option
  // fields, and rule 444.2 keeps the board frozen (no rune window).
  test("a non-surcharged target prompt is unaffected — no surcharge/needsAdd fields, and the runes stay frozen", async () => {
    const game = await scenario()
      .rune(P1, "fury", { alias: "r1" })
      .unit(P2, "base", { might: 4, name: "A" }, "a")
      .unit(P2, "base", { might: 4, name: "B" }, "b")
      .hand(P1, SINGLE_PINGER, "p")
      .build();
    await game.p1.play("p");

    const d = pick(game.decision());
    expect(d.options.map((o) => o.card).sort()).toEqual(["a", "b"]);
    expect(d.options.every((o) => o.surcharge === undefined && o.needsAdd === undefined)).toBe(true);
    // rule 650 — `concede` rides on every Decision; no rune ability does.
    expect((d.actions ?? []).filter((a) => a.moveId !== "concede")).toEqual([]);
    expect(game.p1.can("recycleRune", "r1")).toBe(false);
    expect(game.p1.can("tapRune", "r1")).toBe(false);

    await game.p1.pick("a");
    await game.settle();
    expect(game.state("a").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
