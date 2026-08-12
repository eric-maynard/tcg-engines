/**
 * Ruling 50185bea472b86b0 — Skyfall of Areion (SFD-030 → sfd-030-221) × a battlefield's own hold effect
 *   Skyfall: Equipment, +2 Might, "My hold effects are also conquer effects, and vice versa."
 *   Ahri, Alluring (OGN-066 → ogn-066-298): 4 Might, "When I hold, you score 1 point."
 *   Grove of the God-Willow (OGN-280 → ogn-280-298): Battlefield, "When you hold here, draw 1."
 *
 * Q: When a unit wearing Skyfall conquers a battlefield, does the BATTLEFIELD's "when I hold" effect trigger?
 * A: No. Skyfall only rewrites the equipped unit's own hold/conquer effects; the battlefield's abilities are
 *    its own and are untouched. So Ahri's hold effect does fire on the conquer — the Grove's does not.
 * Rules: 136.2.d / 718 (an Equipment's Effect Text is appended to the WEARER — "my" = the wearer),
 *        471.2.b (a battlefield's "when you hold here" is the battlefield's own triggered ability),
 *        466.5.d / 469.1 (Conquer), 315.2.b.2 (Hold happens in your Beginning Phase).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SKYFALL = "sfd-030-221";
const AHRI = "ogn-066-298";
const GROVE = "ogn-280-298";

/** P1's turn. P2 holds the Grove with a 2-Might Chaff; P1's Ahri (4 + 2 = 6) waits in base wearing Skyfall. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: GROVE, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Chaff" }, "chaff")
    .unit(P1, "base", AHRI, "ahri", { equippedWith: ["skyfall"] })
    .card("skyfall", { def: SKYFALL, meta: { attachedTo: "ahri" }, owner: P1, zone: "base" });
}

describe("Ruling 50185bea472b86b0 — Skyfall mirrors the WEARER's hold effects onto conquer, never the battlefield's", () => {
  test("premise: Ahri wears Skyfall (4 + 2 = 6) and the Grove is P2's", async () => {
    const game = await board().build();
    expect(game.state("skyfall").attachedTo).toBe("ahri");
    expect(game.state("ahri").might).toBe(6);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("conquering with Skyfall: Ahri's hold effect DOES fire (an extra point) while the Grove's 'draw 1' does NOT", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("ahri", "bf1");
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2); // 1 for the Conquer + 1 from Ahri's mirrored hold effect
    expect(game.p1.hand()).toHaveLength(handBefore); // the battlefield's own hold effect stayed silent
    expect(game.violations()).toEqual([]);
  });

  test("control: the Grove's ability is alive — a REAL hold of it draws the card (and Ahri scores again)", async () => {
    const game = await board().active(P2).build();
    const handBefore = game.p1.hand().length;
    // Put Ahri on the battlefield P1 already controls, then let P1's Beginning Phase come round.
    const held = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: GROVE, inert: false })
      .unit(P1, "bf1", AHRI, "ahri", { equippedWith: ["skyfall"] })
      .card("skyfall", { def: SKYFALL, meta: { attachedTo: "ahri" }, owner: P1, zone: "bf1" })
      .build();
    const heldHandBefore = held.p1.hand().length;
    await held.advanceTurn();
    expect(held.turnPlayer()).toBe(P1);
    expect(held.p1.points()).toBe(2); // 1 for the Hold + 1 from Ahri's own hold effect
    expect(held.p1.hand().length).toBeGreaterThan(heldHandBefore); // the Grove drew (plus the turn's draw)
    expect(game.p1.hand()).toHaveLength(handBefore); // untouched control board
  });
});
