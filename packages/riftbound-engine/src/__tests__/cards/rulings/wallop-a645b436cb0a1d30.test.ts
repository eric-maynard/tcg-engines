/**
 * Ruling a645b436cb0a1d30 — Wallop (OGN-146 → ogn-146-298) · Action [2] · "As you play this, you may spend a buff as an additional
 *   cost. If you do, ignore this spell's cost. Ready a unit."
 *   × Sett, Brawler (OGN-164 → ogn-164-298) · 4 Might · "When I'm played and when I conquer, buff me. Spend my buff: Give me +4
 *     [Might] this turn."   × Showstopper (OGN-270) mentioned in the nuances.
 *
 * Q: Does spending a buff for Wallop's additional cost count for Sett, Brawler's +4?
 * A: No. "Spend my buff" is the COST of Sett's own activated ability; a buff spent to pay Wallop pays Wallop, not Sett — no +4.
 *    Nuances: Sett's ability is not a Reaction (can't be used in response); you may pay Wallop with ANOTHER unit's buff, so
 *    the line "activate Sett for +4, then Wallop (spending Pal's buff) to ready Sett" works.
 * Rules: 366 (activated ability: cost → effect, only that ability's effect), 356 (additional costs), 336–337 (closed state:
 *        Reactions only), 702 (buffs / spending a buff).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WALLOP = "ogn-146-298";
const SETT_BRAWLER = "ogn-164-298";

/** P1's turn with [2]. Sett (buffed → 5, exhausted) and a buffed 2-Might Pal (→ 3) in base; Wallop in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true, exhausted: true })
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal", { buffed: true })
    .hand(P1, WALLOP, "wallop");
}

describe("Ruling a645b436cb0a1d30 — a buff spent on Wallop's cost is not Sett's 'Spend my buff'", () => {
  test("setup: buffed Sett is 5 Might and exhausted; his 'Spend my buff' ability is available", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: true, might: 5 });
    expect(game.p1.can("activate", "sett")).toBe(true);
  });

  test("ruling: Wallop paid by spending SETT's buff (cost ignored: [2] kept) readies Sett — but Sett gets NO +4: he is a plain 4-Might unit now", async () => {
    const game = await board().build();
    await game.p1.cast("wallop", { payOptional: true, targets: "sett", answers: ["sett"] });
    // If the engine asks whose buff to spend, name Sett's.
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("sett");
    }
    expect(game.p1.energy()).toBe(2); // "ignore this spell's cost"
    await game.settle();
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, isReady: true, might: 4, mightModifier: 0 });
    expect(game.state("pal").isBuffed).toBe(true);
    // (the harness's generic costPaid invariant doesn't know about "ignore this spell's cost"; skip it here)
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("contrast: Sett's own ability — spend HIS buff as its cost — is what gives +4 this turn (5 → 8)", async () => {
    const game = await board().build();
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8, mightModifier: 4 });
    await game.advanceTurn();
    expect(game.state("sett").might).toBe(4);
  });

  test("nuance: activate Sett (+4, his buff spent) THEN Wallop paid with PAL's buff to ready Sett — Sett ends ready at 8 Might, Pal unbuffed, [2] never spent", async () => {
    const game = await board().build();
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, isExhausted: true, might: 8 });
    await game.p1.cast("wallop", { payOptional: true, targets: "sett", answers: ["pal"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("pal");
    }
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.state("pal")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.state("sett")).toMatchObject({ isReady: true, might: 8 });
  });

  test("nuance: Sett's ability is not a Reaction — with Wallop on the chain it cannot be activated in response", async () => {
    const game = await board().build();
    await game.p1.cast("wallop", { payOptional: false, targets: "sett" });
    expect(game.p1.energy()).toBe(0); // paid normally this time
    expect(game.chain().map((c) => c.cardId)).toEqual(["wallop"]);
    expect(game.p1.can("activate", "sett")).toBe(false);
    expect((await game.p1.try((p) => p.activate("sett"))).ok).toBe(false);
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isReady: true, might: 5 });
    expect(game.p1.can("activate", "sett")).toBe(true); // open state again
  });
});
