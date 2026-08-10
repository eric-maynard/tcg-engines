/**
 * Ruling 350506674aef04c8 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Irelia, Fervent (sfd-057-221) wearing Boots of Swiftness (sfd-133-221, Equipment: [Ganking])
 *   (The scrape lists Vilemaw unl-060-219; the question is about Vilemaw's LAIR.)
 *
 * Q: Can Irelia (Ganking via Swiftness Boots, sitting at Vilemaw's Lair) be moved to another battlefield with Ride
 *    the Wind on the opponent's turn — does a showdown start there and can I score a point on their turn?
 * A: Yes. Ride the Wind moves regardless of Ganking/exhaustion (those only gate the Standard Move). Once the game is
 *    back in a neutral open state a showdown is staged at the destination, and points can be scored on the opponent's
 *    turn. The Lair only forbids moving to BASE (that part of Ride the Wind would fail); battlefield → battlefield is fine.
 * Rules: 446 (Move effects vs the Standard Move action), 341/345 (showdown staged when a unit arrives at a battlefield
 *        with no opposing units, once open), 441–444 (conquer scoring, any turn), 105 + 359.3.e.6 (can't beats can).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const VILEMAWS_LAIR = "ogn-295-298";
const IRELIA = "sfd-057-221";
const BOOTS_OF_SWIFTNESS = "sfd-133-221";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P2's turn 3. P1 controls Vilemaw's Lair (live text) with Irelia (Boots attached → Ganking) + an Anchor so the Lair
 * stays P1's. bf2 is P2's but EMPTY; bf3 is uncontrolled. P2's Scout (3) is in base. P1 holds Ride the Wind with 2+[chaos].
 */
function board(ireliaExhausted = false) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder") // rule 190.4.a — bf2 is P2's only while a P2 unit holds it
    .unit(P1, "lair", IRELIA, "irelia", { equippedWith: ["boots"], exhausted: ireliaExhausted })
    .card("boots", { def: BOOTS_OF_SWIFTNESS, meta: { attachedTo: "irelia" }, owner: P1, zone: "lair" })
    .unit(P1, "lair", { might: 2, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2's Scout walks onto empty bf3 (a showdown opens — something for P1 to act in); P2 passes focus to P1. */
async function p2OpensAShowdown(game: Game): Promise<void> {
  await game.p2.move("scout", "bf3");
  expect(game.gameState.battlefields.bf3).toMatchObject({ contested: true, contestedBy: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** P1 Rides the Wind on Irelia choosing `destKey`; resolves the whole chain (Irelia's own "chosen" trigger included). */
async function rideIrelia(game: Game, destKey: string): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "irelia" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "irelia", pendingChoiceType: "choose-destination" } });
  expect((d as Pick).options.map((o) => o.key)).toContain("battlefield-bf2");
  await game.p1.pick(destKey);
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 350506674aef04c8 — Ride the Wind takes Ganking Irelia out of Vilemaw's Lair to another battlefield on the opponent's turn, and she scores there", () => {
  test("premise: Irelia at the Lair has Ganking (from the Boots) and the Lair's no-move-to-base restriction", async () => {
    const game = await board().build();
    expect(game.state("irelia").attachments).toEqual(["boots"]);
    expect(game.state("irelia").keywords).toContain("Ganking");
    expect(game.state("irelia").keywords).toContain("NoMoveToBase");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("on P2's turn, with a showdown open, P1 Rides the Wind: Irelia moves Lair → bf2 regardless of Ganking, arrives ready, and bf2 becomes contested by P1 (its showdown waits for the current one to finish)", async () => {
    const game = await board().build();
    await p2OpensAShowdown(game);
    await rideIrelia(game, "battlefield-bf2");
    expect(game.zoneOf("irelia")).toBe("battlefield-bf2");
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("boots").attachedTo).toBe("irelia"); // gear travels with her
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.battlefields.bf3?.contested).toBe(true); // still mid-showdown at bf3
    expect(game.p1.points()).toBe(0); // nothing scored yet
  });

  test("once bf3's showdown ends (P2 takes bf3), a showdown is staged at bf2; both pass and P1 CONQUERS bf2 — scoring a point on the opponent's turn", async () => {
    const game = await board().build();
    await p2OpensAShowdown(game);
    await rideIrelia(game, "battlefield-bf2");
    await game.settle(); // finishes bf3 (P2 conquers) and hands back the follow-up showdown at bf2, if surfaced
    expect(game.gameState.battlefields.bf3).toMatchObject({ contested: false, controller: P2 });
    if (game.gameState.battlefields.bf2?.contested) {
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
      await game.settle();
    }
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bf2"]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bf2"]);
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2); // all of this on P2's turn
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.lair?.controller).toBe(P1); // Anchor kept the Lair
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Ride the Wind choosing BASE from the Lair: the move fails (Irelia stays at the Lair) but she is still readied", async () => {
    const game = await board(true).build();
    expect(game.state("irelia").isExhausted).toBe(true);
    await p2OpensAShowdown(game);
    await rideIrelia(game, "base");
    expect(game.zoneOf("irelia")).toBe("battlefield-lair");
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });
});
