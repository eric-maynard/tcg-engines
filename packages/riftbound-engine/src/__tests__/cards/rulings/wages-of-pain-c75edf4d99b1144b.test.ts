/**
 * Ruling c75edf4d99b1144b — Wages of Pain (sfd-070-221) × Gold token (sfd-t03)
 *   Wages of Pain — Spell · Mind · [3] · [Hidden][Action]: "Deal 3 to a unit at a battlefield. Play a Gold gear token
 *   exhausted."   (Flash ogs-011-024 — [Reaction] "Move up to 2 friendly units to base." — is the mover.)
 *
 * Q: Can I react to Wages of Pain by moving the targeted unit to my base?
 * A: Yes. The move is a Reaction on top of Wages (Closed state); LIFO it resolves first and the unit leaves the
 *    battlefield. Wages then finds its "unit at a battlefield" target illegal: no damage is dealt and no new target
 *    may be chosen — but the Gold token is a separate, untargeted instruction and is still played (exhausted).
 * Rules: 330–333 (chain, LIFO), 359.3.e.5 (illegal target → that instruction skipped), 359.3.e.14 (independent
 *        instructions still execute).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const FLASH = "ogs-011-024";

/** P1's turn with exactly [3]; P2's 2-Might Runner (would die to 3) alone at bf1, a second P2 unit there too; P2 holds Flash + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Runner" }, "runner")
    .unit(P2, "bf1", { might: 4, name: "Bystander" }, "bystander")
    .hand(P1, WAGES_OF_PAIN, "wages")
    .hand(P2, FLASH, "flash");
}

async function wagesThenFlash(game: Game): Promise<void> {
  await game.p1.cast("wages", { targets: "runner" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toHaveLength(1);
  expect(game.chain()[0]).toMatchObject({ cardId: "wages", targets: ["runner"] });
  // State is Closed: P1 has priority first, passes; P2 may now react.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: "runner" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["wages", "flash"]);
}

describe("Ruling c75edf4d99b1144b — moving the target to base in response makes Wages of Pain's damage fizzle, Gold still made", () => {
  test("control: unanswered, Wages of Pain deals 3 (the 2-Might Runner dies) and P1 gets an exhausted Gold token", async () => {
    const game = await board().build();
    await game.p1.cast("wages", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("trash");
    const gold = game.p1.gear();
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
  });

  test("P2 reacts with Flash on top of Wages; LIFO — Flash resolves first and the Runner is in P2's base while Wages is still on the chain", async () => {
    const game = await board().build();
    await wagesThenFlash(game);
    // Resolve only Flash (P2 then P1 pass once each).
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "flash"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("runner")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["wages"]);
    expect(game.chain()[0]?.targets).toEqual(["runner"]); // target stays locked — no re-targeting onto the Bystander
  });

  test("Wages of Pain then resolves against an illegal target: Runner takes NO damage and survives in base, the Bystander is untouched, yet P1 still gets the exhausted Gold token", async () => {
    const game = await board().build();
    await wagesThenFlash(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.state("runner").damage).toBe(0);
    expect(game.state("bystander").damage).toBe(0);
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1");
    const gold = game.p1.gear();
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
    expect(game.p2.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
