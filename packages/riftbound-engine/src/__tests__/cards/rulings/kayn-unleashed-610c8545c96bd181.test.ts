/**
 * Ruling 610c8545c96bd181 — Kayn, Unleashed (OGN-189 → ogn-189-298) · 6 Might · "[Ganking] If I have moved twice this turn, I don't take damage."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] "Move a friendly unit and ready it."
 *   (× Block, ogn-057-298 — cited only as an example of a defender-dependent effect.)
 *
 * Q: Kayn defends Reaver's Row, the Row's trigger moves him to base, then Ride the Wind moves him back in the same
 *    showdown — is he a defender again, and does he survive by having moved twice?
 * A: Yes to both. He loses the defender designation while in base, but the battlefield stays contested and under his
 *    controller's control for the whole showdown, so on returning he is re-designated defender; having moved twice
 *    this turn he takes no damage and survives combat.
 * Rules: 181.4 / 190.4 (control persists while contested), 464.2.c.3.a (arrivals gain the designation), Kayn's static.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const REAVERS_ROW = "ogn-285-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1 (Player B) holds Reaver's Row with Kayn (6) alone. P2's 7-Might Raider attacks. P1: Ride the Wind, exactly [2]+chaos. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("rr", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "rr", KAYN, "kayn")
    .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks the Row; P1 defends → the Row's "you may move a friendly unit here to base" is accepted for Kayn and resolves. */
async function rowSendsKaynHome(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "rr");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "rr", isCombatShowdown: true });
  expect(game.state("kayn").combatRole).toBe("defender");
  // Reaver's Row triggers for the DEFENDING player (P1) and is a "you may".
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rr", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rr" } });
  await game.p1.yes();
  for (let i = 0; i < 8 && game.locationOf("kayn") !== "base"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("kayn");
      await game.p1.pick("kayn");
    } else if (d?.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  expect(game.locationOf("kayn")).toBe("base");
  return game;
}

/** P1 (with Focus) Rides the Wind Kayn back to the Row and lets it resolve. */
async function rideKaynBack(game: Game): Promise<void> {
  for (let i = 0; i < 3 && !(game.actingSeat() === P1 && game.p1.can("cast", "rtw")); i++) {
    await game.acting().pass();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "kayn" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // destination is P1's choice
  await game.p1.pick("rr");
  for (let i = 0; i < 4 && game.zoneOf("rtw") !== "trash"; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 610c8545c96bd181 — Kayn bounced by Reaver's Row and Ridden back: defender again, moved twice, survives", () => {
  test("move 1 (Reaver's Row): Kayn sits in base WITHOUT a combat designation; the Row is empty of defenders yet still contested and controlled by P1, showdown ongoing", async () => {
    const game = await rowSendsKaynHome();
    expect(game.state("kayn").combatRole).not.toBe("defender");
    expect(game.p1.units("rr")).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "rr", isCombatShowdown: true });
    expect(game.gameState.battlefields.rr).toMatchObject({ contested: true, controller: P1 });
    expect(game.p2.points()).toBe(0);
  });

  test("move 2 (Ride the Wind): Kayn returns to the Row ready and is RE-assigned the defender designation inside the same showdown", async () => {
    const game = await rowSendsKaynHome();
    await rideKaynBack(game);
    expect(game.zoneOf("kayn")).toBe("battlefield-rr");
    expect(game.state("kayn")).toMatchObject({ combatRole: "defender", isReady: true, location: "rr" });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "rr" });
    expect(game.gameState.battlefields.rr?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("combat: Kayn has moved twice this turn → takes no damage from the 7-Might Raider and survives; Raider (6 damage, alive) is sent home, P1 keeps the Row", async () => {
    const game = await rowSendsKaynHome();
    await rideKaynBack(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("kayn")).toBe("battlefield-rr");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.gameState.battlefields.rr).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining the Row and standing still (0 moves), Kayn takes 7 and dies; the Raider conquers", async () => {
    const game = await board().build();
    await game.p2.move("raider", "rr");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rr" } });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.gameState.battlefields.rr?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
