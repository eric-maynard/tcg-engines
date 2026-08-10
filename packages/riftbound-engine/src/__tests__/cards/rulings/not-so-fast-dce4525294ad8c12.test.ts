/**
 * Ruling dce4525294ad8c12 — Not So Fast (SFD-045 → sfd-045-221) · Spell · Calm · 2 + [calm] · [Reaction]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *      location. Deal 1 to them."
 *
 * Q: Can Not So Fast counter Elder Dragon's "When you play me" ability?
 * A: Yes. The Dragon itself enters immediately (no window to react to the unit), then its play trigger goes on the chain
 *    choosing MY units (friendly to me) → I get priority and may Not So Fast the trigger; LIFO: NSF resolves first, the
 *    countered ability leaves the chain and deals no damage. The Dragon (and its passive) stay.
 * Rules: 339–340 (permanents resolve at once; play triggers then chain), 383/425 (countering an ability), 331 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const ELDER_DRAGON = "unl-118-219";

/** P2's turn with exactly 12 + 4 body. P1 holds bf1 with Scout (1) and has Page (1) in base, Not So Fast in hand + 2 + [calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 4 } })
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 1, name: "Page" }, "page")
    .hand(P2, ELDER_DRAGON, "dragon")
    .hand(P1, NOT_SO_FAST, "nsf");
}

/** P2 plays the Dragon and names one of P1's units at each location; P2 passes → P1 holds priority with the trigger on the chain. */
async function dragonTriggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("dragon");
  // The unit is already on the board — nothing could be played "in response to the unit".
  expect(game.zoneOf("dragon")).toBe("base");
  // Its play trigger is being finalized: P2 chooses "up to one enemy unit at each location".
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
  await game.p2.pick("page");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("scout");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P2, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling dce4525294ad8c12 — Not So Fast counters Elder Dragon's play trigger", () => {
  test("the trigger chose P1's units (friendly to P1), so Not So Fast is castable and offers exactly that ability as its target", async () => {
    const game = await dragonTriggerOnChain();
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const field = game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toEqual(["dragon"]);
    await game.p1.cast("nsf");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "nsf"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("LIFO: Not So Fast resolves first and counters the ability — no damage is dealt to Scout or Page, both survive; the Dragon itself stays on the board", async () => {
    const game = await dragonTriggerOnChain();
    await game.p1.cast("nsf");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("page")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("dragon")).toBe("base"); // the unit was never on the chain to counter
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Not So Fast the trigger resolves: 1 damage each, and the Dragon's passive makes that lethal → both 1-Might units die", async () => {
    const game = await dragonTriggerOnChain();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("page")).toBe("trash");
  });
});
