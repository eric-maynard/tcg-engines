/**
 * Ruling c3385eec89b2e328 — Relentless Pursuit (SFD-184 → sfd-184-221) Action [2][rainbow] "Move a friendly unit. You may attach an
 *   Equipment with the same controller to it. This turn, that unit has 'When I conquer, you may move me to my base.'"
 *   × Emperor's Divide (SFD-043 → sfd-043-221) [Hidden] Action [2] "Move any number of friendly units at a battlefield to their base."
 *
 * Q: If I Relentless Pursuit (or Emperor's Divide) a READY unit, does moving exhaust it?
 * A: No. Only the Standard Move exhausts (it is that action's cost). A move performed by a card effect leaves the unit's
 *    ready/exhausted state unchanged unless the card says otherwise — ready units arrive ready.
 * Rules: 141.2 / 144 (Standard Move: exhaust as cost), 421 (move by effect), FAQ consistency.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
const EMPERORS_DIVIDE = "sfd-043-221";

/** P1's turn. P1 holds bf1 with two READY units (A 3, B 2) and has a ready Runner (3) in base; bf2 is uncontrolled/empty.
 * P1: Relentless Pursuit + Emperor's Divide in hand, [4] + 1 rainbow. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Unit A" }, "a")
    .unit(P1, "bf1", { might: 2, name: "Unit B" }, "b")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, RELENTLESS_PURSUIT, "pursuit")
    .hand(P1, EMPERORS_DIVIDE, "divide");
}

/** Drive a cast to completion: pass priority, answer P1's destination pick with `dest`, decline optional extras. */
async function resolveWith(game: Game, card: string, dest?: string): Promise<void> {
  for (let i = 0; i < 12 && game.zoneOf(card) !== "trash"; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d.kind === "pick" && d.seat === P1 && dest !== undefined && d.options.some((o) => o.key === dest)) {
      await game.p1.pick(dest);
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.no(); // "you may attach an Equipment" — not relevant here
    } else if (d.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await game.p1.decline();
    } else {
      break;
    }
  }
  expect(game.zoneOf(card)).toBe("trash");
}

describe("Ruling c3385eec89b2e328 — effect-moves (Relentless Pursuit, Emperor's Divide) don't exhaust ready units", () => {
  test("baseline: a STANDARD move does exhaust — Runner walking to bf1 arrives exhausted", async () => {
    const game = await board().build();
    expect(game.state("runner").isReady).toBe(true);
    await game.p1.move("runner", "bf1");
    expect(game.state("runner")).toMatchObject({ isExhausted: true, location: "bf1" });
  });

  test("Relentless Pursuit on the ready Runner (base → bf1): it is moved by the spell and is STILL READY on arrival", async () => {
    const game = await board().build();
    await game.p1.cast("pursuit", { targets: "runner" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    await resolveWith(game, "pursuit", "battlefield-bf1");
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.violations()).toEqual([]);
  });

  test("Emperor's Divide moving the two ready units at bf1 to base: both arrive in base STILL READY", async () => {
    const game = await board().build();
    expect(game.state("a").isReady && game.state("b").isReady).toBe(true);
    await game.p1.cast("divide", { targets: ["a", "b"] });
    expect(game.p1.energy()).toBe(2);
    await resolveWith(game, "divide");
    await game.settle();
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.state("a")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.state("b")).toMatchObject({ isExhausted: false, isReady: true });
    // …so they can still take a Standard Move this turn.
    expect(game.p1.can("move")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("and the converse holds (state is simply preserved): an EXHAUSTED unit moved by Relentless Pursuit stays exhausted — the spell neither exhausts nor readies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 3, name: "Tired" }, "tired", { exhausted: true })
      .hand(P1, RELENTLESS_PURSUIT, "pursuit")
      .build();
    await game.p1.cast("pursuit", { targets: "tired" });
    await resolveWith(game, "pursuit", "battlefield-bf1");
    await game.settle();
    expect(game.locationOf("tired")).toBe("bf1");
    expect(game.state("tired").isExhausted).toBe(true);
  });
});

void P2;
