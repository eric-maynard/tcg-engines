/**
 * Ruling 0dad9b7f1272f70a — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Rebuke (OGN-172 → ogn-172-298) · Spell · Chaos · [2][chaos][chaos] · Action
 *     "Return a unit at a battlefield to its owner's hand."
 *
 * Q: Does a combat showdown end immediately once no (defending) units are left on the battlefield, or must all
 *    players still pass?
 * A: It does NOT close immediately. P1 attacks P2 at Reaver's Row; P2 uses the Row to pull its unit(s) home;
 *    P1 passes; P2 may still play an Action/Reaction (e.g. Rebuke); the showdown closes only after all players
 *    pass in a row.
 * Rules: 347/347.2.a (showdown ends only when all players pass in sequence), 347.1.b (after a chain closes,
 *        Focus passes on), 465.1/466 (damage step needs both sides; resolution afterwards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const REBUKE = "ogn-172-298";

/**
 * P1's turn. "row" = a LIVE Reaver's Row controlled by P2 with a single defender (2). P1's Raider (3) is ready
 * in base. P2 holds Rebuke with exactly [2] + 2 chaos.
 */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 2, name: "Lookout" }, "lookout")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, REBUKE, "rebuke");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 attacks the Row; P2 accepts the Row's trigger and pulls Lookout home; the trigger item resolves. */
async function attackAndEvacuate(game: Game): Promise<void> {
  await game.p1.move("raider", "row");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P2, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  await game.p2.yes();
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["lookout"]);
      await game.p2.pick("lookout");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("lookout")).toBe("base");
}

describe("Ruling 0dad9b7f1272f70a — an emptied combat showdown still needs everyone to pass", () => {
  test("after Reaver's Row evacuates the only defender the showdown is STILL OPEN: no units of P2 remain, yet nothing has been conquered and a Focus holder is asked to act", async () => {
    const game = await board().build();
    await attackAndEvacuate(game);
    expect(game.p2.units("row")).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("P1 passes → the showdown does not close on one pass: Focus moves to P2, who may still play the Action-speed Rebuke on the Raider", async () => {
    const game = await board().build();
    await attackAndEvacuate(game);
    // Whoever holds Focus first, get to the point where P1 has passed and P2 is up.
    if (game.actingSeat() === P2) {
      // (Focus may already have passed to P2 after the trigger chain closed — then P2 acts right away.)
      expect(game.p2.can("cast", "rebuke")).toBe(true);
    } else {
      expect(game.actingSeat()).toBe(P1);
      await game.p1.passFocus();
      expect(showdown(game)?.active).toBe(true); // one pass is not "all players passed in a row"
      expect(game.actingSeat()).toBe(P2);
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
      expect(game.p2.can("cast", "rebuke")).toBe(true);
    }
    const targets = game.p2.option("cast", "rebuke")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["raider"]]);
    await game.p2.cast("rebuke", { targets: "raider" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P2 })]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Rebuke resolves
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.p1.hand()).toContain("raider");
    // Still not over: the (now unit-less) showdown again waits for passes.
    expect(showdown(game)?.active).toBe(true);
    expect(game.p1.points()).toBe(0);
  });

  test("only after ALL players then pass in succession does the showdown close — with no units left nobody conquers: the Row ends uncontested, P1 scores nothing, Lookout is safe at home", async () => {
    const game = await board().build();
    await attackAndEvacuate(game);
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    await game.p2.cast("rebuke", { targets: "raider" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(showdown(game)?.active).toBe(true);
    // Now everyone passes in a row.
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.row?.contested).toBe(false);
    expect(game.gameState.battlefields.row?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.zoneOf("lookout")).toBe("base");
    expect(game.state("lookout").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if instead everyone simply passes after the evacuation, THAT is what closes the showdown — the unopposed Raider conquers the Row (+1 for P1)", async () => {
    const game = await board().build();
    await attackAndEvacuate(game);
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("raider")).toBe("battlefield-row");
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
