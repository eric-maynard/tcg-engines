/**
 * Ruling 3db3a018d9466a22 — Shadow's Call (UNL-165 → unl-165-219) · Spell · Order · 2
 *   "Choose a friendly unit without [Temporary]. Give it [Temporary]. Draw 2."
 *   (Shadow unl-194-219 is listed by the scrape but plays no part.)
 *
 * Q: Can I play Shadow's Call with no unit on the board just to draw 2?
 * A: No. "Choose a friendly unit without [Temporary]" is a target; with no legal target the spell cannot be put on the
 *    chain at all, so there is no way to reach the "Draw 2".
 * Rules: 355.10 (a "choose" instruction is a targeting requirement), 355.7 / 358 (no legal target → cannot be played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHADOWS_CALL = "unl-165-219";
const TEMP_UNIT = { abilities: [{ keyword: "Temporary", type: "keyword" }], cardType: "unit", keywords: ["Temporary"], might: 2, name: "Fleeting" } as const;

describe("Ruling 3db3a018d9466a22 — Shadow's Call needs a friendly non-Temporary unit; no unit, no draw", () => {
  test("no friendly unit anywhere (the opponent's units don't count): Shadow's Call is NOT playable, an attempt is rejected, nothing is spent or drawn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Enemy" }, "enemy")
      .hand(P1, SHADOWS_CALL, "call")
      .build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "call")).toBe(false);
    const r = await game.p1.try((p) => p.cast("call"));
    expect(r.ok).toBe(false);
    const r2 = await game.p1.try((p) => p.cast("call", { targets: "enemy" }));
    expect(r2.ok).toBe(false);
    expect(game.zoneOf("call")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.hand()).toEqual(["call"]); // no "Draw 2"
    expect(game.chain()).toEqual([]);
  });

  test("a friendly unit that already HAS [Temporary] is not a legal choice either — still unplayable", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", TEMP_UNIT, "fleeting").hand(P1, SHADOWS_CALL, "call").build();
    expect(game.state("fleeting").keywords).toContain("Temporary");
    expect(game.p1.can("cast", "call")).toBe(false);
    const r = await game.p1.try((p) => p.cast("call", { targets: "fleeting" }));
    expect(r.ok).toBe(false);
    expect(game.p1.hand()).toEqual(["call"]);
  });

  test("contrast — with a friendly unit: cast for 2, the unit gains [Temporary], and P1 draws 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .hand(P1, SHADOWS_CALL, "call")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    expect(game.p1.can("cast", "call")).toBe(true);
    await game.p1.cast("call", { targets: "pal" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.state("pal").keywords).toContain("Temporary");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });
});
