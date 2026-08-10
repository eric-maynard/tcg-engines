/**
 * Ruling b92de158ec48b0f5 — Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · 2 + [chaos]
 *   "Move a friendly unit and ready it."
 *   × Charm (OGN-043 → ogn-043-298) · Action · Calm · 1 + [calm] · "Move an enemy unit."
 *
 * Q: Can I choose NOT to move the unit with Ride the Wind / Charm (e.g. "move" it to where it already is)?
 * A: No. The move is a mandatory instruction: if a valid destination exists you must pick one, and a move needs a
 *    change of location — the unit's current location is never a legal destination. (Only if no destination were
 *    valid at all would the instruction be skipped.)
 * Rules: 356.3.e.11 / 359.3.e (instructions that can be followed must be), 424.1 / 425 (a move has an origin and a
 *        different destination), 356.3.e.6 (impossible instructions are ignored).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";

/** P1's turn. bf1 (P1's) holds P1's exhausted Ally (2); bf2 (P2's) holds P2's Foe (5). P1 has both spells and their costs. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally", { exhausted: true })
    .unit(P2, "bf2", { might: 5, name: "Foe" }, "foe")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P1, CHARM, "charm");
}

describe("Ruling b92de158ec48b0f5 — the move on Ride the Wind / Charm is mandatory; 'stay put' is not a destination", () => {
  test("Ride the Wind on Ally (at bf1): P1 must choose a destination — the prompt cannot be declined, offers only base / bf2, and never Ally's current bf1", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "ally" });
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1, semantics: "destination" });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf2"]);
    expect(dests).not.toContain("battlefield-bf1");
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("battlefield-bf1"))).ok).toBe(false);
    // Still waiting for a real destination.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("ally")).toBe("base"); // it DID move …
    expect(game.state("ally").isReady).toBe(true); // … and was readied
    expect(game.violations()).toEqual([]);
  });

  test("Charm on the enemy Foe (at bf2): same — a destination is compulsory, Foe's own bf2 is not offered, declining is refused; picking P2's base moves it there", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1, semantics: "destination" });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).not.toContain("battlefield-bf2");
    expect(dests).toContain("base");
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("battlefield-bf2"))).ok).toBe(false);
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("foe")).toBe("base");
    expect(game.p2.units("base")).toContain("foe");
    expect(game.violations()).toEqual([]);
  });
});
