/**
 * Ruling 71f490691f9b76ca — Not So Fast (SFD-045 → sfd-045-221) · Reaction · [2][calm] "Counter an enemy spell or ability that
 *   chooses a friendly unit or gear." × Switcheroo (SFD-145 → sfd-145-221) · Action · [2][chaos][chaos] "[Hidden] Swap the Might
 *   of two units at the same battlefield this turn."
 *
 * Q: Does Not So Fast counter Switcheroo?
 * A: Yes. Switcheroo chooses (targets) two units as it is played; if one is friendly to the Not So Fast player it is a
 *    legal object. Played while Switcheroo is on the chain, it counters it: Switcheroo does nothing, goes to trash,
 *    and its energy is not refunded.
 * Rules: 355 (targets chosen on play), 425.1.a (countered → does nothing, cleared to trash), 425.1.c (no refund).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const SWITCHEROO = "sfd-145-221";

/** P1's turn. P2 holds bf1 with Big (5) and Small (1) — both friendly to P2, the Not So Fast player. P1: Switcheroo + [2][chaos][chaos]; P2: NSF + [2][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 1, name: "Small" }, "small")
    .hand(P1, SWITCHEROO, "swap")
    .hand(P2, NOT_SO_FAST, "nsf");
}

async function switcherooOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("swap", { targets: ["big", "small"] });
  // 1. Targeting: both units are chosen as Switcheroo is played.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "swap", controller: P1 })]);
  expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["big", "small"]);
  expect(game.p1.energy()).toBe(0);
  expect(game.p1.power("chaos")).toBe(0);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 71f490691f9b76ca — Not So Fast counters Switcheroo", () => {
  test("control: unopposed, Switcheroo resolves and swaps the two Mights this turn (5↔1)", async () => {
    const game = await switcherooOnChain();
    await game.p2.passPriority();
    expect(game.zoneOf("swap")).toBe("trash");
    expect(game.state("big").might).toBe(1);
    expect(game.state("small").might).toBe(5);
  });

  test("2. reaction timing: while Switcheroo is on the chain, Not So Fast is castable by P2 and Switcheroo is offered as its object", async () => {
    const game = await switcherooOnChain();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const offered = (game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("swap");
  });

  test("3. resolution: Not So Fast counters Switcheroo — it does nothing (Mights stay 5 and 1), goes to trash, and P1's [2][chaos][chaos] is not refunded", async () => {
    const game = await switcherooOnChain();
    await game.p2.cast("nsf", { targets: "swap" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["swap", "nsf"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // NSF resolves → counters Switcheroo
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("swap")).toBe("trash"); // 425.1.a.1
    expect(game.state("big").might).toBe(5);
    expect(game.state("small").might).toBe(1);
    expect(game.p1.energy()).toBe(0); // 425.1.c — no refund
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
