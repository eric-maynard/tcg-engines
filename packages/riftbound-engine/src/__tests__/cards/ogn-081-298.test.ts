/**
 * Seal of Focus — ogn-081-298 · Gear · Calm · 0 energy + [calm]
 *
 *   [Exhaust]: [Reaction] — [Add] [calm].
 *   (Abilities that add resources can't be reacted to.)
 *
 * Add abilities resolve immediately on finalization — they never sit on the
 * chain (rule 429 / "Triggered and activated abilities that Add resources
 * resolve as soon as they are finalized").
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-081-298";
const DISINTEGRATE = "ogn-005-298"; // [Action] 4 energy: deal 3 to a unit at a battlefield

describe("Seal of Focus (ogn-081-298)", () => {
  test("costs 0 energy + 1 calm to play; lands in base as gear", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { calm: 1 } }).hand(P1, CARD, "seal").build();
    expect(game.p1.can("equip", "seal")).toBe(true);
    await game.p1.play("seal");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.gear()).toContain("seal");
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "seal").build();
    expect(noPower.p1.can("equip", "seal")).toBe(false);
  });

  test("[Exhaust]: adds 1 calm power immediately — nothing goes on the chain, the gear becomes exhausted", async () => {
    const game = await scenario().gear(P1, CARD, "seal").build();
    expect(game.state("seal").isReady).toBe(true);
    await game.p1.activate("seal");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    const d = game.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the exhaust cost gates it: cannot be activated again while exhausted; readies next turn", async () => {
    const game = await scenario().gear(P1, CARD, "seal", { exhausted: true }).build();
    expect(game.p1.can("activate", "seal")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1 — Awaken readied it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("seal").isReady).toBe(true);
    expect(game.p1.can("activate", "seal")).toBe(true);
  });

  test("[Reaction] timing: usable on the opponent's turn and in response to an opponent's spell on the chain", async () => {
    const oppTurn = await scenario().active(P2).gear(P1, CARD, "seal").build();
    expect(oppTurn.p1.can("activate", "seal")).toBe(true);

    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "ally")
      .gear(P1, CARD, "seal")
      .hand(P2, DISINTEGRATE, "dis")
      .build();
    await game.p2.cast("dis", { targets: "ally" });
    expect(game.chain()).toHaveLength(1);
    await game.p2.passPriority();
    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    expect(game.p1.power("calm")).toBe(1);
    // Still only the spell on the chain — the Add ability resolved at once and cannot be reacted to.
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]?.cardId).toBe("dis");
  });

  test("the added calm power can pay for a calm card in the same turn", async () => {
    const game = await scenario().resources(P1, { energy: 0 }).gear(P1, CARD, "seal").hand(P1, CARD, "seal2").build();
    expect(game.p1.can("equip", "seal2")).toBe(false);
    await game.p1.activate("seal");
    expect(game.p1.can("equip", "seal2")).toBe(true);
    await game.p1.play("seal2");
    expect(game.zoneOf("seal2")).toBe("base");
    expect(game.p1.power("calm")).toBe(0);
  });
});
