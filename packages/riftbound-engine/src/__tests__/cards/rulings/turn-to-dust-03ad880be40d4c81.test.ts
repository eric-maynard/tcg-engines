/**
 * Ruling 03ad880be40d4c81 — Turn to Dust (UNL-070 → unl-070-219) · Spell · Mind · [2]
 *   "Give a gear [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × Trinity Force (SFD-115 → sfd-115-221) · Equipment · +2 Might "[Equip] [body] … When I hold, score 1 point."
 *   × Kai'Sa, Survivor (OGN-039 → ogn-039-298) · 4 Might "[Accelerate] … When I conquer, draw 1."
 *
 * Q: Can Turn to Dust give Temporary to a Trinity Force that is attached to Kai'Sa, Survivor?
 * A: Yes. Attached Equipment is still a gear and only its PRINTED text is inactive; a GRANTED keyword is fully
 *    active. Temporary therefore triggers and kills the attached Trinity Force at the start of its controller's
 *    next Beginning Phase (Kai'Sa stays, losing the +2).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TURN_TO_DUST = "unl-070-219";
const TRINITY_FORCE = "sfd-115-221";
const KAISA_SURVIVOR = "ogn-039-298";

/** P1's turn. P2's Kai'Sa (4) at P2's bf1 wearing Trinity Force (+2 → 6). P1: Turn to Dust in hand, [2]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KAISA_SURVIVOR, "kaisa", { equippedWith: ["triforce"] })
    .card("triforce", { def: TRINITY_FORCE, meta: { attachedTo: "kaisa" }, owner: P2, zone: "bf1" })
    .hand(P1, TURN_TO_DUST, "dust")
    .resources(P1, { energy: 2 });
}

describe("Ruling 03ad880be40d4c81 — Turn to Dust can make an ATTACHED Trinity Force Temporary, and Temporary then kills it", () => {
  test("premise: Trinity Force is attached to Kai'Sa (4 + 2 = 6) and has no Temporary", async () => {
    const game = await board().build();
    expect(game.state("triforce")).toMatchObject({ attachedTo: "kaisa", controller: P2 });
    expect(game.state("kaisa").might).toBe(6);
    expect(game.state("triforce").keywords).not.toContain("Temporary");
  });

  test("Turn to Dust offers the attached Trinity Force as a legal 'gear' target", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "dust")).toBe(true);
    const offered = (game.p1.option("cast", "dust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("triforce");
  });

  test("it resolves: Trinity Force gains Temporary while staying attached (Kai'Sa still 6)", async () => {
    const game = await board().build();
    await game.p1.cast("dust", { targets: "triforce" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("dust")).toBe("trash");
    expect(game.state("triforce").keywords).toContain("Temporary");
    expect(game.state("triforce").attachedTo).toBe("kaisa");
    expect(game.state("kaisa").might).toBe(6);
  });

  test("the granted Temporary is ACTIVE on the attached gear: at the start of P2's (its controller's) Beginning Phase Trinity Force is killed; Kai'Sa remains at 4", async () => {
    const game = await board().build();
    await game.p1.cast("dust", { targets: "triforce" });
    await game.settle();
    await game.advanceTurn(); // P1 ends → P2's turn begins; Temporary fires in P2's Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("triforce")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.state("kaisa")).toMatchObject({ attachments: [], might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("timing contrast: nothing happens to it during the rest of P1's turn — it dies only when P2's turn begins", async () => {
    const game = await board().build();
    await game.p1.cast("dust", { targets: "triforce" });
    await game.settle();
    expect(game.zoneOf("triforce")).toBe("battlefield-bf1");
    await game.p1.endTurn();
    // Still there through P1's Ending step; killed once P2's Beginning Phase runs.
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("triforce")).toBe("trash");
  });
});
