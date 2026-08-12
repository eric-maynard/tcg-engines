/**
 * Interaction: King's Edict (ogn-237-298) "Starting with the next player, each other player chooses
 *   a unit you don't control that hasn't been chosen for this spell. Kill those units."
 *   × Tianna Crownguard (sfd-060-221) "[Deflect] (Opponents must pay [rainbow] to choose me with a
 *     spell or ability.)"
 *
 * Question: the Edict is resolving and one seat's pick is pending. Two browser tabs are open on the
 * SAME seat. Does the second view converge (prompt closes, board matches) instead of sitting on a
 * stale modal? Does a click on the now-stale option get refused WITH A REASON rather than silently
 * no-opping or killing a second unit? And is the [Deflect] surcharge quoted in both tabs and
 * charged exactly once?
 *
 * A seat is the unit of state here: the engine holds ONE pending choice per seat, so "two tabs" is
 * two renders of one snapshot. The harness models that as: the seat's decision, the seat's view,
 * and a submission against a decision that is no longer pending.
 *
 * Rules:
 *  - 355.6 — each other player, in turn order starting after the caster, chooses one unit the
 *    caster does not control that has not already been chosen for this spell.
 *  - 340.1 — the chain item executes its effects in their entirety: the chosen units are killed
 *    together when the spell finishes resolving.
 *  - 204.2.a / 809.1.c — [Deflect] is a mandatory additional cost incurred once per choice of that
 *    object, payable in Power of any Domain.
 *  - 128.4 — Private information belongs to one player; a second seat's view must never carry it,
 *    however many views a seat has.
 *  - 357.1 — costs are paid as one payment; a refused answer pays nothing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";

const KINGS_EDICT = "ogn-237-298";
const TIANNA = "sfd-060-221"; // 4 Might, [Deflect]
const DISCIPLINE = "ogn-058-298"; // a card for P2's hand — private information

/**
 * P1 casts. The pool "a unit you don't control" spans BOTH other seats, so P2's own big unit is
 * eligible too. Tianna belongs to P3, so P2 choosing her is an opponent choosing her ⇒ [Deflect].
 * P2 holds two rainbow Power so the surcharge is affordable if the engine asks for it.
 */
function board() {
  return scenario({ players: 3 })
    .resources(P1, { energy: 6, power: { order: 2 } })
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .unit(P1, "base", { might: 1, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 5, name: "P2Big" }, "p2big")
    .unit(P3, "base", TIANNA, "tianna")
    .unit(P3, "base", { might: 2, name: "P3Grunt" }, "p3grunt")
    .hand(P2, DISCIPLINE, "p2secret")
    .hand(P1, KINGS_EDICT, "edict");
}

function options(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? (d.options.map((o) => o.card).filter(Boolean) as string[]).sort() : [];
}

describe("King's Edict × Tianna Crownguard — one seat, two tabs", () => {
  test("355.6: the caster chooses nothing at play time; the pick belongs to the NEXT player and excludes the caster's own units", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "edict")?.fields.find((f) => f.arg === "targets")).toBeUndefined();
    await game.p1.cast("edict");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edict", controller: P1 })]);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.actingSeat()).toBe(P2); // turn order, starting with the next player
    expect(game.decision()).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2 });
    expect(options(game)).toEqual(["p2big", "p3grunt", "tianna"]);
    expect(options(game)).not.toContain("mine"); // "a unit you don't control"
  });

  test("355.6 + 340.1: the second chooser cannot re-pick the first one's unit, and both picks die together when the spell resolves", async () => {
    const game = await board().build();
    await game.p1.cast("edict");
    await game.settle();
    await game.p2.pick("tianna");
    expect(game.actingSeat()).toBe(P3);
    expect(options(game)).toEqual(["p2big", "p3grunt"]); // tianna "has been chosen for this spell"
    expect(game.zoneOf("tianna")).toBe("base"); // nothing dies until the spell finishes resolving
    await game.seat(P3).pick("p3grunt");
    await game.settle();
    expect(game.zoneOf("tianna")).toBe("trash");
    expect(game.zoneOf("p3grunt")).toBe("trash");
    expect(game.zoneOf("p2big")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("edict")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("one pending choice per seat: only the acting seat is asked, and re-reading the same seat's view yields the same snapshot (two tabs agree)", async () => {
    const game = await board().build();
    await game.p1.cast("edict");
    await game.settle();
    // Tab A and tab B of seat P2 are two reads of one seat state — byte-identical.
    expect(JSON.stringify(game.p2.view())).toBe(JSON.stringify(game.p2.view()));
    expect(game.p2.decision()).toMatchObject({ kind: "pick", seat: P2 });
    expect(game.p1.decision()).toBeNull(); // the caster is not asked
    expect(game.seat(P3).decision()).toBeNull(); // and neither is the seat whose turn to choose has not come

    await game.p2.pick("tianna");
    // Next frame: P2's prompt is closed in BOTH tabs — the seat simply has no decision any more.
    expect(game.p2.decision()).toBeNull();
    expect(game.seat(P3).decision()).toMatchObject({ kind: "pick", seat: P3 });
    expect(JSON.stringify(game.p2.view())).toBe(JSON.stringify(game.p2.view()));
  });

  test("128.4: neither view leaks the other seat's private information", async () => {
    const game = await board().build();
    await game.p1.cast("edict");
    await game.settle();
    expect(JSON.stringify(game.view(P1))).not.toContain("p2secret");
    expect(JSON.stringify(game.view(P3))).not.toContain("p2secret");
    expect(JSON.stringify(game.p2.view())).toContain("p2secret"); // its owner does see it
  });

  test("a click on a stale option is REFUSED with a reason — no second kill, no double charge, no desync", async () => {
    const game = await board().build();
    await game.p1.cast("edict");
    await game.settle();
    await game.p2.pick("tianna");
    const hashBefore = game.stateHash();
    const resourcesBefore = JSON.stringify(game.p2.resources());

    // Tab B still shows P2's now-answered modal and clicks "p2big".
    const stale = await game.p2.try((p) => p.pick("p2big"));
    expect(stale.ok).toBe(false);
    expect(stale.ok === false ? stale.error.code : "").toBe("NOT_YOUR_DECISION");
    expect(stale.ok === false ? stale.error.message : "").toMatch(/./); // a stated reason, not a silent no-op

    // Nothing moved: the refused submission is not a second choice.
    expect(game.stateHash()).toBe(hashBefore);
    expect(JSON.stringify(game.p2.resources())).toBe(resourcesBefore);
    expect(game.zoneOf("p2big")).toBe("base");
    expect(game.seat(P3).decision()).toMatchObject({ kind: "pick", seat: P3 });

    // …and the game still finishes normally from the live prompt.
    await game.seat(P3).pick("p3grunt");
    await game.settle();
    expect(game.zoneOf("p2big")).toBe("base"); // only the two real picks died
    expect(game.zoneOf("tianna")).toBe("trash");
    expect(game.zoneOf("p3grunt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: [Deflect] is not quoted on Tianna's entry — the chooser pick carries no surcharge (rules 204.2.a / 809.1.c / 809.1.d)", async () => {
    // Expected: Tianna's option carries `surcharge: 1` ([Deflect] is a mandatory additional cost
    // incurred once per choice of her, Power of any Domain — 809.1.c/.c.1), and the units without
    // [Deflect] carry none, so both tabs can render the tax on exactly her row.
    // Actual: the "each other player chooses" pick is raised with plain options — every entry is
    // free, so the surcharge is neither quoted nor payable.
    const game = await board().build();
    await game.p1.cast("edict");
    await game.settle();
    const d = game.decision();
    const byCard = new Map((d?.kind === "pick" ? d.options : []).map((o) => [o.card as string, o]));
    expect(byCard.get("tianna")?.surcharge).toBe(1);
    expect(byCard.get("p2big")?.surcharge).toBeUndefined();
    expect(byCard.get("p3grunt")?.surcharge).toBeUndefined();
  });

  test.failing("BUG: choosing Tianna charges no [Deflect] Power — the surcharge must be paid exactly once (rules 204.2.a / 809.1.c)", async () => {
    // Expected: P2 pays exactly one Power (any Domain) for naming Tianna — rainbow 2 → 1 — and the
    // seat that never names her pays nothing.
    // Actual: no Power is deducted from anyone; Tianna is as free to choose as a vanilla unit.
    const game = await board().build();
    await game.p1.cast("edict");
    await game.settle();
    await game.p2.pick("tianna");
    expect(game.p2.power("rainbow")).toBe(1); // charged once, not zero times and not twice
    await game.seat(P3).pick("p3grunt");
    await game.settle();
    expect(game.p2.power("rainbow")).toBe(1); // and not again on resolution
  });
});
