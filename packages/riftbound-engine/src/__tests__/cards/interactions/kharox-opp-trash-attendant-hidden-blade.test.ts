/**
 * Interaction: Kharox (ven-114-166 · Chaos unit · 6 · 5 Might) "[Empower] [6][chaos][chaos]. When I become [Empowered],
 *     choose an opponent. They [Burn 3]. Then you may do this: Choose a unit in their trash and play it, ignoring its cost."
 *   × Cemetery Attendant (ogn-165-298 · Chaos unit · 3+[chaos] · 3 Might) "When you play me, return a unit from your trash
 *     to your hand."
 *   × Hidden Blade (ogn-213-298 · Order spell · 2+[order] · Hidden/Action) "Kill a unit at a battlefield. Its controller
 *     draws 2."   (+ Morbid Return ogn-170-298 "Return a unit from your trash to your hand." for the (d) probe)
 *
 * Question: P1 controls Kharox in base and bf1 (another P1 unit holds it); P1's trash holds unit U1 (and U1b); P2's trash
 * holds an old unit; the top 3 of P2's deck are Cemetery Attendant + two spells. P1 pays [6][chaos][chaos] to Empower
 * Kharox; P2 Burns 3; P1 'does this': chooses the Attendant in P2's trash and plays it, ignoring its cost, to bf1.
 *   (a) Who controls / who owns the Attendant on the board (191.3)? Where may P1 play it?
 *   (b) Its 'When you play me, return a unit from YOUR trash to YOUR hand' — whose trigger; which trash/hand does it read?
 *       Can P1 pick a card out of P2's trash with it?
 *   (c) On P2's turn P2 Hidden-Blades the Attendant at bf1: whose trash does it go to; who draws 2 for 'its controller'?
 *   (d) Afterwards can P2 Morbid-Return it as an ordinary card of P2's trash and replay it under P2's control, carrying
 *       nothing over?   — (owner, controller, zone) after each step.
 *
 * Rules: 191.1 / 191.3 / 191.3.d (the player who plays a card controls it and its abilities), 191.4.a ('you' on a
 * permanent's ability = its controller), 127.1 (ownership never changes), 056 / 056.2 (a card can only ever go to its
 * OWNER's hand/trash), 428.2 / 323.5 (killed → owner's trash), 192 ('its controller' = controller at the moment of the
 * kill), 124 (a card that changes zones is a new object with no memory), 359.3.d.
 *
 * Expected: (a) Burn puts Attendant + 2 spells in P2's trash; P1 plays the Attendant → controller P1, owner P2; P1 picks
 * P1's base or a battlefield P1 controls (bf1 — never P2's bf2); enters exhausted; nothing paid beyond the Empower cost.
 * (b) The play trigger is P1's: it offers exactly the units in P1's trash (U1, U1b — never P2's old unit); U1 → P1's hand.
 * (c) Hidden Blade kills it → P2's trash (owner), never P1's; 'its controller' = P1 draws 2, P2 draws 0; Blade → P2 trash.
 * (d) In P2's trash it is a plain P2 card: P2's Morbid Return offers it → P2's hand; P2 replays it → controller P2, ready
 * state/damage fresh, and NOW its trigger reads P2's trash (returns P2's old unit to P2's hand).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAROX = "ven-114-166";
const CEMETERY_ATTENDANT = "ogn-165-298";
const HIDDEN_BLADE = "ogn-213-298"; // 2 + [order]
const MORBID_RETURN = "ogn-170-298"; // 2, Chaos: Return a unit from your trash to your hand.
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit ("U1")
const DECK_SPELL = { cardType: "spell", domain: "chaos", energyCost: 1, name: "Deck Spell", timing: "action" };

/** What P2 is handed on their turn: Hidden Blade (2+[order]) + Morbid Return (2) + replaying the Attendant (3+[chaos]). */
const P2_POOL = { energy: 7, power: { chaos: 1, order: 1 } };

/**
 * P1's turn 2 with exactly [6][chaos][chaos]. P1: Kharox in base, a 2-Might Holder keeping bf1, U1 (Skulker) + U1b in trash.
 * P2: a holder at bf2, an OLD 7-Might unit already in trash, deck top → Cemetery Attendant, spell, spell; Hidden Blade and
 * Morbid Return in hand. `p1TrashEmpty` drops U1/U1b for the (b) nothing-to-return contrast.
 */
function board(opts: { p1TrashEmpty?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", KHAROX, "kharox")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "p2holder");
  if (!opts.p1TrashEmpty) {
    s = s.trash(P1, SKULKER, "u1").trash(P1, { might: 1, name: "U1b" }, "u1b");
  }
  return s
    .trash(P2, { might: 7, name: "P2 Old Unit" }, "p2old")
    .deckTop(P2, CEMETERY_ATTENDANT, "att") // top of P2's deck (first placed = top)
    .deckTop(P2, DECK_SPELL, "s1")
    .deckTop(P2, DECK_SPELL, "s2")
    .hand(P2, HIDDEN_BLADE, "blade")
    .hand(P2, MORBID_RETURN, "morbid");
}

interface EmpowerTrace {
  /** Units Kharox's reflexive 'choose a unit in their trash' offered. */
  kharoxOffered?: string[];
  /** Destinations offered for the Attendant P1 plays. */
  destinations?: string[];
  /** Cards the Attendant's 'return a unit from your trash' offered, and to whom. */
  attendantOffered?: string[];
  attendantSeat?: string;
}

/**
 * Empower Kharox and drive the whole sequence: P2 (the only opponent) burns 3; P1 'does this' choosing the Attendant,
 * plays it to `dest`, and answers the Attendant's own trigger with `returnPick` (if asked). Records what was offered.
 */
async function empowerIntoAttendant(game: Game, dest: "bf1" | "base" = "bf1", returnPick = "u1"): Promise<EmpowerTrace> {
  const trace: EmpowerTrace = {};
  await game.p1.activate("kharox");
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      break;
    }
    const cards = d.options.map((o) => o.card ?? o.zone ?? o.key);
    if (d.source?.cardId === "kharox" && cards.includes("att")) {
      trace.kharoxOffered = [...cards].sort();
      await game.p1.pick("att");
    } else if (d.semantics === "destination" || d.source?.pendingChoiceType === "choose-destination") {
      trace.destinations = [...cards].sort();
      await game.seat(d.seat).pick(d.options.find((o) => (o.zone ?? o.key).endsWith(dest))?.key as string);
    } else if (d.source?.cardId === "att") {
      trace.attendantOffered = [...cards].sort();
      trace.attendantSeat = d.seat;
      await game.seat(d.seat).pick(returnPick);
    } else {
      throw new Error(`unexpected prompt: ${d.prompt} ${JSON.stringify(cards)}`);
    }
  }
  return trace;
}

/** (a)+(b) done, then P2's turn with P2_POOL floating. */
async function p2Turn(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", P2_POOL);
}

const triple = (game: Game, card: string) => ({ controller: game.state(card).controller, owner: game.state(card).owner, zone: game.zoneOf(card) });

describe("Kharox plays the opponent's burned Cemetery Attendant; Hidden Blade sends it home — owner vs controller at every step", () => {
  test("setup: Attendant on top of P2's deck, P2's trash = [old unit], P1's trash = [U1, U1b]; Kharox ready with exactly [6][chaos][chaos]", async () => {
    const game = await board().build();
    expect(game.p2.deck().slice(0, 3)).toEqual(["att", "s1", "s2"]);
    expect(game.p2.trash()).toEqual(["p2old"]);
    expect(game.p1.trash().sort()).toEqual(["u1", "u1b"]);
    expect(game.p1.can("activate", "kharox")).toBe(true);
    expect(triple(game, "att")).toEqual({ controller: P2, owner: P2, zone: "mainDeck" });
  });

  // ================================================================== (a)
  test("(a) Empower resolves → P2 Burns exactly 3 into P2's OWN trash; the reflexive 'do this' offers P1 exactly the UNITS in P2's trash (Attendant + the old unit — not the spells, not P1's own trash) and is declinable ('you may')", async () => {
    const game = await board().build();
    await game.p1.activate("kharox");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    let d = game.decision();
    for (let i = 0; i < 8 && !(d?.kind === "pick" && d.source?.cardId === "kharox"); i++) {
      await game.settle();
      d = game.decision();
    }
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.p2.trash().sort()).toEqual(["att", "p2old", "s1", "s2"]);
    expect(game.p1.trash().sort()).toEqual(["u1", "u1b"]); // my trash untouched by the Burn
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["att", "p2old"]);
    expect(triple(game, "att")).toEqual({ controller: P2, owner: P2, zone: "trash" });
  });

  test("(a) P1 PLAYS it, so P1 picks the destination like any unit P1 plays: P1's base or a battlefield P1 CONTROLS (bf1) — P2's bf2 is never offered", async () => {
    const game = await board().build();
    const trace = await empowerIntoAttendant(game, "bf1");
    expect(trace.kharoxOffered).toEqual(["att", "p2old"]);
    expect(trace.destinations).toEqual(["base", "battlefield-bf1"]);
  });

  test("(a) on the board at bf1: CONTROLLER P1, OWNER P2 (191.3 / 127.1); it entered exhausted; cost ignored — P1 paid nothing beyond [6][chaos][chaos]; it counts as P1's unit there, not P2's → (P2, P1, bf1)", async () => {
    const game = await board().build();
    await empowerIntoAttendant(game, "bf1");
    expect(triple(game, "att")).toEqual({ controller: P1, owner: P2, zone: "battlefield-bf1" });
    expect(game.state("att")).toMatchObject({ damage: 0, isExhausted: true, might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.units("bf1").sort()).toEqual(["att", "holder"]);
    expect(game.p2.units()).toEqual(["p2holder"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ================================================================== (b)
  test("(b) 'When you play me' is P1's trigger (191.4.a / 191.3.d): P1 is asked, and 'your trash' offers exactly P1's trash units (U1, U1b) — P2's old unit in the trash it just left is NOT eligible", async () => {
    const game = await board().build();
    const trace = await empowerIntoAttendant(game, "bf1", "u1");
    expect(trace.attendantSeat).toBe(P1);
    expect(trace.attendantOffered).toEqual(["u1", "u1b"]);
    expect(trace.attendantOffered).not.toContain("p2old");
  });

  test("(b) …'your hand' = P1's: U1 goes from P1's trash to P1's HAND; U1b stays; P2's trash and hand are untouched by it", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await empowerIntoAttendant(game, "bf1", "u1");
    expect(game.zoneOf("u1")).toBe("hand");
    expect(game.p1.hand()).toContain("u1");
    expect(game.p1.trash()).toEqual(["u1b"]);
    expect(game.p2.trash().sort()).toEqual(["p2old", "s1", "s2"]);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.zoneOf("p2old")).toBe("trash");
  });

  test("(b) contrast — P1's trash holds NO unit: the instruction simply does nothing (no prompt left hanging, nothing pulled out of P2's trash), and the Attendant still lands at bf1 under P1", async () => {
    const game = await board({ p1TrashEmpty: true }).build();
    const p1Hand = game.p1.hand().length;
    const trace = await empowerIntoAttendant(game, "bf1");
    expect(trace.attendantOffered ?? []).not.toContain("p2old");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("p2old")).toBe("trash");
    expect(triple(game, "att")).toEqual({ controller: P1, owner: P2, zone: "battlefield-bf1" });
  });

  // ================================================================== (c)
  test("(c) P2's turn: Hidden Blade may choose the Attendant (a unit at a battlefield); it is KILLED into its OWNER's trash — P2's, never P1's — and there it has no controller memory → (P2, P2, P2.trash) (428.2, 056.2, 124)", async () => {
    const game = await board().build();
    await empowerIntoAttendant(game, "bf1", "u1");
    await p2Turn(game);
    const offered = (game.p2.option("cast", "blade")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(offered).toContain("att");
    await game.p2.cast("blade", { targets: "att" });
    await game.settle();
    expect(triple(game, "att")).toEqual({ controller: P2, owner: P2, zone: "trash" });
    expect(game.p2.trash()).toContain("att");
    expect(game.p1.trash()).not.toContain("att");
    expect(game.p1.trash()).toEqual(["u1b"]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.trash()).toContain("blade");
    // bf1 is still P1's — the Holder never left.
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1 });
  });

  test("(c) 'Its controller draws 2' reads the controller at the moment of the kill = P1 (192): P1's hand +2, P2's hand only loses the Blade (draws 0)", async () => {
    const game = await board().build();
    await empowerIntoAttendant(game, "bf1", "u1");
    await p2Turn(game);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.p2.cast("blade", { targets: "att" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p1.deck()).toHaveLength(p1Deck - 2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ================================================================== (d)
  test("(d) in P2's trash it is a brand-new P2 object: fresh (ready flag, 0 damage, printed 3), and P2's Morbid Return ('a unit from YOUR trash') offers it → back to P2's HAND (056)", async () => {
    const game = await board().build();
    await empowerIntoAttendant(game, "bf1", "u1");
    await p2Turn(game);
    await game.p2.cast("blade", { targets: "att" });
    await game.settle();
    expect(game.state("att")).toMatchObject({ controller: P2, damage: 0, isExhausted: false, might: 3, mightModifier: 0, zone: "trash" });
    const offered = (game.p2.option("cast", "morbid")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual(["att", "p2old"]);
    await game.p2.cast("morbid", { targets: "att" });
    await game.settle();
    expect(triple(game, "att")).toEqual({ controller: P2, owner: P2, zone: "hand" });
    expect(game.p2.hand()).toContain("att");
    expect(game.p1.hand()).not.toContain("att");
  });

  test("(d) …and replayed by P2 it is P2's unit (191.3): controller P2, in P2's base, exhausted, and NOW 'your trash' is P2's — its trigger hands P2's old unit to P2's hand; P1's trash (U1b) is not on offer", async () => {
    const game = await board().build();
    await empowerIntoAttendant(game, "bf1", "u1");
    await p2Turn(game);
    await game.p2.cast("blade", { targets: "att" });
    await game.settle();
    await game.p2.cast("morbid", { targets: "att" });
    await game.settle();
    expect(game.p2.can("play", "att")).toBe(true);
    await game.p2.play("att", { to: "base" });
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick") {
        break;
      }
      expect(d.seat).toBe(P2);
      const cards = d.options.map((o) => o.card ?? o.key);
      expect(cards).not.toContain("u1b");
      await game.p2.pick(cards.includes("p2old") ? "p2old" : (cards[0] as string));
    }
    expect(triple(game, "att")).toEqual({ controller: P2, owner: P2, zone: "base" });
    expect(game.state("att")).toMatchObject({ damage: 0, isExhausted: true, might: 3 });
    expect(game.p2.units("base")).toContain("att");
    expect(game.p1.units()).not.toContain("att");
    expect(game.zoneOf("p2old")).toBe("hand");
    expect(game.p2.hand()).toContain("p2old");
    expect(game.p1.trash()).toEqual(["u1b"]);
    expect(game.violations()).toEqual([]);
  });
});
