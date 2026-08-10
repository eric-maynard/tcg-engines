/**
 * Ruling ab9e79719c59dee0 — Imperial Decree (OGN-221 → ogn-221-298) · Action [5][order][order] · "When any unit takes damage this turn, kill it."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · Action [1][mind] · "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment +1 · "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and
 *     recall me."   (worn by Irelia, Graceful sfd-141-221, 4 Might.)
 *
 * Q: Imperial Decree, then a Repeated Bellows Breath on an Irelia wearing Guardian Angel — does Irelia die?
 * A: Yes. The repeated Breath is two damage instances ⇒ Decree triggers twice (ID1, ID2). LIFO: ID2 resolves first — Guardian
 *    Angel replaces that death (GA killed; Irelia healed, exhausted, recalled). ID1 then resolves, tracks Irelia to base and kills
 *    her; GA is single-use and gone.
 * Rules: 820 (Repeat: instructions executed twice → two damage events), 383 (one trigger per event), 331 (LIFO), 371–373
 *        (replacement effects apply once), 359.3.e.3 (a target that changed location is still that object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const BELLOWS_BREATH = "sfd-080-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const IRELIA_GRACEFUL = "sfd-141-221";

/** P1's turn with [7] + 2 order + 2 mind. P2's Irelia (4 +1 GA = 5) at P2's bf1 wearing Guardian Angel. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 2, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", IRELIA_GRACEFUL, "irelia", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "irelia" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, BELLOWS_BREATH, "breath");
}

/** Decree resolves; then the Repeated Breath on {Irelia} resolves → two Decree triggers are on the chain. */
async function twoTriggers(): Promise<Game> {
  const game = await board().build();
  expect(game.state("irelia")).toMatchObject({ attachments: ["ga"], might: 5 });
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  await game.p1.cast("breath", { repeat: 1, targets: ["irelia"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Breath resolves: 1 + 1 to Irelia
  return game;
}

describe("Ruling ab9e79719c59dee0 — two Decree triggers vs one Guardian Angel: Irelia dies", () => {
  test("the Repeated Breath is two damage instances: Irelia has 2 damage and TWO Imperial Decree kill-triggers sit on the chain", async () => {
    const game = await twoTriggers();
    expect(game.zoneOf("breath")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    const hits = (game.gameState.damageLog ?? []).filter((r) => r.target === "irelia");
    expect(hits.map((r) => r.amount)).toEqual([1, 1]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "decree", triggered: true }),
      expect.objectContaining({ cardId: "decree", triggered: true }),
    ]);
  });

  test("ID2 resolves first: Guardian Angel replaces the death — GA killed (P2's trash), Irelia healed, exhausted and recalled to base at 4 Might; ID1 still waits", async () => {
    const game = await twoTriggers();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.trash()).toContain("ga");
    expect(game.state("irelia")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", triggered: true })]);
  });

  test("ruling: ID1 then resolves, follows Irelia to base and kills her — no Guardian Angel left to save her", async () => {
    const game = await twoTriggers();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.units("base")).toEqual([]);
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // untouched bystander
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — an UN-repeated Breath is one damage instance ⇒ one Decree trigger ⇒ Guardian Angel saves Irelia (alive in base)", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.cast("breath", { repeat: 0, targets: ["irelia"] });
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });
});
