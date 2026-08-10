/**
 * Ruling 711481e3fa13f769 — Tideturner (OGN-199) × Ravenbloom Conservatory (SFD-215, "When you defend here, reveal the top
 *   card of your Main Deck. If it's a spell, put it in your hand. Otherwise, recycle it.") × Lonely Poro (SFD-036) ×
 *   Scuttle Crab (UNL-053) × Ride the Wind (OGN-173) × Ravenbloom Student (OGN-103)
 *
 * Q: My Tideturner holds the Conservatory and trades with Lonely Poro (both die). Later the opponent moves Scuttle Crab to
 *    the now-empty battlefield; I Ride the Wind my Ravenbloom Student there. Do I get the Conservatory's ability?
 * A: No. After the trade the empty battlefield has NO controller (lost at the next Cleanup). When Scuttle Crab moves in it
 *    is Contested but uncontrolled; my Student arriving mid-showdown does not establish control (only at showdown end).
 *    "You" on a battlefield = its controller ⇒ nobody, so "When you defend here" cannot trigger for anyone.
 * Rules: 187.4 / 187.4.c (control lost with no units; established only at end of Showdown), 187.6.c ("you" = controller).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const CONSERVATORY = "sfd-215-221";
const LONELY_PORO = "sfd-036-221";
const SCUTTLE_CRAB = "unl-053-219";
const RIDE_THE_WIND = "ogn-173-298";
const STUDENT = "ogn-103-298";
const GUST = "ogn-169-298"; // a real SPELL as the known top of P1's deck — a Conservatory reveal would put it in hand

/** P2's turn. P1 controls the (live) Conservatory with Tideturner; Student in P1's base with Ride the Wind in hand. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("rc", { controller: P1, def: CONSERVATORY, inert: false })
    .unit(P1, "rc", TIDETURNER, "tide")
    .unit(P1, "base", STUDENT, "student")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .unit(P2, "base", LONELY_PORO, "poro")
    .unit(P2, "base", SCUTTLE_CRAB, "crab")
    .deck(P1, [GUST, "ogn-175-298", "ogn-175-298"], ["top", "d2", "d3"]);
}

const rc = (game: Game) => game.gameState.battlefields.rc;
const conservatoryTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "rc").length;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Lonely Poro attacks rc; the Conservatory DOES trigger for that defense (premise), then 2 vs 2 trade. */
async function poroTradesWithTideturner(game: Game): Promise<void> {
  await game.p2.move("poro", "rc");
  expect(conservatoryTriggers(game)).toBe(1); // P1 controls rc → "you defend here" fires this time
  await game.settle();
  expect(game.zoneOf("tide")).toBe("trash");
  expect(game.zoneOf("poro")).toBe("trash");
  expect(game.zoneOf("top")).toBe("hand"); // the premise trigger revealed the spell and put it in hand
  expect(showdown(game)).toBeUndefined();
}

describe("Ruling 711481e3fa13f769 — an uncontrolled Conservatory has no 'you': no defend trigger when my unit Rides the Wind in", () => {
  test("after the trade rc is empty and P1 has LOST control (no controller, not contested)", async () => {
    const game = await board().build();
    await poroTradesWithTideturner(game);
    expect(rc(game)).toMatchObject({ contested: false, controller: null });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("Scuttle Crab moves to the empty rc: it becomes Contested by P2 but still has NO controller; a showdown opens with no Conservatory trigger", async () => {
    const game = await board().build();
    await poroTradesWithTideturner(game);
    await game.p2.move("crab", "rc");
    expect(rc(game)).toMatchObject({ contested: true, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: "rc" });
    expect(conservatoryTriggers(game)).toBe(0);
  });

  /** During the Crab's showdown P1 takes Focus and Rides the Wind the Student into rc; RTW resolves. Returns whether a
   * Conservatory trigger was seen at any point while it resolved. */
  async function studentRidesIn(game: Game): Promise<boolean> {
    await game.p2.move("crab", "rc");
    // P2 (mover) has Focus first; pass it to P1.
    for (let i = 0; i < 4 && game.decision()?.seat !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "student" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-rc");
    }
    let sawTrigger = false;
    for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
      sawTrigger ||= conservatoryTriggers(game) > 0;
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("battlefield-rc");
      } else {
        await game.acting().passPriority();
      }
    }
    sawTrigger ||= conservatoryTriggers(game) > 0;
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("student")).toBe("rc");
    expect(game.state("student").isReady).toBe(true);
    return sawTrigger;
  }

  test("P1 Rides the Wind the Student into rc during that showdown: the Student arrives ready, but rc is STILL uncontrolled (control is only established when the showdown ends)", async () => {
    const game = await board().build();
    await poroTradesWithTideturner(game);
    await studentRidesIn(game);
    expect(rc(game)).toMatchObject({ contested: true, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: "rc" });
  });

  // BUG: expected — with no controller, "you" in "When you defend here" is nobody, so the Conservatory never triggers
  // (187.6.c). Actual — once the Student arrives the engine designates it a defender and puts a Ravenbloom Conservatory
  // trigger controlled by P1 on the chain (revealing/recycling P1's top card).
  test("ruling 711481e3fa13f769 — engine fires the uncontrolled Conservatory's 'When you defend here' for P1 when the Student arrives", async () => {
    const game = await board().build();
    await poroTradesWithTideturner(game);
    const deckAfterPremise = game.p1.deck();
    expect(deckAfterPremise[0]).toBe("d2");
    let sawTrigger = await studentRidesIn(game);
    expect(sawTrigger).toBe(false);
    expect(game.p1.deck()).toEqual(deckAfterPremise);
    // Finish everything (showdown → combat Student 2(+1) vs Crab 0).
    game.script(P2, [(d) => (d.kind === "pick" ? d.options[0]?.key : undefined)]);
    for (let i = 0; i < 20; i++) {
      sawTrigger ||= conservatoryTriggers(game) > 0;
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await game.settle({ maxSteps: 1 });
    }
    sawTrigger ||= conservatoryTriggers(game) > 0;
    expect(sawTrigger).toBe(false);
    expect(game.p1.deck()).toEqual(deckAfterPremise); // nothing revealed / recycled / drawn
    expect(game.p1.hand()).not.toContain("d2");
    expect(game.zoneOf("crab")).not.toBe("battlefield-rc");
    expect(game.locationOf("student")).toBe("rc");
    expect(game.violations()).toEqual([]);
  });
});
