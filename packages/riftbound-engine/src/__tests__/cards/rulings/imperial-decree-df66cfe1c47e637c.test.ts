/**
 * Ruling df66cfe1c47e637c — Imperial Decree (OGN-221 → ogn-221-298) · [Action] 5 + [order][order] · "When any unit takes damage
 *     this turn, kill it."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · [Action] 1 + [mind] · "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."
 *
 * Q: Imperial Decree, then a Repeated Bellows Breath at a unit protected by Zhonya's Hourglass — does the unit die?
 * A: Yes. Two damage instances ⇒ two Decree kill-triggers, added after Breath fully resolves. LIFO: trigger #2 kills →
 *    Zhonya's replaces that death (Hourglass killed; unit healed, exhausted, recalled). Trigger #1 then kills the unit —
 *    no protection left.
 * Rules: 820 (Repeat = the effect twice → two damage events), 383 (one trigger per event), 331/337 (LIFO),
 *        371–373 (a replacement applies once and is consumed), 359.3.e.3 (the trigger tracks the unit to base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const BELLOWS_BREATH = "sfd-080-221";
const ZHONYAS = "ogn-077-298";

/** P1's turn with [7] + 2 order + 2 mind. P2: Zhonya's face up in base; Veteran (4) + Holder (3) at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 2, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P2, ZHONYAS, "zhonyas")
    .unit(P2, "bf1", { might: 4, name: "Veteran" }, "vet")
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, BELLOWS_BREATH, "breath");
}

/** Decree resolves; the Repeated Breath on {Veteran} resolves → two Decree triggers wait on the chain. */
async function twoTriggers(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  await game.p1.cast("breath", { repeat: 1, targets: ["vet"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Breath resolves: 1 + 1 to Veteran
  return game;
}

describe("Ruling df66cfe1c47e637c — two Decree triggers vs one Zhonya's Hourglass: the unit dies", () => {
  test("the Repeated Breath is two damage instances: Veteran has 2 damage (alive, 4 Might) and TWO Decree kill-triggers sit on the chain only after Breath left it", async () => {
    const game = await twoTriggers();
    expect(game.zoneOf("breath")).toBe("trash");
    expect(game.state("vet")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    const hits = (game.gameState.damageLog ?? []).filter((r) => r.target === "vet");
    expect(hits.map((r) => r.amount)).toEqual([1, 1]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "decree", triggered: true }),
      expect.objectContaining({ cardId: "decree", triggered: true }),
    ]);
    expect(game.zoneOf("zhonyas")).toBe("base"); // nothing has died yet
  });

  test("trigger #2 resolves first: Zhonya's replaces the death — Hourglass killed (P2's trash), Veteran healed, exhausted and recalled to base; trigger #1 still waits", async () => {
    const game = await twoTriggers();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.p2.trash()).toContain("zhonyas");
    expect(game.state("vet")).toMatchObject({ damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", triggered: true })]);
  });

  test("ruling: trigger #1 then resolves, follows Veteran to base and kills it — no Hourglass left", async () => {
    const game = await twoTriggers();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vet")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.p2.units("base")).toEqual([]);
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // untouched bystander
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — an UN-repeated Breath is one damage instance ⇒ one Decree trigger ⇒ Zhonya's saves Veteran (alive, exhausted, in base)", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.cast("breath", { repeat: 0, targets: ["vet"] });
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("vet")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });
});
