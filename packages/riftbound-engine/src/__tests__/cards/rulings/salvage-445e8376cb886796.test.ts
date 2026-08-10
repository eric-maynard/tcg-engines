/**
 * Ruling 445e8376cb886796 — Salvage (OGN-224 → ogn-224-298) · Action spell · [2][order]
 *     "You may kill up to one gear. Draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: If my Salvage is Defied, do I still draw 1?
 * A: No. A countered spell is removed from the chain without resolving; none of its instructions (kill gear, draw) happen.
 * Rules: 336/359 (counter — the spell leaves the chain unresolved, goes to trash), FAQ #5046.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const DEFY = "ogn-045-298";

/** P1's turn. P1: Salvage + exact cost, known deck top. P2: a Trinket gear in base, Defy + exact cost. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P2, { cardType: "gear", energyCost: 1, name: "Trinket" }, "trinket")
    .hand(P1, SALVAGE, "salvage")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling 445e8376cb886796 — a Defied Salvage draws nothing", () => {
  test("control: unopposed, Salvage kills the chosen gear and P1 draws exactly 1", async () => {
    const game = await board().build();
    await game.p1.cast("salvage", { targets: "trinket" });
    await game.settle();
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("Defy resolves first (LIFO) and counters Salvage: Salvage goes to trash unresolved — no gear killed, NO card drawn", async () => {
    const game = await board().build();
    await game.p1.cast("salvage", { targets: "trinket" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "salvage" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["salvage", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("base"); // "kill up to one gear" never carried out
    expect(game.p1.hand()).toEqual([]); // "Draw 1" never carried out
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
