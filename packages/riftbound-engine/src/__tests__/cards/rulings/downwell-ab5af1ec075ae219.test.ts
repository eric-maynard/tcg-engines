/**
 * Ruling ab5af1ec075ae219 — Downwell (SFD-147 → sfd-147-221) [8][chaos][chaos] "Return all units and gear to their owners' hands."
 *   × Treasure Trove (OGN-186 → ogn-186-298) Gear "When this leaves the board, draw 1 and channel 1 rune exhausted. …"
 *   (+ Teemo, Strategist ogn-121-298 as the opponent's [Hidden] UNIT face-down at their battlefield.)
 *
 * Q: Opponent's Downwell bounces everything, including my Treasure Trove. Can I react with my hidden unit off the Trove's trigger to
 *    keep control of my battlefield?
 * A: Yes. Trove's "leaves the board" trigger becomes a pending chain item as Downwell resolves, so the chain is not empty at the following
 *    cleanup → the turn is not in an Open State → control of the now-empty battlefield is NOT lost (and the hidden card stays). When the
 *    trigger finalizes there is a reaction window: play the hidden unit there and keep control. Had no trigger been generated, control
 *    would lapse and the hidden card would be discarded.
 * Rules: 190.4.c / 323.6 (control lost only in an Open State cleanup), 383 (triggered → pending item), 811 (play from Hidden as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DOWNWELL = "sfd-147-221";
const TREASURE_TROVE = "ogn-186-298";
const TEEMO_STRATEGIST = "ogn-121-298"; // a [Hidden] unit

/** Turn 3, P1's turn with exactly [8][chaos][chaos] and Downwell. P2 holds bf1 with a Guard and hid Teemo there earlier; P2's base: `withTrove` ? Treasure Trove : nothing. */
function board(withTrove: boolean) {
  const s = scenario()
    .turn(3)
    .resources(P1, { energy: 8, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P2, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, DOWNWELL, "downwell");
  return withTrove ? s.gear(P2, TREASURE_TROVE, "trove") : s;
}

/** P1 casts Downwell; both pass (P2 does NOT flip Teemo into it); Downwell resolves. */
async function downwellResolves(withTrove: boolean): Promise<Game> {
  const game = await board(withTrove).build();
  await game.p1.cast("downwell");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
  expect(game.zoneOf("downwell")).toBe("trash");
  expect(game.zoneOf("guard")).toBe("hand");
  expect(game.zoneOf("bystander")).toBe("hand");
  return game;
}

describe("Ruling ab5af1ec075ae219 — Treasure Trove's leave trigger keeps the chain alive so the hidden unit can save the battlefield", () => {
  test("contrast (no Trove): Downwell resolves with no triggers → Open-State cleanup: P2 loses the empty bf1 and the hidden Teemo is discarded", async () => {
    const game = await downwellResolves(false);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling ab5af1ec075ae219 — Trove bounced by Downwell triggers 'leaves the board', so the chain is not empty and P2 keeps bf1 + the hidden Teemo", async () => {
    const game = await downwellResolves(true);
    expect(game.zoneOf("trove")).toBe("hand");
    // Trove's trigger is a pending/finalized item controlled by P2; the cleanup after Downwell was NOT in an Open State.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "trove", controller: P2, triggered: true })]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // not lost
    expect(game.zoneOf("teemo")).toBe("facedown-bf1"); // not discarded
  });

  test("ruling ab5af1ec075ae219 — the reaction window off the Trove trigger lets P2 flip the hidden Teemo to hold bf1 (and the trigger draws 1 / channels 1)", async () => {
    const game = await downwellResolves(true);
    const handAfterBounce = game.p2.hand().length; // guard + trove (+ whatever)
    const runesBefore = game.p2.runes().length;
    // Reaction window with the Trove trigger on the chain: find P2's priority and play Teemo from face-down.
    let revealed = false;
    for (let i = 0; i < 6 && !revealed; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      if (d.seat === P2 && game.p2.can("reveal", "teemo")) {
        await game.p2.reveal("teemo");
        revealed = true;
      } else {
        await game.seat(d.seat).passPriority();
      }
    }
    expect(revealed).toBe(true);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    await game.settle(); // the Trove trigger resolves: draw 1, channel 1 rune exhausted
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // held through the whole thing
    expect(game.p2.units("bf1")).toEqual(["teemo"]);
    expect(game.p2.hand()).toHaveLength(handAfterBounce + 1);
    expect(game.p2.runes()).toHaveLength(runesBefore + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
