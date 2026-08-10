/**
 * Ruling bd1e9b90cf899340 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it. (This isn't a move.)"
 *   × Fading Memories (OGN-180 → ogn-180-298) · Action · Chaos · 4 + [chaos]
 *   "Give a unit at a battlefield or a gear [Temporary]. (Kill it at the start of its controller's Beginning Phase.)"
 *
 * Q: A controls a unit and a Zhonya's; B casts two Fading Memories (one on each). Can A order the two Temporary
 *    triggers so the Hourglass still saves the unit?
 * A: Yes. Both Temporary triggers are A's (A controls both permanents) and fire together at the start of A's turn, so A
 *    orders them; ordered so the unit's death is processed while the Hourglass is still around, the Hourglass is killed
 *    instead and the unit is recalled to base exhausted. The unit keeps Temporary and will die to it next turn.
 * Rules: 383.3.d (controller orders simultaneous triggers), 816 (Temporary), 369–373 (replacement effects).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const FADING_MEMORIES = "ogn-180-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/** B's (P2's) turn with 8 energy + [chaos][chaos] and two Fading Memories. A (P1) holds bf1 with Guard (3) and has a Zhonya's in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, ZHONYAS, "zh")
    .hand(P2, FADING_MEMORIES, "fm1")
    .hand(P2, FADING_MEMORIES, "fm2");
}

/** P2 makes both the Hourglass and the Guard Temporary, then ends the turn → start of P1's Beginning Phase. */
async function bothTemporaryThenP1Turn(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("fm1", { targets: "zh" });
  await game.settle();
  await game.p2.cast("fm2", { targets: "guard" });
  await game.settle();
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.state("zh").keywords).toContain("Temporary");
  expect(game.state("guard").keywords).toContain("Temporary");
  expect(game.state("zh").controller).toBe(P1);
  expect(game.state("guard").controller).toBe(P1);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling bd1e9b90cf899340 — two Temporary triggers, both Player A's: A orders them and the Hourglass can still save the unit", () => {
  test("at the start of A's Beginning Phase BOTH Temporary triggers are on the chain and both are controlled by A (P1) — not by B who cast Fading Memories", async () => {
    const game = await bothTemporaryThenP1Turn();
    const items = game.chain();
    expect(items.map((c) => c.cardId).sort()).toEqual(["guard", "zh"]);
    expect(items.every((c) => c.triggered && c.controller === P1)).toBe(true);
  });

  // Expected (ruling, 383.3.d): P1 — controller of both — is offered the ORDER of the two simultaneous triggers.
  // Actual: the engine stacks them itself (Guard's on top) and goes straight to priority; no order decision surfaces.
  test("ruling bd1e9b90cf899340 — engine surfaces no trigger-order decision to P1 for the two simultaneous Temporary triggers", async () => {
    const game = await bothTemporaryThenP1Turn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect((d as OrderD).items.map((i) => i.card).sort()).toEqual(["guard", "zh"]);
    // Choosing "Hourglass bottom, Guard top" (Guard's death processed first) is accepted.
    const od = d as OrderD;
    await game.p1.order([od.items.find((i) => i.card === "zh")?.key as string, od.items.find((i) => i.card === "guard")?.key as string]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["zh", "guard"]);
  });

  test("with the Guard's trigger resolving while the Hourglass is still on the board, Zhonya's replaces the death: the HOURGLASS is killed instead and the Guard is healed, exhausted and recalled to base", async () => {
    const game = await bothTemporaryThenP1Turn();
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId)).toEqual(["zh", "guard"]); // Guard's trigger on top
    for (let i = 0; i < 4 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    // The Hourglass's own Temporary trigger is still waiting — and now has nothing left to kill.
    expect(game.chain().map((c) => c.cardId)).toEqual(["zh"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.p1.trash()).toEqual(["zh"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the saved Guard still has [Temporary] (Fading Memories granted it for good) — it dies at the start of A's NEXT Beginning Phase with no Hourglass left to save it", async () => {
    const game = await bothTemporaryThenP1Turn();
    await game.settle();
    expect(game.state("guard")).toMatchObject({ location: "base", zone: "base" });
    expect(game.state("guard").keywords).toContain("Temporary");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("guard")).toBe("base");
    await game.advanceTurn(); // → P1 again: Temporary kills it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("guard")).toBe("trash");
  });
});
