/**
 * Ruling 975de9cb1791e8f2 — Vex, Apathetic (UNL-150 → unl-150-219) · Champion · 4 Might · "[Deflect] When an opponent plays a
 *     unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 · [Hidden] "When you play me, you may choose a unit you control at another
 *     location. Move me to its location and it to my original location."
 *
 * Q: Vex is at a battlefield and the opponent reveals Tideturner — does the swap happen or does Vex cancel it?
 * A: Depends on whose turn it is (simultaneous triggers: Turn Player places first, so the other resolves first — LIFO).
 *    1) Tideturner's controller is the Turn Player: Tideturner's trigger goes down first, Vex's on top → Vex resolves
 *       first, Tideturner is stunned and can't move → the swap fails.
 *    2) Tideturner's controller is NOT the Turn Player: Vex's trigger first, Tideturner's on top → the swap completes,
 *       then Vex stuns Tideturner at its new location.
 * Rules: 383.3.d.1 / 303.2.a (turn order for simultaneous triggers), 336–340 (LIFO), 423 (Stun), 811 (Hidden play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const TIDETURNER = "ogn-199-298";

/** Turn 3. P1 controls bfA (Anchor 3 + Tideturner facedown), Pal (2) in P1's base. P2's Vex holds bfV. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfV", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Anchor" }, "anchor")
    .facedown(P1, "bfA", TIDETURNER, "tt")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "bfV", VEX, "vex");
}

/** After the reveal: opt into the swap and name Pal (base = "another location"). */
async function optIntoSwapWithPal(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("pal");
  }
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling 975de9cb1791e8f2 — Vex vs a revealed Tideturner: who is Turn Player decides whether the swap lands", () => {
  test("1) P1 (Tideturner's controller) is the Turn Player: chain = [Tideturner (P1) below, Vex (P2) on top]; Vex resolves first → Tideturner stunned + can't move; then Tideturner's trigger cannot move it — it stays at bfA", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.reveal("tt");
    expect(game.locationOf("tt")).toBe("bfA");
    await optIntoSwapWithPal(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "tt", controller: P1, targets: ["pal"], triggered: true }),
      expect.objectContaining({ cardId: "vex", controller: P2, triggered: true }),
    ]);
    await passBoth(game); // Vex's trigger (top) resolves
    expect(game.state("tt")).toMatchObject({ isStunned: true, location: "bfA" });
    expect(game.state("tt").keywords).toContain("NoMove");
    expect(game.chain().map((c) => c.cardId)).toEqual(["tt"]);
    await passBoth(game); // Tideturner's trigger: the swap fails for Tideturner
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("tt")).toBe("bfA"); // never left
    expect(game.state("tt").isStunned).toBe(true);
    expect(game.locationOf("vex")).toBe("bfV");
    // (The ruling only speaks to Tideturner not moving; the partner's fate is not asserted here.)
  });

  // Expected (383.3.d.1): on P2's turn P2 is the Turn Player, so Vex's trigger is placed FIRST and Tideturner's (P1) on top;
  // Tideturner resolves first — Tideturner → base, Pal → bfA — and only then Vex stuns Tideturner in base.
  test("ruling 975de9cb1791e8f2 — 2) P2's turn (P1 reveals Tideturner as a Reaction in P2's showdown): the triggers are ordered [vex, tt], so the swap lands", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 4, name: "Raider" }, "raider").build();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bfA"); // opens a showdown at bfA
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "tt")).toBe(true);
    await game.p1.reveal("tt");
    await optIntoSwapWithPal(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "vex", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "tt", controller: P1, targets: ["pal"], triggered: true }),
    ]);
    await passBoth(game); // Tideturner's trigger (top) resolves: the swap completes
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("pal")).toBe("bfA");
    expect(game.state("tt").isStunned).toBe(false);
    await passBoth(game); // then Vex: stun Tideturner where it now is
    expect(game.chain()).toEqual([]);
    expect(game.state("tt")).toMatchObject({ isStunned: true, location: "base" });
    expect(game.state("tt").keywords).toContain("NoMove");
  });
});
