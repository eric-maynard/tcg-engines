/**
 * Ruling 4157cce6673d55c7 — Doran's Ring (SFD-124 → sfd-124-221) · Equipment · +1 · "[Equip] [chaos] … When I conquer, discard 1,
 *     then draw 1." (Effect Text → the wearer's)
 *   × Reckoner's Arena (OGN-286 → ogn-286-298) · Battlefield · "When you hold here, activate the conquer effects of units here."
 *   (Trinity Force sfd-115-221 / Skyfall sfd-030-221 are cited only as the analogous documented interaction.)
 *
 * Q: Does Equipment like Doran's Ring attached to a unit also trigger at Reckoner's Arena?
 * A: Yes. While attached, the Ring's conquer effect is part of the unit's effects, so when you HOLD the Arena its trigger
 *    activates that conquer effect: you discard 1, then draw 1.
 * Rules: 136 / 718.3 (Effect Text is conferred to the wearer), 464.2 (hold at start of turn), 383.4.g.1 (an effect may
 *        "activate" another card's triggered effects), FAQ (Trinity Force × Skyfall at the Arena).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DORANS_RING = "sfd-124-221";
const RECKONERS_ARENA = "ogn-286-298";
const SKULKER = "ogn-175-298";

/**
 * End of P2's turn. P1 controls `arena` (Reckoner's Arena, live text — or an inert plain battlefield) with a 3-Might Bearer
 * wearing Doran's Ring standing on it → P1 HOLDS it as P1's turn begins. P1's hand: exactly one known card, "junk".
 * P1's deck top→: d1, d2, d3. P1 is scripted to discard "junk" whenever asked.
 */
function board(arenaLive: boolean) {
  return scenario()
    .active(P2)
    .battlefield("arena", arenaLive ? { controller: P1, def: RECKONERS_ARENA, inert: false } : { controller: P1 })
    .unit(P1, "arena", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["ring"] })
    .card("ring", { def: DORANS_RING, meta: { attachedTo: "bearer" }, owner: P1, zone: "arena" })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, SKULKER, "junk")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"])
    .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "junk") ? "junk" : undefined)]);
}

/** P2 ends the turn; walk P1's Beginning Phase to P1's open main phase, recording every chain item seen. */
async function intoP1Turn(game: Game): Promise<string[]> {
  const seen: string[] = [];
  await game.p2.endTurn();
  for (let i = 0; i < 24; i++) {
    for (const c of game.chain()) {
      const tag = `${c.cardId}/${c.controller}`;
      if (!seen.includes(tag)) {
        seen.push(tag);
      }
    }
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    const r = await game.settle();
    if (r.reason === "unanswered") {
      break;
    }
  }
  return seen;
}

describe("Ruling 4157cce6673d55c7 — holding Reckoner's Arena activates the conquer effect Doran's Ring confers on its wearer", () => {
  test("premise: the Bearer wears the Ring (3 + 1 = 4) on P1's Arena; P1 has 0 points and exactly 'junk' in hand", async () => {
    const game = await board(true).build();
    expect(game.state("ring").attachedTo).toBe("bearer");
    expect(game.state("bearer")).toMatchObject({ location: "arena", might: 4 });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["junk"]);
  });

  test("control: the Ring's conferred conquer effect works on a REAL conquer — Bearer takes an open battlefield, the wearer's trigger resolves: P1 discards 'junk', then draws 1", async () => {
    const game = await scenario()
      .battlefield("open", { controller: null })
      .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["ring"] })
      .card("ring", { def: DORANS_RING, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
      .hand(P1, SKULKER, "junk")
      .deck(P1, [SKULKER, SKULKER], ["d1", "d2"])
      .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "junk") ? "junk" : undefined)])
      .build();
    await game.p1.move("bearer", "open");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bearer", controller: P1, triggered: true })]);
    await game.settle();
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("holding the ARENA: P1 scores the hold and the Arena's 'when you hold here' trigger goes on the chain first", async () => {
    const game = await board(true).build();
    const seen = await intoP1Turn(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(seen[0]).toBe(`arena/${P1}`);
  });

  // Expected: the Arena's trigger activates the conquer effect the Ring confers on the Bearer (718.3) — P1 is asked to
  // discard ('junk' → trash) and then draws 1, ending with turn draw + Ring draw in hand. Actual: "activate the conquer
  // effects of units here" only scans the units' OWN printed conquer triggers; the Equipment-conferred one is skipped —
  // no discard prompt, no extra draw ('junk' stays in hand beside the single turn draw).
  test("ruling 4157cce6673d55c7 — Reckoner's Arena activates the conquer effect an attached Doran's Ring confers on the unit", async () => {
    const game = await board(true).build();
    const seen = await intoP1Turn(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(1); // the hold itself
    expect(seen[0]).toBe(`arena/${P1}`); // the Arena's hold trigger is the bridge
    expect(game.zoneOf("junk")).toBe("trash"); // "discard 1"
    expect(game.p1.trash()).toEqual(["junk"]);
    expect(game.p1.hand()).toHaveLength(2); // "then draw 1" + the normal turn draw
    expect(game.p1.hand().every((c) => ["d1", "d2", "d3"].includes(c))).toBe(true);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.state("ring").attachedTo).toBe("bearer");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same hold on a PLAIN battlefield activates nothing — 'junk' stays in hand next to the single turn draw", async () => {
    const game = await board(false).build();
    const seen = await intoP1Turn(game);
    expect(game.p1.points()).toBe(1);
    expect(seen).toEqual([]);
    expect(game.zoneOf("junk")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["d1", "junk"]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("contrast: at the Arena but with the Ring lying UNATTACHED in base, the Bearer has no conquer effect to activate — no discard, no extra draw", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false })
      .unit(P1, "arena", { might: 3, name: "Bearer" }, "bearer")
      .gear(P1, DORANS_RING, "ring")
      .hand(P1, SKULKER, "junk")
      .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"])
      .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "junk") ? "junk" : undefined)])
      .build();
    await intoP1Turn(game);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("junk")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["d1", "junk"]);
  });
});
