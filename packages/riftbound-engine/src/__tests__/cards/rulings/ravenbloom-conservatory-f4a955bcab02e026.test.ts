/**
 * Ruling f4a955bcab02e026 — Ravenbloom Conservatory (SFD-215 → sfd-215-221) · Battlefield
 *   "When you defend here, reveal the top card of your Main Deck. If it's a spell, put it in your hand. Otherwise, recycle it."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] · [Action] "Move a friendly unit and ready it."
 *
 * Q: The Conservatory is open (uncontrolled). The opponent moves into it; during that showdown I Ride the Wind one of my
 *    units in, so it defends there. Do I get the "When you defend here" trigger?
 * A: No. Control is only established when the showdown ends; an open battlefield has no controller while Contested, so
 *    "you" (the battlefield's controller) is nobody and the ability stays dormant even though my unit is now a defender.
 * Rules: 348.2.a (control established at end of showdown), 190.6.d ("you" on a battlefield = its controller), 344.1
 *        (units arriving mid-showdown join it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSERVATORY = "sfd-215-221";
const RIDE_THE_WIND = "ogn-173-298";
const GUST = "ogn-169-298"; // a real spell on top of P1's deck — would go to hand if the trigger fired

/** P2's turn. The Conservatory ("rc", live text) is uncontrolled and empty. P2: Raider (3) in base. P1: Lancer (4) in base,
 * Ride the Wind in hand with [2][chaos], deck top = Gust. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("rc", { controller: null, def: CONSERVATORY, inert: false })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 4, name: "Lancer" }, "lancer")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .deck(P1, [GUST, "ogn-175-298", "ogn-175-298"], ["top", "d2", "d3"]);
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** P2 walks into the open Conservatory (non-combat showdown, P2 has Focus) and passes Focus to P1. */
async function raiderMovesIn(game: Game): Promise<void> {
  await game.p2.move("raider", "rc");
  expect(showdown(game)).toBeDefined();
  expect(game.gameState.battlefields.rc).toMatchObject({ contested: true, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling f4a955bcab02e026 — defending at an UNCONTROLLED Conservatory (arrived via Ride the Wind) triggers nothing", () => {
  test("the open Conservatory stays uncontrolled while Contested; P1 may Ride the Wind the Lancer into it during the showdown and the Lancer becomes the defender (Raider the attacker)", async () => {
    const game = await board().build();
    await raiderMovesIn(game);
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "lancer" });
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
      await game.p1.pick("battlefield-rc");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    // Resolve Ride the Wind (both pass).
    for (let i = 0; i < 4 && game.zoneOf("rtw") === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("lancer")).toBe("rc");
    expect(game.state("lancer").isReady).toBe(true);
    expect(game.state("lancer").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.gameState.battlefields.rc?.controller).toBeNull(); // still nobody's during the showdown
  });

  test("no 'When you defend here' trigger: nothing from the Conservatory goes on the chain, P1's top card is neither drawn nor recycled", async () => {
    const game = await board().build();
    await raiderMovesIn(game);
    await game.p1.cast("rtw", { targets: "lancer" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-rc");
    }
    for (let i = 0; i < 4 && game.zoneOf("rtw") === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("lancer").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]); // no "rc" triggered item
    expect(game.chain().some((c) => c.cardId === "rc")).toBe(false);
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.p1.hand()).not.toContain("top");
    // Finish the (now combat) showdown: Lancer 4 beats Raider 3; the sole remaining player establishes control only NOW.
    await game.settle();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("lancer")).toBe("rc");
    expect(game.p1.deck()[0]).toBe("top"); // still never revealed
    expect(game.p1.hand()).not.toContain("top");
    expect(game.gameState.battlefields.rc?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: when P1 already CONTROLS the Conservatory (holder unit there) and P2 attacks, 'When you defend here' does trigger and the spell on top goes to P1's hand", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("rc", { controller: P1, def: CONSERVATORY, inert: false })
      .unit(P1, "rc", { might: 4, name: "Lancer" }, "lancer")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deck(P1, [GUST, "ogn-175-298"], ["top", "d2"])
      .build();
    await game.p2.move("raider", "rc");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rc", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toContain("top");
  });
});
