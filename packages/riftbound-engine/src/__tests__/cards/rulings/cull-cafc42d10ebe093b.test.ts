/**
 * Ruling cafc42d10ebe093b — scraped under Cull (SFD-134 → sfd-134-221, an Equipment — name collision only); the
 *   question is about Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *     "Each player kills one of their units."
 *
 * Q: Can Cull the Weak be played if you have no units?
 * A: Yes. It does not target — each player's unit is chosen on RESOLUTION, so no target has to exist at play time.
 *    With no units you "do as much as you can" (kill nothing) while the opponent still kills one of theirs. The
 *    kill is an effect, not an additional cost — were it a cost you would need a unit to play it.
 * Rules: 355 (targeting vs resolution-time choices), 359.3.e.11 (do as much as you can), 356 (additional costs), 422.1.a.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const CRUEL_PATRON = "ogn-208-298"; // "As an additional cost to play me, kill a friendly unit." — the cost contrast

/** P1's turn: NO units at all, exactly 2 + [order]. P2: Big (4) at its bf1 and Small (1) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P2, "base", { might: 1, name: "Small" }, "small")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling cafc42d10ebe093b — Cull the Weak is playable with no units of your own", () => {
  test("no units required: P1 controls nothing, yet Cull the Weak is legal, costs exactly 2 + [order], and goes on the chain with no unit chosen", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    const targetField = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    // Nothing of P2's is ever offered to P1 (players pick their OWN unit, and only at resolution).
    expect((targetField?.options ?? []).flat()).not.toContain("big");
    expect((targetField?.options ?? []).flat()).not.toContain("small");
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("small")).toBe("base");
  });

  test("do as much as you can: on resolution P1 kills nothing, and P2 — asked at resolution, no declining — must kill one of theirs", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
    expect(game.actingSeat()).toBe(P2);
    await game.p2.pick("small");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("even with NO units on either side it is still castable and simply resolves doing nothing", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CULL_THE_WEAK, "cull").build();
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    await game.settle();
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("not a cost — contrast with Cruel Patron, whose kill IS an additional cost: with no friendly unit it cannot be played at all", async () => {
    const none = await scenario().resources(P1, { energy: 4 }).unit(P2, "base", { might: 1 }, "small").hand(P1, CRUEL_PATRON, "patron").build();
    expect(none.p1.units()).toEqual([]);
    expect(none.p1.can("play", "patron")).toBe(false);
    const withPawn = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 1 }, "pawn").hand(P1, CRUEL_PATRON, "patron").build();
    expect(withPawn.p1.can("play", "patron")).toBe(true);
  });
});
