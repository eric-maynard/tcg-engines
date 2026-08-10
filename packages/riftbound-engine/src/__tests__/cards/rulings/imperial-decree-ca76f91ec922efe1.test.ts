/**
 * Ruling ca76f91ec922efe1 — Imperial Decree (ogn-221-298) × Zhonya's Hourglass (ogn-077-298)
 *   Imperial Decree — [Action] · [5][order][order]: "When any unit takes damage this turn, kill it."
 *   Zhonya's Hourglass — Gear · [Hidden]: "If a friendly unit would die, kill this instead. Heal that unit, exhaust it,
 *   and recall it."
 *
 * Q: Does Imperial Decree trigger the moment something takes damage?
 * A: Yes — for the rest of the turn it is a triggered ability: the damage EVENT fires the trigger, which goes on the
 *    chain (so there is a Reaction window, e.g. to flip a hidden Zhonya's) and kills the damaged unit on resolution.
 *    It is not retroactive: units already damaged before the Decree resolved are not killed.
 * Rules: 383 / 390.2 (delayed triggered ability uses the chain), 332 (Closed state → Reactions), 811 (play from hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const ZHONYAS = "ogn-077-298";
/** Inline [1] action spell: deal 1 to a unit — non-lethal by itself. */
const STING = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Sting", timing: "action" } as const;

/**
 * P1's turn 3 with [6] + 2 order. P2 holds bf1 with a healthy 4-Might Target and an already-damaged 4-Might Veteran
 * (1 damage from earlier); a Zhonya's Hourglass lies facedown at bf1 for P2. P1: Decree + Sting in hand.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 6, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
    .unit(P2, "bf1", { might: 4, name: "Veteran" }, "veteran", { damage: 1 })
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, STING, "sting");
}

async function decreeResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Sting the Target and pass until Sting itself has resolved (damage dealt), stopping at whatever comes next. */
async function stingTarget(game: Game): Promise<void> {
  await game.p1.cast("sting", { targets: "target" });
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "sting"); i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("sting")).toBe("trash");
  expect(game.state("target").damage).toBe(1);
}

describe("Ruling ca76f91ec922efe1 — Imperial Decree fires a chain trigger the moment a unit takes damage", () => {
  test("not retroactive: the Veteran that was ALREADY damaged when the Decree resolved is not killed, and nothing is on the chain", async () => {
    const game = await decreeResolved();
    expect(game.zoneOf("veteran")).toBe("battlefield-bf1");
    expect(game.state("veteran").damage).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("the damage event triggers it: once Sting's 1 damage lands on the Target, a TRIGGERED Decree item is on the chain (Target still alive, state Closed)", async () => {
    const game = await decreeResolved();
    await stingTarget(game);
    expect(game.zoneOf("target")).toBe("battlefield-bf1"); // not dead yet — the kill is a separate chain item
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("no reaction: the trigger resolves and the damaged Target is killed (the pre-damaged Veteran still isn't)", async () => {
    const game = await decreeResolved();
    await stingTarget(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.zoneOf("veteran")).toBe("battlefield-bf1");
    expect(game.zoneOf("zh")).toBe("facedown-bf1"); // never flipped
  });

  test("reaction window: with the Decree trigger pending P2 gets priority and flips the hidden Zhonya's; the trigger's kill is then replaced — Hourglass dies instead, Target recalled to base healed + exhausted", async () => {
    const game = await decreeResolved();
    await stingTarget(game);
    // Hand priority to P2 while the trigger is still on the chain.
    for (let i = 0; i < 3 && game.actingSeat() !== P2; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().some((c) => c.triggered)).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "zh")).toBe(true);
    await game.p2.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead of the Target
    expect(game.zoneOf("target")).toBe("base");
    expect(game.state("target").damage).toBe(0);
    expect(game.state("target").isExhausted).toBe(true);
    expect(game.zoneOf("veteran")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
