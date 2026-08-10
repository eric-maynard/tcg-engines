/**
 * Ruling 3453d53fc22fcf33 — Star-Crossed (UNL-128 → unl-128-219) · Reaction · Chaos · [3][chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction · [2][fury/body] "Banish a friendly unit, then its owner
 *     plays it to any battlefield, ignoring its cost."
 *   × Brynhir Thundersong (ogn-026-298) · 6 · 5 Might — "When you play me, opponents can't play cards this turn."
 *   × Eclipse (UNL-063 → unl-063-219) · Reaction · [3] "Give a unit -4 [Might] this turn. [Predict]."
 *
 * Q: Opponent Star-Crosses my Brynhir (base) + his own unit; I respond with Thrill of the Hunt sending Brynhir to his
 *    occupied battlefield. Does his unit still go to hand, and does he get a window to play Eclipse before Brynhir's
 *    play trigger resolves?
 * A: Yes and yes. Thrill resolves first (LIFO): Brynhir is banished and re-played — a NEW object, so Star-Crossed no
 *    longer targets her. Her "When you play me" trigger goes on the chain above Star-Crossed; a priority window opens
 *    in which the opponent may play a Reaction (Eclipse). Then the trigger resolves (opponents can't play cards this
 *    turn), then Star-Crossed resolves: his own unit (still legal) returns to hand; Brynhir is unaffected.
 * Rules: 340 (LIFO), 359.3.e.4 (zone change to a non-board zone → not the same object → illegal target),
 *        359.3.e.5/8 (other target still affected), 383 (play trigger on the chain, priority round before it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const THRILL = "unl-184-219";
const BRYNHIR = "ogn-026-298";
const ECLIPSE = "unl-063-219";
const FILLER_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Ping",
  timing: "reaction",
} as const;

/**
 * P2's turn. P1: Brynhir (5) in base, Thrill in hand with exactly [2][fury]. P2: Pawn (2) in base, Guard (3) holding bf1,
 * Star-Crossed + Eclipse + a 1-cost Reaction Ping in hand with [7][chaos] (3+chaos, 3, 1).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 7, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "base", BRYNHIR, "bryn")
    .hand(P1, THRILL, "thrill")
    .hand(P2, STAR_CROSSED, "sc")
    .hand(P2, ECLIPSE, "eclipse")
    .hand(P2, FILLER_SPELL, "ping");
}

/** P2 Star-Crosses [Pawn, Brynhir]; P1 responds with Thrill on Brynhir; both pass → Thrill resolves, P1 replays her to bf1. */
async function starCrossedThenThrillToBf1(game: Game): Promise<void> {
  await game.p2.cast("sc", { targets: ["pawn", "bryn"] });
  expect(game.p2.resources()).toEqual({ energy: 4, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P2 })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "thrill")).toBe(true);
  await game.p1.cast("thrill", { targets: "bryn" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "thrill"]);
  // Both pass → Thrill (top) resolves: banish, then the owner (P1) plays her to a battlefield of their choice.
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain" && game.zoneOf("thrill") === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
  expect(keys).toContain("battlefield-bf1");
  await game.p1.pick("battlefield-bf1");
}

/** Pass priority around until `cardId` is no longer on the chain (bounded); accepts soft trigger-order offers. */
async function resolveTop(game: Game, cardId: string): Promise<void> {
  const pending = () => game.chain().some((c) => c.cardId === cardId) || game.decision()?.source?.cardId === cardId;
  for (let i = 0; i < 10 && pending(); i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick" || d?.kind === "yes-no") {
      await game.seat(d.seat).answer(d.kind === "pick" ? "decline" : "no"); // Eclipse's Predict: keep the card
    } else {
      break;
    }
  }
}

describe("Ruling 3453d53fc22fcf33 — Thrill dodges Star-Crossed; opponent's unit still bounces; Eclipse window exists before Brynhir's trigger", () => {
  test("after Thrill resolves Brynhir is a new object AT bf1 and her 'When you play me' trigger sits ABOVE the still-pending Star-Crossed", async () => {
    const game = await board().build();
    await starCrossedThenThrillToBf1(game);
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("bryn")).toBe("battlefield-bf1");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("sc");
    expect(ids).toContain("bryn");
    expect(game.chain().find((c) => c.cardId === "bryn")).toMatchObject({ controller: P1, triggered: true });
    expect(ids.indexOf("bryn")).toBeGreaterThan(ids.indexOf("sc"));
  });

  test("a priority window opens on that trigger: P2 gets priority with Brynhir's trigger on the chain and CAN play Eclipse (a Reaction) before it resolves", async () => {
    const game = await board().build();
    await starCrossedThenThrillToBf1(game);
    let p2Window = false;
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
        continue;
      }
      if (d?.kind === "action" && d.context === "chain" && d.seat === P2 && game.chain().some((c) => c.cardId === "bryn")) {
        p2Window = game.p2.can("cast", "eclipse");
        break;
      }
      if (d?.kind === "action" && d.context === "chain" && d.seat === P1) {
        await game.p1.passPriority();
        continue;
      }
      break;
    }
    expect(p2Window).toBe(true);
    await game.p2.cast("eclipse", { targets: "bryn" });
    expect(game.p2.energy()).toBe(1);
    expect(game.chain().map((c) => c.cardId).slice(-1)).toEqual(["eclipse"]);
    // Eclipse resolves first: Brynhir 5 → 1 this turn (it does nothing to stop her trigger).
    await resolveTop(game, "eclipse");
    expect(game.zoneOf("eclipse")).toBe("trash");
    expect(game.state("bryn")).toMatchObject({ might: 1, zone: "battlefield-bf1" });
    expect(game.chain().some((c) => c.cardId === "bryn")).toBe(true); // her trigger is still waiting
  });

  test("then Brynhir's trigger resolves — opponents (P2) can't play cards this turn: P2's remaining Reaction is no longer castable", async () => {
    const game = await board().build();
    await starCrossedThenThrillToBf1(game);
    await resolveTop(game, "bryn");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]);
    // P2 still has [4] and a 1-cost Reaction in hand, and priority on a live chain — but may not play cards.
    for (let i = 0; i < 3 && game.decision()?.seat !== P2; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ping")).toBe(false);
    expect(game.p2.can("cast", "eclipse")).toBe(false);
  });

  test("finally Star-Crossed resolves: P2's own Pawn (still a legal target) returns to P2's hand; Brynhir — re-played, a new object — is unaffected and stays at bf1", async () => {
    const game = await board().build();
    await starCrossedThenThrillToBf1(game);
    await resolveTop(game, "bryn");
    await resolveTop(game, "sc");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.p2.hand()).toContain("pawn");
    expect(game.zoneOf("bryn")).toBe("battlefield-bf1");
    expect(game.p1.hand()).not.toContain("bryn");
    // (Brynhir arriving at P2's occupied bf1 stages a combat there afterwards — not part of the ruling.)
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.zoneOf("bryn")).not.toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
