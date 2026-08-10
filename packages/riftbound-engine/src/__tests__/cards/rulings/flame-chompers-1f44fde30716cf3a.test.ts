/**
 * Ruling 1f44fde30716cf3a — Flame Chompers (OGN-006 → ogn-006-298) "When you discard me, you may pay [fury] to play me."
 *   × Reaver's Row (OGN-285 → ogn-285-298, Battlefield) "When you defend here, you may move a friendly unit here to base."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) "When I move, discard 1, then draw 1."
 *
 * Q: Can a unit be played to a battlefield that is currently being attacked — specifically Flame Chompers, triggered
 *    by being discarded during the combat there?
 * A: Yes. Opponent attacks Reaver's Row → its defend trigger moves Traveling Merchant to base → the Merchant's move
 *    trigger discards Chompers (draw 1) → Chompers' discard trigger: pay [fury] and play it — to Reaver's Row if you
 *    like, because you still CONTROL the battlefield while the combat is ongoing.
 * Rules: 383 (triggered abilities fire on any turn), 341.2 (play a unit to base or a battlefield you control),
 *        188 / 466.5 (control only changes when combat resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLAME_CHOMPERS = "ogn-006-298";
const REAVERS_ROW = "ogn-285-298";
const MERCHANT = "ogn-185-298";

/**
 * P2's turn. P1 controls Reaver's Row (live) with Traveling Merchant (2) and a 4-Might Guard on it. P1: hand =
 * Chompers + Junk, exactly [fury] floating. P2's 3-Might Raider attacks from base.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { power: { fury: 1 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false, owner: P1 })
    .unit(P1, "row", MERCHANT, "merchant")
    .unit(P1, "row", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .hand(P1, { cardType: "unit", might: 1, name: "Junk" }, "junk");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

/** Raider attacks → Row trigger (yes, Merchant) → resolves → Merchant trigger → discard Chompers → Chompers opt-in (yes) → both pass → destination prompt. */
async function driveToChompersDestination(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  await game.p2.move("raider", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1, isCombatShowdown: true });
  // "When you defend here" — Reaver's Row's optional trigger for P1.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("merchant");
  await passBoth(game);
  // Merchant went to base → its move trigger.
  expect(game.locationOf("merchant")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  await passBoth(game);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("chompers"); // discard Chompers, draw 1
  expect(game.zoneOf("chompers")).toBe("trash");
  // Chompers' discard trigger: optional [fury] payment for P1.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chompers", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
  await game.p1.yes();
  await passBoth(game);
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Extract<Decision, { kind: "pick" }>;
}

describe("Ruling 1f44fde30716cf3a — Flame Chompers may be played to Reaver's Row while it is being attacked", () => {
  test("the whole sequence happens on the OPPONENT's turn inside the combat showdown, and the play destination offered for Chompers includes the attacked Reaver's Row (P1 still controls it) as well as base", async () => {
    const game = await board().build();
    const d = await driveToChompersDestination(game);
    expect(game.turnPlayer()).toBe(P2);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, controller: P1 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-row"]);
  });

  test("choosing Reaver's Row: [fury] is paid, Chompers stands at the Row mid-combat (Merchant in base, P1 drew 1), and the showdown then continues with Focus", async () => {
    const game = await board().build();
    await driveToChompersDestination(game);
    await game.p1.pick("battlefield-row");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.locationOf("chompers")).toBe("row");
    expect(game.p1.units("row").sort()).toEqual(["chompers", "guard"]);
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.p1.hand()).toHaveLength(2); // junk + the Merchant draw
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    // Let the combat finish: Raider (3) into Guard 4 (+ Chompers) — Raider dies, P1 keeps the Row.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("chompers")).toBe("row");
    expect(game.violations()).toEqual([]);
  });
});
