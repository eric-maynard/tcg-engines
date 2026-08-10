/**
 * Ruling 937ba81f729159aa — Sacrifice (UNL-173 → unl-173-219) · Reaction · Order · 1
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction · 2+[mind] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   (Vi = Vi, Peacekeeper unl-176-219 — a printed 5-Might unit.)
 *
 * Q: I Sacrifice my 5-Might Vi; the opponent reacts with Smoke Screen on Vi. Does Vi still die and do I still draw 2 / channel 1?
 * A: Yes. Killing Vi is Sacrifice's additional COST, paid while the spell is finalized — Vi is in the trash before the opponent
 *    ever has priority, so Smoke Screen can't find her and can't undo the cost. Their only window is BEFORE Sacrifice is played:
 *    a Vi already Smoke Screened to 1 is not Mighty and can't be chosen as the cost.
 * Rules: 356 / 357.2 (additional costs paid during finalization), 340 (priority only after finalization), 780 (Mighty = 5+).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const SMOKE_SCREEN = "ogn-093-298";
const VI = "unl-176-219"; // Vi, Peacekeeper — 5 Might
const LECTURING_YORDLE = "ogn-087-298"; // "When you play me, draw 1." — just to hand P2 a Reaction window BEFORE Sacrifice

/** P1's turn: Vi (5, Mighty) in base, Sacrifice + Yordle in hand, 4 energy, no runes; P2: Smoke Screen with exactly 2+[mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", VI, "vi")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, SACRIFICE, "sac")
    .hand(P1, LECTURING_YORDLE, "yordle")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

describe("Ruling 937ba81f729159aa — Smoke Screen in response to Sacrifice is too late: Vi already paid the cost", () => {
  test("casting Sacrifice kills Vi IMMEDIATELY as the cost (Vi in trash, Sacrifice on the chain) — by the time P2 holds priority Smoke Screen has no Vi to target", async () => {
    const game = await board().build();
    expect(game.state("vi").might).toBe(5);
    expect(game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["vi"]);
    await game.p1.cast("sac", { sacrifice: "vi" });
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("vi")).toBe("trash"); // cost paid during finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sac", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's FIRST window
    const targets = (game.p2.option("cast", "smoke")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(targets).not.toContain("vi");
    const r = await game.p2.try((p) => p.cast("smoke", { targets: "vi" }));
    expect(r.ok).toBe(false);
  });

  test("Sacrifice then resolves in full: P1 draws 2 and channels 1 rune exhausted; Vi stays dead", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("sac", { sacrifice: "vi" });
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the opponent's real window is BEFORE Sacrifice: P2 Smoke Screens Vi (→ 1 Might) in an earlier Reaction window this turn; Vi is no longer Mighty, so Sacrifice cannot be played with her as the cost", async () => {
    const game = await board().build();
    // Give P2 a Reaction window on P1's turn: the Yordle's play trigger opens a chain.
    await game.p1.play("yordle");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("smoke", { targets: "vi" });
    await game.settle();
    expect(game.state("vi")).toMatchObject({ might: 1, zone: "base" });
    // Now, in P1's open main phase, Sacrifice has no legal Mighty unit to kill.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const opt = game.p1.option("cast", "sac");
    const offered = opt?.fields.find((f) => f.arg === "sacrifice")?.options ?? [];
    expect(offered).not.toContain("vi");
    const r = await game.p1.try((p) => p.cast("sac", { sacrifice: "vi" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.zoneOf("sac")).toBe("hand");
  });
});
