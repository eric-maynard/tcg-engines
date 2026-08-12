/**
 * Ruling c59d2540c12cf001 — Here to Help (SFD-111 → sfd-111-221) · Spell · [2][body] · [Hidden] [Action]
 *   "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · Unit · [8][body][body] · 8 Might · "[Deflect] · You may
 *     play me to an occupied enemy battlefield."
 *
 * Q: Using Here to Help from the Facedown Zone, must the Deadbloom be played at the battlefield where Here
 *    to Help is hidden?
 * A: Yes. A hidden card's restriction applies to every choice the effect offers, the play location included,
 *    so the destination list collapses to that one battlefield. Cast the same spell from hand and the unit
 *    may go to any battlefield you control.
 * Rules: 811.1.d.2 (choices are locked to the Facedown Zone's battlefield), 355.4 (destination chosen at
 *        finalization), 359.3.e (restrictions beat permissions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const DEADBLOOM = "ogn-161-298";

/** P1 controls bf1 and bf2; P2 holds an occupied bf3. The Deadbloom waits in hand. */
function twoOwnBattlefields(hidden: boolean) {
  const s = scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Bulwark" }, "a")
    .unit(P1, "bf2", { might: 2, name: "Outrider" }, "b")
    .unit(P2, "bf3", { might: 2, name: "Occupier" }, "c")
    .hand(P1, DEADBLOOM, "deadbloom")
    .resources(P1, { energy: 7, power: { body: 3 } });
  return hidden ? s.facedown(P1, "bf1", HERE_TO_HELP, "help") : s.hand(P1, HERE_TO_HELP, "help");
}

describe("Ruling c59d2540c12cf001 — a hidden Here to Help can only place the unit at its own battlefield", () => {
  test("cast from HAND, the freed unit gets a real destination choice between both battlefields P1 controls", async () => {
    const game = await twoOwnBattlefields(false).build();
    await game.p1.cast("help");
    await game.settle();
    await game.p1.pick("deadbloom");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.zone).toSorted() : []).toEqual([
      "battlefield-bf1",
      "battlefield-bf2",
    ]);
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("deadbloom")).toBe("bf2");
  });

  test("revealed from the Facedown Zone at bf1 there is no destination choice at all — it goes to bf1", async () => {
    const game = await twoOwnBattlefields(true).build();
    expect(game.zoneOf("help")).toBe("facedown-bf1");
    await game.p1.reveal("help");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    await game.p1.pick("deadbloom");
    await game.settle();
    expect(game.locationOf("deadbloom")).toBe("bf1"); // not bf2, and not the enemy's bf3
    expect(game.p1.units("bf2")).toEqual(["b"]);
    expect(game.p2.units("bf3")).toEqual(["c"]);
    expect(game.violations()).toEqual([]);
  });

  test("the discount still applies from the Facedown Zone — [8] becomes [5] plus the printed [body][body]", async () => {
    const game = await twoOwnBattlefields(true).build();
    expect(game.p1.energy()).toBe(7);
    await game.p1.reveal("help");
    await game.settle();
    await game.p1.pick("deadbloom");
    await game.settle();
    expect(game.p1.energy()).toBe(2); // 7 − (8 − 3)
    expect(game.p1.power("body")).toBe(1); // 3 − 2
  });
});
