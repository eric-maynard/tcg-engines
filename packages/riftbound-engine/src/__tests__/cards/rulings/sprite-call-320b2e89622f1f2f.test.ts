/**
 * Ruling 320b2e89622f1f2f — Sprite Call (OGN-094 → ogn-094-298) · Spell · Mind · 3 · [Hidden] [Action]
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]."   × Sprite token (OGN-274 → ogn-274-298)
 *
 * Q: Sprite Call is hidden at a battlefield; all my units there are killed before I play it. Do I lose the
 *    battlefield immediately, and what happens to the hidden card?
 * A: Yes — with no units there you lose control right away (at the next Cleanup), unless the battlefield is Contested
 *    in an ongoing showdown; when control is lost the hidden card goes to the trash. During a showdown you keep
 *    control (and the hidden card) until the showdown is done, even if all your units there die.
 * Rules: 190.4.c (no units + Open state → lose control at the next Cleanup unless a Combat/Showdown is ongoing there),
 *        107.3.d (losing control removes the facedown card at the next Cleanup), 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";
/** Inline [Action] removal: deal 3 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/**
 * P2's turn (turn 3). P1 controls bf1 with a lone 2-Might Warden and has Sprite Call facedown there (hidden on an
 * earlier turn, so it is playable). P2 holds two Bolts with [2] and a 1-Might Scout in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Warden" }, "warden")
    .facedown(P1, "bf1", SPRITE_CALL, "sprite")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P2, BOLT, "bolt")
    .hand(P2, BOLT, "bolt2");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

describe("Ruling 320b2e89622f1f2f — losing your last unit at a battlefield loses control (and the hidden card) immediately, except mid-showdown", () => {
  test("premise: P1 controls bf1 via the Warden and has Sprite Call facedown there", async () => {
    const game = await board().build();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("sprite")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["sprite"]);
  });

  test("outside any showdown: P2 Bolts the Warden dead → P1 loses control of bf1 at once (no showdown, not Contested) and the hidden Sprite Call goes to P1's trash unplayed", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "warden" });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(showdown(game)).toBeUndefined();
    expect(bf1(game)?.controller).not.toBe(P1);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null }); // nobody else is there either
    expect(game.zoneOf("sprite")).toBe("trash");
    expect(game.p1.trash()).toContain("sprite");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.units()).toEqual([]); // no Sprite token was made — the card was never played
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("during a showdown: Scout attacks bf1 and P2 Bolts the Warden dead mid-showdown — bf1 is Contested, P1 KEEPS control and the facedown Sprite Call stays (still playable) until the showdown ends", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    // P2 holds Focus first (attacker): Bolt the Warden and let it resolve.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("bolt", { targets: "warden" });
    for (let i = 0; i < 6 && game.zoneOf("bolt") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    // The showdown is not over: control and the hidden card persist.
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" });
    expect(bf1(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("sprite")).toBe("facedown-bf1");
    // …and with Focus P1 may still play it from facedown.
    for (let i = 0; i < 4 && game.decision()?.seat !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "sprite")).toBe(true);
  });

  test("…once that showdown ends (everyone passes, P1 never plays it): Scout conquers bf1, P1 loses control and the hidden Sprite Call is trashed", async () => {
    const game = await board().build();
    await game.p2.move("scout", "bf1");
    await game.p2.cast("bolt", { targets: "warden" });
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.zoneOf("sprite")).toBe("trash");
    expect(game.p1.trash()).toContain("sprite");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
