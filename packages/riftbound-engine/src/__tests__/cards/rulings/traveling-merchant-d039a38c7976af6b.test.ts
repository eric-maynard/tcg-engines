/**
 * Ruling d039a38c7976af6b — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · 3 Might "When you discard me, you may pay [fury] to play me."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Action · [Hidden] "Move a unit from a battlefield to its base."
 *
 * Q: My lone Merchant at a battlefield (Fight or Flight hidden there, Chompers in hand) moves away; its discard trigger bins
 *    Chompers, whose trigger lets me play it. Can Chompers be played to THAT battlefield — (A) open state on my turn,
 *    (B) in a showdown with Fight or Flight as chain link 1, (C) in a showdown with Fight or Flight as chain link 2?
 * A: No in every case. The moment the Merchant leaves you have 0 units there and lose control of the battlefield
 *    IMMEDIATELY — regardless of contested status or an unresolved combat — so Chompers cannot be played there.
 * Rules: 190.4 (control requires your units), the ruling's explicit "control is lost immediately at 0 units, in open or
 *        closed state"; 346 (a unit may only be played to your base or a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const FLAME_CHOMPERS = "ogn-006-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const SKULKER = "ogn-175-298"; // second card in hand so the discard is a real choice
/** Inline P2 Action spell "Deal 1 to a unit." — chain link 1 for case (C). */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Poke",
  timing: "action",
};

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", TRAVELING_MERCHANT, "merchant")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, FLAME_CHOMPERS, "chomp")
    .hand(P1, SKULKER, "other")
    .hand(P2, POKE, "poke");
}

/**
 * Drive the chain: pass priority, discard Chompers to the Merchant, pay [fury] for Chompers. Records the destination
 * options offered for Chompers (empty if it was placed without asking) and stops at Focus / the open main phase.
 */
async function driveChompers(game: Game): Promise<{ destinations: string[]; asked: boolean }> {
  let destinations: string[] = [];
  let asked = false;
  for (let i = 0; i < 30; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "chomp")) {
      await game.p1.pick("chomp"); // discard Flame Chompers
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes(); // pay [fury] to play Chompers
    } else if (d.kind === "pick" && d.seat === P1 && d.source?.cardId === "chomp") {
      asked = true;
      destinations = d.options.map((o) => o.zone ?? o.key);
      await game.p1.pick(d.options.find((o) => (o.zone ?? o.key) === "base") ? "base" : (d.options[0]?.key as string));
    } else {
      break;
    }
  }
  return { asked, destinations };
}

describe("Ruling d039a38c7976af6b — the Merchant leaving empties the battlefield: control is lost at once and Chompers can't be played there", () => {
  // Expected (A): as soon as the Merchant's move to base completes, bf1 has no P1 unit → controller null immediately; the
  // Chompers play offers only P1's base. Actual: the engine keeps P1 as bf1's controller through the whole chain (control
  // only lapses at the next open-state Cleanup) and offers "battlefield-bf1" as a destination.
  test.failing("BUG: ruling d039a38c7976af6b (A, open state on my turn) — engine keeps control of the emptied bf1 during the chain and offers it to Chompers; control should drop immediately and only base be legal", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "base");
    expect(game.zoneOf("merchant")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // "immediately"
    const hand = game.p1.hand().length;
    const { destinations } = await driveChompers(game);
    expect(destinations).not.toContain("battlefield-bf1");
    expect(game.zoneOf("chomp")).toBe("base");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // discarded Chompers, drew 1
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // RULING-CONFLICT: this ruling's "control is lost immediately, in open or closed state" contradicts the engine's one
  // adjudicated battlefield-control model (E/operations/battlefield-control.ts; rules 190.4 / 190.4.b / 323.6 / 348.2.a /
  // 466.5, matrix test core-rules/battlefield-control-timing.test.ts). Control only lapses at a Cleanup run in an OPEN
  // state, and it is FROZEN outright while a Showdown/Combat is ongoing at that battlefield (190.4.b) — so the defender
  // whose last unit is Flashed/Gusted/moved home keeps control there for the duration. Asserted as engine behaviour.
  test("RULING-CONFLICT (B, showdown, Fight or Flight as chain link 1): control of the emptied bf1 is FROZEN mid-combat (190.4.b) — bf1 stays a legal Chompers destination", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof", { answers: ["merchant"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.acting().pick("merchant");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof"]); // chain link 1
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fight or Flight resolves
    expect(game.zoneOf("merchant")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    const { destinations } = await driveChompers(game);
    expect(destinations).toContain("battlefield-bf1");
    expect(game.zoneOf("chomp")).toBe("base"); // base was picked when offered
  });

  // RULING-CONFLICT (same model as (B)): FoF as chain link 2 changes nothing — the showdown at bf1 is still ongoing when
  // Chompers is played, so control there is frozen with P1 (190.4.b) and bf1 remains a legal destination.
  test("RULING-CONFLICT (C, showdown, Fight or Flight as chain link 2): bf1's control is still frozen with P1 and offered to Chompers", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("raider", "bf1");
    await game.p2.cast("poke", { targets: "merchant" }); // chain link 1
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof", { answers: ["merchant"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.acting().pick("merchant");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke", "fof"]); // FoF is chain link 2
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fight or Flight resolves first (LIFO)
    expect(game.zoneOf("merchant")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    const { destinations } = await driveChompers(game);
    expect(destinations).toContain("battlefield-bf1");
    expect(game.zoneOf("chomp")).toBe("base"); // base was picked when offered
  });

  test("what does happen on the engine's line (A): the Merchant's move trigger discards Chompers and draws 1, and paying [fury] plays Chompers", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move("merchant", "base");
    await driveChompers(game);
    expect(game.zoneOf("chomp")).not.toBe("hand");
    expect(game.zoneOf("chomp")).not.toBe("trash"); // it was played
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("other")).toBe("hand");
  });
});
