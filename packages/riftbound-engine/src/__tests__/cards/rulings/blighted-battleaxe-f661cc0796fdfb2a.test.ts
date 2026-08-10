/**
 * Ruling f661cc0796fdfb2a — Blighted Battleaxe (UNL-019 → unl-019-219) · Equipment · Fury · 4 · +4 Might
 *   "[Equip] [1][fury] — At the end of your turn, if I didn't conquer this turn, unattach this and deal 4 to me."
 *
 * Q: Must the EQUIPPED unit specifically conquer, or does any conquest by its controller switch the effect off?
 * A: The equipped unit itself must have conquered. Attached Effect Text becomes the unit's text: "I"/"me" is the
 *    wearer, "this" is the axe. Conquests by other units you control don't count — the axe still unattaches and deals
 *    4 to the wearer.
 * Rules: 136.2.d / 718.3 (Effect Text conferred on the equipped unit; "I" = wearer, "this" = the gear), 383.4.c.2(.a)
 *        (a UNIT conquers when it is present as its controller conquers), 383.2.a (intervening "if"), 317.1 (end of turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BATTLEAXE = "unl-019-219";

/**
 * P1's turn 2. P1: Wearer (5, wearing the axe → 9) and Striker (5) in base; a Holder (2) keeps bf1. P2: Guard (2)
 * holding bf2, plus a Bystander keeping bf3. Nothing conquered yet this turn.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Wearer" }, "wearer", { equippedWith: ["axe"] })
    .card("axe", { def: BATTLEAXE, meta: { attachedTo: "wearer" }, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf3", { might: 2, name: "Bystander" }, "bystander");
}

/** End P1's turn and carry through to P2's main phase; report whether the axe's end-of-turn item ever hit the chain. */
async function endTurnWatchingAxe(game: Game): Promise<boolean> {
  await game.p1.endTurn();
  const raised = game.chain().some((c) => c.cardId === "wearer" && c.triggered);
  await game.settle();
  if (game.turnPlayer() !== P2) {
    await game.advanceToTurnOf(P2);
  }
  return raised;
}

describe("Ruling f661cc0796fdfb2a — Blighted Battleaxe: only the WEARER's own conquest switches the end-of-turn punishment off", () => {
  test("precondition: Wearer is 5 + 4 = 9 with the axe attached (in base) and P1 has conquered nothing this turn", async () => {
    const game = await board().build();
    expect(game.state("wearer")).toMatchObject({ attachments: ["axe"], baseMight: 5, might: 9 });
    expect(game.gameState.conqueredThisTurn[P1] ?? []).toEqual([]);
  });

  test("nobody conquers: at end of turn the conferred ability triggers from the WEARER — the axe unattaches (back to 5) and deals 4 to the wearer (survives at 5, healed in Expiration); axe loose in P1's base", async () => {
    const game = await board().build();
    const raised = await endTurnWatchingAxe(game);
    expect(raised).toBe(true);
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("wearer")).toMatchObject({ attachments: [], might: 5, zone: "base" });
  });

  test("the WEARER conquers bf2 itself (9 into a 2): 'I conquered this turn' — no end-of-turn trigger, axe stays attached into P2's turn", async () => {
    const game = await board().build();
    await game.p1.move("wearer", "bf2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.locationOf("wearer")).toBe("bf2");
    const raised = await endTurnWatchingAxe(game);
    expect(raised).toBe(false);
    expect(game.state("axe").attachedTo).toBe("wearer");
    expect(game.state("wearer")).toMatchObject({ attachments: ["axe"], might: 9 });
  });

  // Expected (ruling): a conquest by ANOTHER unit (Striker takes bf2) does not satisfy "if I didn't conquer" for the
  // Wearer — the axe still unattaches and deals 4 to the Wearer at end of turn.
  // Actual: the engine evaluates the condition against the CONTROLLER's conquer ledger (any P1 conquest this turn),
  // so Striker's conquest suppresses the Wearer's trigger and the axe stays attached.
  test("ruling f661cc0796fdfb2a — a conquest by another unit the controller has does not count as 'I conquered' for the Wearer", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.conqueredThisTurn[P1] ?? []).toContain("bf2"); // P1 conquered — but not WITH the Wearer
    expect(game.locationOf("wearer")).toBe("base");
    const raised = await endTurnWatchingAxe(game);
    expect(raised).toBe(true);
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("wearer")).toMatchObject({ attachments: [], might: 5 });
  });
});
