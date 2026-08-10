/**
 * Ruling b4923874fa910ee6 — Taric, Protector (OGN-074 → ogn-074-298) · Champion Unit · Calm · 4+[calm] · 4 Might
 *     "[Shield] (+1 [Might] while I'm a defender.) [Tank] (I must be assigned combat damage first.) Other friendly units here have [Shield]."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Taric has Tank so he takes lethal damage first — does the Shield he grants allies still count during that combat?
 * A: Yes. All combat damage is assigned simultaneously while Taric is alive, so allies still have +1; Taric only leaves in
 *    the cleanup afterwards. The attacker must put lethal on Taric first and cannot "pre-discount" the allies' Shield.
 *    If instead Taric is killed BEFORE damage (e.g. Hidden Blade during the showdown), the boost is gone at assignment.
 * Rules: 465.2 (combat damage assigned simultaneously; Tank first), 458 (cleanup kills after damage), 812 (Shield), 815 (Tank).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TARIC = "ogn-074-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn. P1 holds bf1 with Taric (4; 5 as defender) and a 2-Might Ally (3 as defender via Taric). P2's 7-Might Bruiser
 * attacks: 7 = exactly lethal-on-Taric (5) + 2 on the Ally — the Ally lives iff its Shield still counts at assignment.
 * P2 also holds Hidden Blade ([2]+[order]) for the contrast case.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TARIC, "taric")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser")
    .hand(P2, HIDDEN_BLADE, "hb")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

describe("Ruling b4923874fa910ee6 — Taric's granted Shield still counts while combat damage is assigned, even though Tank makes him die first", () => {
  test("premise: as defenders Taric is 5 (own Shield) and the Ally is 3 (Shield granted by Taric); Bruiser attacks with 7", async () => {
    const game = await board().build();
    expect(game.state("taric").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.state("ally").grantedKeywords.map((k) => k.keyword)).toContain("Shield");
    await game.p2.move("bruiser", "bf1");
    expect(game.state("taric")).toMatchObject({ combatRole: "defender", might: 5 });
    expect(game.state("ally")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("bruiser")).toMatchObject({ combatRole: "attacker", might: 7 });
  });

  test("pass/pass → combat: Bruiser must put lethal 5 on Taric (Tank) leaving only 2 for the Ally, whose Shield (3 Might) still applies at assignment — Taric dies, the ALLY SURVIVES, Bruiser takes 5+3=8 and dies; P1 keeps bf1", async () => {
    const game = await board().build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("taric")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    // After the combat the Ally's granted Shield is gone with Taric (2 Might again, no longer a defender).
    expect(game.state("ally")).toMatchObject({ might: 2 });
    expect(game.state("ally").grantedKeywords.map((k) => k.keyword)).not.toContain("Shield");
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Taric killed BEFORE damage (P2 Hidden Blades him during the showdown; P1 draws 2): the Ally is a bare 2 at assignment, Bruiser kills it, survives with the Ally's 2, and conquers bf1", async () => {
    const game = await board().build();
    await game.p2.move("bruiser", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("hb", { targets: "taric" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("taric")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    // Boost already gone before any damage is assigned.
    expect(game.state("ally")).toMatchObject({ combatRole: "defender", might: 2 });
    expect(game.state("ally").grantedKeywords.map((k) => k.keyword)).not.toContain("Shield");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
