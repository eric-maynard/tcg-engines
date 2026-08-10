/**
 * Ruling 669f78aeb76689c5 — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · [Hidden] "When you play me, you may choose a unit you control at another
 *     location. Move me to its location and it to my original location."
 *
 * Q: Can you play a Hidden card from battlefield B while a showdown is happening at battlefield A?
 * A: Yes — like any Reaction from hand, if otherwise legal. But no cross-targeting: a hidden spell / hidden permanent's play
 *    effect must pick objects at ITS battlefield (Hidden Blade at B cannot kill at A), unless the ability's own restriction
 *    makes that impossible (Tideturner's "at another location"). Hidden units are played to the battlefield they were at.
 * Rules: 811.6 (Reaction from facedown), 811.1.d.1–2 (played to / targets at that battlefield; Tideturner exception).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const TIDETURNER = "ogn-199-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds bfA (GuardA 4) and bfB (GuardB 2, PawnB 1) with `hidden` facedown at bfB. P2's Raider (3) attacks bfA. */
function board(hidden: string, alias: string) {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 4, name: "GuardA" }, "guardA")
    .unit(P1, "bfB", { might: 2, name: "GuardB" }, "guardB")
    .unit(P1, "bfB", { might: 1, name: "PawnB" }, "pawnB")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .facedown(P1, "bfB", hidden, alias)
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

describe("Ruling 669f78aeb76689c5 — hidden cards at battlefield B can be flipped during a showdown at A, but pick objects at B", () => {
  test("Hidden Blade facedown at bfB IS revealable while the combat showdown is at bfA (P1 holding Focus)", async () => {
    const game = await board(HIDDEN_BLADE, "blade").build();
    await game.p2.move("raider", "bfA");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bfA" });
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("… but its kill must be chosen among units AT bfB — GuardA / the Raider at bfA are never offered; GuardB dies and P1 draws 2", async () => {
    const game = await board(HIDDEN_BLADE, "blade").build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    await game.p1.reveal("blade");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "blade" } });
    const offered = (d as Pick).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["guardB", "pawnB"]);
    expect(offered).not.toContain("guardA");
    expect(offered).not.toContain("raider");
    expect((await game.p1.try((p) => p.pick("raider"))).ok).toBe(false);
    await game.p1.pick("guardB");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]); // the non-targeted part (draw) works fine from B
    expect(game.zoneOf("raider")).toBe("battlefield-bfA");
    expect(game.zoneOf("guardA")).toBe("battlefield-bfA");
    expect(game.violations()).toEqual([]);
  });

  test("Tideturner facedown at bfB: flipped during the bfA showdown it is PLAYED TO bfB, and its 'unit at ANOTHER location' choice may legally reach GuardA at bfA (swap)", async () => {
    const game = await board(TIDETURNER, "tide").build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "tide")).toBe(true);
    await game.p1.reveal("tide");
    // Played to the battlefield it was hidden at.
    expect(game.locationOf("tide")).toBe("bfB");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tide" } });
    await game.p1.yes();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const opts = d.options.map((o) => o.card ?? o.key);
        expect(opts).toContain("guardA"); // another location IS allowed here (explicit restriction)
        expect(opts).not.toContain("guardB"); // same location is not "another location"
        await game.p1.pick("guardA");
      } else if (d?.kind === "action" && d.passKey && game.chain().length > 0) {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(game.locationOf("tide")).toBe("bfA");
    expect(game.locationOf("guardA")).toBe("bfB");
    expect(game.state("tide").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });
});
