/**
 * Ruling ac295946ad6eeda8 — Fortified Position (OGN-279 → ogn-279-298) Battlefield "When you defend here, choose a unit. It gains
 *   [Shield 2] this combat."  (Reaver's Row ogn-285-298 cited as another "When you defend here" battlefield the same principle covers.)
 *   × Ride the Wind (ogn-173-298) as the way to arrive second at an open battlefield ("Surprise Defense").
 *
 * Q: If I "Surprise Defend" at Fortified Position (the opponent contested the OPEN battlefield first, then my unit arrives and I become
 *    the defender), do I get its "When you defend here" trigger?
 * A: No. A battlefield's "you" needs a controller; an uncontrolled Fortified Position has no "you", so a surprise defender does not
 *    trigger it. Only its controller defending there does.
 * Rules: 108.2 / 190 ("you" on a battlefield = its controller), 464.2.c.2 (defender = the player who did not apply Contested), 383.4.f.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORTIFIED_POSITION = "ogn-279-298";
const RIDE_THE_WIND = "ogn-173-298";

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/** P2's turn. "fort" = live Fortified Position, uncontrolled and empty. P2: Scout (2) in base. P1: Lancer (4) in base, Ride the Wind + [2][chaos]. */
function surpriseBoard() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("fort", { controller: null, def: FORTIFIED_POSITION, inert: false })
    .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 4, name: "Lancer" }, "lancer")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling ac295946ad6eeda8 — a Surprise Defense at an uncontrolled Fortified Position does not trigger it", () => {
  test("P2 walks into the open Fortified Position; P1 Rides the Wind its Lancer in and becomes the DEFENDER of the resulting combat — but no Fortified Position trigger appears and nobody gains Shield", async () => {
    const game = await surpriseBoard().build();
    await game.p2.move("scout", "fort");
    expect(showdown(game)).toMatchObject({ battlefieldId: "fort", isCombatShowdown: false });
    expect(game.gameState.battlefields.fort).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("rtw", { targets: "lancer" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-fort");
    }
    while (game.chain().some((c) => c.cardId === "rtw") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.locationOf("lancer")).toBe("fort");
    // Close the non-combat showdown if still open; the staged combat follows.
    for (let i = 0; i < 6 && showdown(game) !== undefined && showdown(game)?.isCombatShowdown !== true && game.decision()?.kind === "action" && game.chain().length === 0; i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "fort", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("lancer").combatRole).toBe("defender"); // P1 IS the (surprise) defender …
    expect(game.state("scout").combatRole).toBe("attacker");
    // … yet Fortified Position did not trigger: no pick from "fort", no fort item on the chain, no Shield anywhere.
    const d = game.decision();
    expect(d?.kind === "pick" && d.source?.cardId === "fort").toBe(false);
    expect(game.chain().some((c) => c.cardId === "fort")).toBe(false);
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("lancer").grantedKeywords).toEqual([]);
    expect(game.state("lancer").might).toBe(4);
    await game.settle(); // 4 vs 2: the Lancer wins and P1 conquers
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.fort?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: when P1 CONTROLS Fortified Position and is attacked there, 'When you defend here' triggers — P1 chooses a unit and it gains Shield 2 this combat", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("fort", { controller: P1, def: FORTIFIED_POSITION, inert: false })
      .unit(P1, "fort", { might: 4, name: "Lancer" }, "lancer")
      .unit(P2, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p2.move("scout", "fort");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fort" } });
    await game.p1.pick("lancer");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("lancer")).toMatchObject({ combatRole: "defender", grantedKeywords: [{ duration: "combat", keyword: "Shield", value: 2 }], might: 6 });
  });
});
