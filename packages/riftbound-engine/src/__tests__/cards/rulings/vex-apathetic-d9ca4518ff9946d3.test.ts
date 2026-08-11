/**
 * Ruling d9ca4518ff9946d3 — Vex, Apathetic (UNL-150 → unl-150-219) · Champion Unit · Chaos · 4 · 4 Might
 *     "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Tideturner (OGN-199 → ogn-199-298) "[Hidden] When you play me, you may choose a unit you control at another location.
 *     Move me to its location and it to my original location."
 *
 * Q: Vex is at a battlefield; an opponent plays Tideturner to base — is it stunned before its move trigger resolves?
 * A: Depends on the Turn Player. Both triggers fire at once; the Turn Player's goes on the chain first (resolves last).
 *    Turn Player plays Tideturner → Vex's trigger is on top: Tideturner is stunned/can't move BEFORE its swap resolves,
 *    so Tideturner stays and the exchange is cancelled outright (see the RULING-CONFLICT note below: this ruling calls for
 *    partial resolution, ruling b449100f59889211 on the same pair calls for cancellation — the engine cancels).
 *    Non-Turn Player plays Tideturner → Tideturner's trigger is on top: the swap completes, then the stun applies.
 * Rules: 383.3.d.1 (simultaneous triggers: Turn Player's first), 340 (LIFO), 423 (Stun), 359.3.e.11 (do as much of an
 *        instruction as possible), 811 (Hidden play as a Reaction on the opponent's turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const TIDETURNER = "ogn-199-298";
const CLEAVE = "ogn-004-298"; // cheap [Action] — P2 opens a chain on P2's turn so P1 can React with the hidden Tideturner

async function resolveTop(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

/** Tideturner's opt-in is P1's decision; say yes and name `partner` if asked. */
async function optIntoSwap(game: Game, partner: string): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick(partner);
  }
}

describe("Ruling d9ca4518ff9946d3 — Vex vs Tideturner: who is Turn Player decides whether the stun beats the swap", () => {
  test("TURN PLAYER (P1) plays Tideturner to base with P2's Vex at a battlefield: chain = [tt (P1, first) · vex (P2, on top)] → Vex resolves first: Tideturner stunned + can't move while its own trigger is still pending", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfV", { controller: P2 })
      .unit(P1, "bfA", { might: 3, name: "Anchor" }, "anchor")
      .unit(P2, "bfV", VEX, "vex")
      .resources(P1, { energy: 2 })
      .hand(P1, TIDETURNER, "tt")
      .build();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.play("tt", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    await optIntoSwap(game, "anchor");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "tt", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "vex", controller: P2, triggered: true }),
    ]);
    await resolveTop(game); // Vex
    expect(game.state("tt")).toMatchObject({ isStunned: true, location: "base" });
    expect(game.state("tt").keywords).toContain("NoMove");
    expect(game.chain().map((c) => c.cardId)).toEqual(["tt"]); // swap not resolved yet
    expect(game.locationOf("anchor")).toBe("bfA");
    await resolveTop(game); // Tideturner's trigger: it cannot move
    expect(game.chain()).toEqual([]);
    expect(game.state("tt")).toMatchObject({ isStunned: true, location: "base" }); // Tideturner did NOT move
    expect(game.locationOf("vex")).toBe("bfV");
  });

  // RULING-CONFLICT: riftjudge d9ca4518ff9946d3 says the partner still moves ("partial resolution"); riftjudge
  // b449100f59889211 on the SAME pair says "the swap fails … the effect is effectively cancelled". Two rulings disagree,
  // so the engine keeps one behaviour (all-or-nothing) rather than flipping: "Move me to its location and it to my
  // original location" is a single exchange whose two halves are defined in terms of each other — with Tideturner unable
  // to move there is no "my original location" to send the partner to, so 359.3.e.11 ("as much as possible") leaves
  // nothing to do. Green companion spec: rulings/vex-apathetic-b449100f59889211.test.ts.
  test("ruling d9ca4518ff9946d3 — the stunned Tideturner can't move, so the whole swap is cancelled and Anchor stays at bfA", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfV", { controller: P2 })
      .unit(P1, "bfA", { might: 3, name: "Anchor" }, "anchor")
      .unit(P2, "bfV", VEX, "vex")
      .resources(P1, { energy: 2 })
      .hand(P1, TIDETURNER, "tt")
      .build();
    await game.p1.play("tt", { to: "base" });
    await optIntoSwap(game, "anchor");
    await resolveTop(game); // Vex: stun
    await resolveTop(game); // Tideturner: partial swap
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("tt")).toBe("base");
    expect(game.state("tt").isStunned).toBe(true);
    expect(game.locationOf("anchor")).toBe("bfA"); // the partner's half is cancelled too
    expect(game.locationOf("vex")).toBe("bfV");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("NON-TURN PLAYER (P1) plays Tideturner from Hidden on P2's turn: chain top = [vex (P2, Turn Player — first) · tt (P1, on top)] → the swap COMPLETES (tt → base, Pal → bfA), and only then is Tideturner stunned where it now is", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfV", { controller: P2 })
      .unit(P1, "bfA", { might: 3, name: "Anchor" }, "anchor")
      .facedown(P1, "bfA", TIDETURNER, "tt")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .unit(P2, "bfV", VEX, "vex")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .resources(P2, { energy: 1 })
      .hand(P2, CLEAVE, "cleave")
      .build();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("cleave", { targets: "bystander" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "tt")).toBe(true);
    await game.p1.reveal("tt");
    expect(game.locationOf("tt")).toBe("bfA");
    await optIntoSwap(game, "pal"); // "another location" = P1's base
    expect(game.chain().map((c) => c.cardId).slice(-2)).toEqual(["vex", "tt"]); // Turn Player's trigger first, P1's on top
    await resolveTop(game); // Tideturner: full swap
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("pal")).toBe("bfA");
    expect(game.state("tt").isStunned).toBe(false);
    await resolveTop(game); // Vex: stun it in its new location
    expect(game.state("tt")).toMatchObject({ isStunned: true, location: "base" });
    expect(game.state("tt").keywords).toContain("NoMove");
    await game.settle(); // Cleave resolves
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("pal")).toBe("bfA");
    expect(game.locationOf("anchor")).toBe("bfA");
    expect(game.violations()).toEqual([]);
  });
});
