/**
 * Interaction: Akshan, Mischievous (sfd-109-221) — 4 Might Body champion unit, 4 energy
 *     "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me,
 *      if you paid the additional cost, move an enemy gear to your base. You control it until I
 *      leave the board. If it's an Equipment, attach it to me."
 *   × Garbage Grabber (ogn-099-298) — Gear: "Recycle 3 from your trash, [1], [Exhaust]: Draw 1."
 *   × Factory Recall (sfd-135-221) — Action spell: "Return a gear to its owner's hand."
 *   (+ Retreat ogn-104-298 / a plain lethal bolt as the ways Akshan leaves the board)
 *
 * Question: P1 plays Akshan paying [body][body] and takes P2's ready Garbage Grabber.
 *  (a) Who may activate it, whose trash feeds the recycle cost, who pays [1] and who draws? Can P2
 *      activate it on P2's turn?
 *  (b) P1 activates it (exhausted). Akshan is then Retreated to hand (or dies) and replayed next
 *      turn WITHOUT [body][body]. Does P1 still/again control the Grabber? Where is it, does it come
 *      back exhausted or ready, when does it ready?
 *  (c) Replayed WITH [body][body] — can Akshan take the same Grabber again?
 *  (d) While Akshan is still out, can P2 Factory Recall the stolen Grabber, and where does it go?
 *
 * Rules: 390.4 / 477.1.a (a control-changing effect with a duration; controller trait), 151.2 (gear
 * abilities are used by the CONTROLLER, on their turn), "your trash"/[1] read from the controller,
 * 124 / 124.1 (a card that leaves the board and returns is a new object; the old "until I leave"
 * effect does not revive), 323.7 + 455 (cleanup recalls permanents sitting in the wrong base — not a
 * zone change), 458.1 (exhausted status persists through control change/recall), 315.1.b (Awaken
 * readies what the TURN PLAYER controls), 127.1 / 056.2 (owner's hand), 740.1.a.
 *
 * Expected: (a) P1 controls it: only P1 activates it, in P1's Main Phase; recycle from P1's trash,
 * P1 pays [1], P1 draws; P2 cannot. (b) No — control reverts to P2 the moment Akshan leaves; the
 * Grabber goes back to P2's side still EXHAUSTED and readies in P2's next Awaken; the replayed
 * Akshan is a new object and, unpaid, steals nothing. (c) Yes — paying again makes a brand-new
 * effect and the (enemy again) Grabber is a legal pick. (d) Yes — "a gear" has no side restriction;
 * it returns to its OWNER's (P2's) hand; as a new object Akshan's effect no longer touches it.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const GARBAGE_GRABBER = "ogn-099-298";
const FACTORY_RECALL = "sfd-135-221";
const RETREAT = "ogn-104-298";
const FILLER = "ogn-175-298";

/** Inline 0-cost action spell: deal 4 to a unit (kills Akshan). */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2, mind: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P2, GARBAGE_GRABBER, "grabber")
    .trash(P1, FILLER, "p1junk1")
    .trash(P1, FILLER, "p1junk2")
    .trash(P1, FILLER, "p1junk3")
    .trash(P2, FILLER, "p2junk1")
    .trash(P2, FILLER, "p2junk2")
    .trash(P2, FILLER, "p2junk3")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
    .deck(P2, [FILLER, FILLER, FILLER], ["e1", "e2", "e3"])
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, RETREAT, "retreat")
    .hand(P1, BOLT, "bolt")
    .hand(P2, FACTORY_RECALL, "recall");
}

/** P1 plays Akshan paying [body][body]; the play trigger resolves and takes the (only) enemy gear. */
async function stealGrabber(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akshan", triggered: true })]);
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("grabber");
    await game.settle();
  }
  expect(game.state("grabber").controller).toBe(P1);
  return game;
}

describe("Akshan, Mischievous × Garbage Grabber × Factory Recall — borrowed gear and 'until I leave the board'", () => {
  // ---- (a) who uses the stolen gear -----------------------------------------------------------------

  test("(a) paying 4 + [body][body] plays Akshan and his trigger moves P2's Grabber under P1's control — owner stays P2, it is not attached (not Equipment) (390.4, 477.1.a)", async () => {
    const game = await stealGrabber();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0, mind: 1 } });
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.state("grabber")).toMatchObject({ controller: P1, owner: P2, zone: "base", isReady: true });
    expect(game.p1.gear()).toEqual(["grabber"]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.state("grabber").attachedTo).toBeUndefined();
    expect(game.state("akshan").attachments).toEqual([]);
  });

  test("(a) P1 — the controller — activates it in P1's Main Phase: 3 cards recycled from P1's OWN trash, P1 pays [1], Grabber exhausted, P1 draws 1; P2's trash, pool and hand untouched (151.2)", async () => {
    const game = await stealGrabber();
    const p2Hand = game.p2.hand().length;
    expect(game.p1.can("activate", "grabber")).toBe(true);
    await game.p1.activate("grabber");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck().slice(-3).sort()).toEqual(["p1junk1", "p1junk2", "p1junk3"]);
    expect(game.p2.trash().sort()).toEqual(["p2junk1", "p2junk2", "p2junk3"]);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("grabber").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toContain("d1");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()[0]).toBe("e1");
  });

  test("(a) P2 cannot activate the Grabber while P1 controls it — not on P1's turn, and not on P2's own turn even with [1] and 3 cards in trash (151.2)", async () => {
    const game = await stealGrabber();
    expect(game.p2.can("activate", "grabber")).toBe(false);
    await game.advanceTurn(); // → P2's turn; Akshan still on the board
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.trash()).toHaveLength(3);
    expect(game.state("grabber").controller).toBe(P1);
    expect(game.p2.can("activate", "grabber")).toBe(false);
    const r = await game.p2.try((p) => p.activate("grabber", 0));
    expect(r.ok).toBe(false);
  });

  // Expected: Awaken readies only what the TURN PLAYER controls (315.1.b); P2 owns but does not
  // control the stolen Grabber, so it stays exhausted through P2's turn and readies in P1's Awaken.
  // Actual: the engine readies it during P2's (the owner's) Awaken.
  test("(a) a stolen, exhausted Grabber must NOT ready in P2's Awaken — P2 does not control it (315.1.b); it readies in P1's next Awaken", async () => {
    const game = await stealGrabber();
    await game.p1.activate("grabber");
    await game.settle();
    expect(game.state("grabber").isExhausted).toBe(true);
    await game.advanceTurn(); // P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("grabber")).toMatchObject({ controller: P1, isExhausted: true });
    await game.advanceTurn(); // back to P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("grabber")).toMatchObject({ controller: P1, isReady: true });
  });

  // ---- (b) Akshan leaves the board ---------------------------------------------------------------

  test("(b) Retreat returns Akshan to hand → the control effect ends AT ONCE: the Grabber is P2's again, still EXHAUSTED (458.1), and P1 can no longer activate it", async () => {
    const game = await stealGrabber();
    await game.p1.activate("grabber");
    await game.settle();
    await game.p1.cast("retreat", { targets: "akshan" });
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("hand");
    expect(game.state("grabber")).toMatchObject({ controller: P2, isExhausted: true, owner: P2, zone: "base" });
    expect(game.p2.gear()).toEqual(["grabber"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.can("activate", "grabber")).toBe(false);
  });

  test("(b) the same reversion when Akshan DIES instead of being bounced — 'leave the board' covers both", async () => {
    const game = await stealGrabber();
    await game.p1.activate("grabber");
    await game.settle();
    await game.p1.cast("bolt", { targets: "akshan" });
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("trash");
    expect(game.state("grabber")).toMatchObject({ controller: P2, isExhausted: true });
    expect(game.p2.gear()).toEqual(["grabber"]);
  });

  test("(b) control change and recall are not zone changes: the returned Grabber readies only in P2's next Awaken (315.1.b), after which P2 can use it from P2's trash", async () => {
    const game = await stealGrabber();
    await game.p1.activate("grabber");
    await game.settle();
    await game.p1.cast("retreat", { targets: "akshan" });
    await game.settle();
    expect(game.state("grabber").isExhausted).toBe(true);
    await game.advanceTurn(); // P2's turn: Awaken readies P2's objects
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("grabber")).toMatchObject({ controller: P2, isReady: true });
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("activate", "grabber")).toBe(true);
    await game.p2.activate("grabber");
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.trash()).toContain("retreat"); // P1's trash is not touched by P2's activation
    await game.settle();
    expect(game.p2.hand()).toContain("e2"); // e1 was P2's turn draw
  });

  /** Steal, use, Retreat Akshan, go around to P1's next turn and refill P1's pool for a replay. */
  async function bouncedAndBackToP1(): Promise<Game> {
    const game = await stealGrabber();
    await game.p1.activate("grabber");
    await game.settle();
    await game.p1.cast("retreat", { targets: "akshan" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("akshan")).toBe("hand");
    await game.p1.do("addResources", { energy: 4, power: { body: 2 } });
    return game;
  }

  test("(b) replaying Akshan next turn WITHOUT [body][body]: he is a new object (124), the old effect does not revive and the unpaid trigger takes nothing — the Grabber stays P2's", async () => {
    const game = await bouncedAndBackToP1();
    await game.p1.play("akshan", { payOptional: false, to: "base" });
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.power("body")).toBe(2); // additional cost not paid
    expect(game.state("grabber").controller).toBe(P2);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.can("activate", "grabber")).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  // ---- (c) pay again → steal again ------------------------------------------------------------------

  test("(c) replaying Akshan and paying [body][body] AGAIN creates a brand-new effect: the (enemy again) Grabber is taken a second time", async () => {
    const game = await bouncedAndBackToP1();
    await game.p1.play("akshan", { payOptional: true, to: "base" });
    expect(game.p1.power("body")).toBe(0);
    const r = await game.settle();
    if (r.reason === "unanswered" && game.decision()?.seat === P1) {
      await game.p1.pick("grabber");
      await game.settle();
    }
    expect(game.state("grabber")).toMatchObject({ controller: P1, owner: P2 });
    expect(game.p1.gear()).toEqual(["grabber"]);
  });

  // ---- (d) Factory Recall on the stolen gear --------------------------------------------------------

  test("(d) on P2's turn, with Akshan still out, Factory Recall ('a gear' — no side restriction) offers the stolen Grabber and returns it to its OWNER's hand: P2's, not P1's (127.1)", async () => {
    const game = await stealGrabber();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    const offered = (game.p2.option("cast", "recall")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["grabber"]);
    await game.p2.cast("recall", { targets: "grabber" });
    await game.settle();
    expect(game.zoneOf("grabber")).toBe("hand");
    expect(game.p2.hand()).toContain("grabber");
    expect(game.p1.hand()).not.toContain("grabber");
    expect(game.zoneOf("akshan")).toBe("base"); // Akshan never left — the effect simply has nothing to apply to
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("recall")).toBe("trash");
  });

  test("(d) the recalled Grabber is a new object (124): P2 replays it from hand and controls it normally even though Akshan is still on the board", async () => {
    const game = await stealGrabber();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 3 });
    await game.p2.cast("recall", { targets: "grabber" });
    await game.settle();
    await game.p2.play("grabber");
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.state("grabber")).toMatchObject({ controller: P2, owner: P2, zone: "base", isReady: true });
    expect(game.p2.gear()).toEqual(["grabber"]);
    expect(game.p1.gear()).toEqual([]);
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("activate", "grabber")).toBe(true);
    expect(game.p1.can("activate", "grabber")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
