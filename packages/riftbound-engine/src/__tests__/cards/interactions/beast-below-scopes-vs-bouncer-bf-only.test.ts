/**
 * Interaction: Zaunite Bouncer (ogn-188-298) "When you play me, return another unit AT A
 *   BATTLEFIELD to its owner's hand."
 *   × Beast Below (sfd-132-221) "When you play me, return another FRIENDLY unit and an ENEMY
 *   unit to their owners' hands."
 *
 * Question: the two cards differ only in which qualifiers ride on the target descriptor, so
 * they are the cleanest possible A/B for how a target's stated restrictions are read.
 *   (a) Bouncer: is a friendly unit at a DIFFERENT battlefield offered? a base unit? itself?
 *   (b) Beast Below: two menus with opposite controller qualifiers and NO location qualifier.
 *   (c) Beast Below with no other friendly unit — does the enemy half happen anyway?
 *   (d) Bouncer with every other unit in a base.
 *
 * Rules refs
 *   355.8    an ability may be put on the Chain only if legal choices exist for ALL its targets
 *   355.9.a.1 / 355.9.b  a target is restricted ONLY by what the card states; "another unit"
 *            carries no controller qualifier, so enemy units qualify
 *   355.9.c  a target must satisfy every stated restriction
 *   355.10.b "at a battlefield" is a restriction ON the chosen unit, not a second target — and
 *            it says "a battlefield", not "here", so ANY battlefield qualifies
 *   740.1.a / 740.1.b  friendly / enemy are relative to the ability's controller
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BOUNCER = "ogn-188-298";
const BEAST = "sfd-132-221";

/** The card ids a finalization-time target prompt is offering, sorted. */
function offered(game: { decision: () => unknown }): string[] {
  const d = game.decision() as { kind?: string; options?: { card?: string; key: string }[] } | undefined;
  expect(d?.kind).toBe("pick");
  return (d?.options ?? []).map((o) => o.card ?? o.key).sort();
}

/**
 * A: P1 unit in P1's base.  B: P1 unit at bf3.  C: P2 unit at bf1.  D: P2 unit in P2's base.
 * `anchor` holds P1's control of bf2, the only battlefield P1 may play a unit to (355.2.a),
 * so the Bouncer can enter a battlefield that is NOT the one B stands on.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P1 })
    .unit(P1, "base", { might: 1, name: "A" }, "A")
    .unit(P1, "bf3", { might: 2, name: "B" }, "B")
    .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
    .unit(P2, "bf1", { might: 3, name: "C" }, "C")
    .unit(P2, "base", { might: 4, name: "D" }, "D")
    .hand(P1, BOUNCER, "bouncer")
    .hand(P1, BEAST, "beast");
}

describe("Beast Below's controller scopes vs Zaunite Bouncer's 'at a battlefield'", () => {
  test("(a) Bouncer offers every OTHER unit at ANY battlefield — friendly or enemy, including one at a different battlefield than its own; base units and itself are excluded", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "bf2" });
    expect(game.locationOf("bouncer")).toBe("bf2");
    // "at a battlefield" (355.10.b) is not "here": B stands at bf3, the Bouncer at bf2, and B is
    // still offered. "another unit" carries no controller qualifier (355.9.b), so the enemy C
    // qualifies too. A and D are in bases; the Bouncer is excluded by "another".
    expect(offered(game)).toEqual(["B", "C", "anchor"]);
  });

  test("(a) choosing the friendly unit at the OTHER battlefield returns it to P1's hand", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "bf2" });
    await game.p1.pick("B");
    await game.settle();
    expect(game.zoneOf("B")).toBe("hand");
    expect(game.p1.hand()).toContain("B");
    expect(game.p1.units("bf3")).toEqual([]);
    expect(game.zoneOf("bouncer")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });

  test("(a) choosing the ENEMY unit is equally legal and returns it to its OWNER's hand (740.1.b is not asserted by this card's text)", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "bf2" });
    await game.p1.pick("C");
    await game.settle();
    expect(game.zoneOf("C")).toBe("hand");
    expect(game.p2.hand()).toContain("C");
    expect(game.p1.hand()).not.toContain("C");
  });

  test("(a) the base units and the Bouncer itself are not merely unpicked — they are not selectable at all (355.9.c)", async () => {
    const game = await board().build();
    await game.p1.play("bouncer", { to: "bf2" });
    await expect(game.p1.pick("A")).rejects.toThrow();
    await expect(game.p1.pick("D")).rejects.toThrow();
    // "another" (the source itself): naming it does not answer the prompt — it stays open and
    // the Bouncer stays where it is.
    expect(offered(game)).not.toContain("bouncer");
    await game.p1.try((p) => p.pick("bouncer"));
    expect(game.decision()?.kind).toBe("pick");
    expect(game.zoneOf("bouncer")).toBe("battlefield-bf2");
  });

  test("(b) Beast Below asks TWO independent menus split by controller, and NEITHER excludes base units", async () => {
    const game = await board().build();
    await game.p1.play("beast", { to: "base" });
    // Friendly half: "another friendly unit" — A (base) and B (bf3) and anchor (bf2); never itself.
    expect(offered(game)).toEqual(["A", "B", "anchor"]);
    await game.p1.pick("A");
    // Enemy half: "an enemy unit" — C (bf1) and D (P2's base). No location qualifier on either
    // half, which is the ONLY difference from the Bouncer (355.10.b).
    expect(offered(game)).toEqual(["C", "D"]);
    await game.p1.pick("D");
    await game.settle();
    expect(game.zoneOf("A")).toBe("hand");
    expect(game.zoneOf("D")).toBe("hand");
    expect(game.p1.hand()).toContain("A");
    expect(game.p2.hand()).toContain("D");
    // Untouched: the units that were merely eligible.
    expect(game.locationOf("B")).toBe("bf3");
    expect(game.locationOf("C")).toBe("bf1");
    expect(game.zoneOf("beast")).toBe("base");
  });

  test("(b) 'another' bars Beast Below from its own friendly half", async () => {
    const game = await board().build();
    await game.p1.play("beast", { to: "base" });
    expect(offered(game)).not.toContain("beast");
    await game.p1.try((p) => p.pick("beast"));
    expect(game.decision()?.kind).toBe("pick"); // still unanswered — "beast" is not on the menu
    expect(game.zoneOf("beast")).toBe("base");
    // it can only ever bounce one of the three OTHER friendly units
    await game.p1.pick("B");
    expect(offered(game)).toEqual(["C", "D"]);
  });

  test("(c) with no other friendly unit the WHOLE trigger fails (355.8): the enemy unit is not bounced, and Beast Below stays on the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "C" }, "C")
      .unit(P2, "base", { might: 4, name: "D" }, "D")
      .hand(P1, BEAST, "beast")
      .build();
    await game.p1.play("beast", { to: "base" });
    // 355.8: legal choices must exist for ALL targets before the ability may go on the Chain.
    expect(game.chain()).toEqual([]);
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action"); // no prompt, not even a decline-only one
    expect(game.locationOf("C")).toBe("bf1");
    expect(game.locationOf("D")).toBe("base");
    expect(game.p2.hand()).toEqual([]);
    // A failed trigger does not undo the play, and never substitutes Beast Below for the
    // missing friendly target.
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) same shape for the Bouncer: with every other unit in a base, 'at a battlefield' has no legal choice, so the trigger is never placed and nothing is bounced", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { chaos: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 1, name: "A" }, "A")
      .unit(P2, "base", { might: 4, name: "D" }, "D")
      .hand(P1, BOUNCER, "bouncer")
      .build();
    await game.p1.play("bouncer", { to: "base" });
    expect(game.chain()).toEqual([]);
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("A")).toBe("base");
    expect(game.locationOf("D")).toBe("base");
    expect(game.zoneOf("bouncer")).toBe("base");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
  });
});
