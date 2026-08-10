/**
 * Ruling b449100f59889211 — Vex, Apathetic (UNL-150 → unl-150-219) × Tideturner (OGN-199 → ogn-199-298)
 *   Vex (4 Might): "[Deflect] … When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it
 *   this turn."   Tideturner (2, [Hidden]): "When you play me, you may choose a unit you control at another location.
 *   Move me to its location and it to my original location."
 *
 * Q: With Vex at a battlefield, can the opponent's Tideturner still swap, or does it come in stunned and unable to move?
 * A: Both are triggered abilities that trigger together; the Turn Player's goes on the chain first (so resolves LAST).
 *    1) Tideturner's player IS the Turn Player → Vex's trigger is on top, resolves first: Tideturner is stunned and can't
 *       move, so its swap then fails.  2) Tideturner's player is NOT the Turn Player → Tideturner's trigger is on top:
 *       the swap completes, then Vex stuns Tideturner at its new location.
 * Rules: 303.2.a / 383.3.d.1 (simultaneous triggers in turn order), 336–340 (LIFO), 423 (Stun), 811 (Hidden play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const TIDETURNER = "ogn-199-298";
const CLEAVE = "ogn-004-298"; // 1-cost [Action] spell — P2 uses it only to open a chain on P2's turn

/**
 * P2's Vex holds bfV. P1 ("the opponent" of Vex's controller) holds bfA with Anchor (3) and will play Tideturner.
 * P1 has exactly Tideturner's 2 energy.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfV", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Anchor" }, "anchor")
    .unit(P2, "bfV", VEX, "vex")
    .resources(P1, { energy: 2 })
    .hand(P1, TIDETURNER, "tt");
}

/** Tideturner's "you may choose a unit you control at another location" — P1's decision; opt in and name Anchor. */
async function optIntoSwapWithAnchor(game: Game): Promise<void> {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("anchor");
  }
}

async function resolveTop(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling b449100f59889211 — Tideturner into an on-battlefield Vex: the Turn Player decides whether the swap lands", () => {
  /** Case 1 up to the point where both triggers have resolved. */
  async function turnPlayerPlaysTideturner(): Promise<Game> {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.play("tt", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("tt")).toBe("base");
    await optIntoSwapWithAnchor(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "tt", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "vex", controller: P2, triggered: true }),
    ]);
    await resolveTop(game); // Vex's trigger
    expect(game.state("tt")).toMatchObject({ isStunned: true, location: "base" });
    expect(game.state("tt").keywords).toContain("NoMove");
    expect(game.chain().map((c) => c.cardId)).toEqual(["tt"]);
    await resolveTop(game); // Tideturner's trigger — it can't move
    expect(game.chain()).toEqual([]);
    return game;
  }

  test("1) P1 plays Tideturner (from hand, to base) on P1's OWN turn: chain = [tt (P1) below, vex (P2) on top] → Vex resolves first (stun + can't move), then Tideturner's trigger cannot move it — it stays in base, stunned", async () => {
    const game = await turnPlayerPlaysTideturner();
    expect(game.locationOf("tt")).toBe("base");
    expect(game.state("tt").isStunned).toBe(true);
    expect(game.locationOf("vex")).toBe("bfV");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected (the ruling: "the swap fails … the effect is effectively cancelled"): with Tideturner unable to move there is
  // no exchange of locations at all, so the chosen partner (Anchor) also stays where it was, at bfA.
  // Actual: the engine still performs the partner's half of the swap and pulls Anchor back to base next to Tideturner.
  test("ruling b449100f59889211 — 1) when the stunned Tideturner can't move the whole swap should be cancelled, but the engine still moves the partner (Anchor) to Tideturner's location", async () => {
    const game = await turnPlayerPlaysTideturner();
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("anchor")).toBe("bfA");
  });

  test("2) P1 plays Tideturner from HIDDEN (at bfA) as a Reaction on P2's turn: chain = [vex (P2, Turn Player) below, tt (P1) on top] → the swap completes (tt → base, Pal → bfA), THEN Vex stuns Tideturner in its new location", async () => {
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
    // P2 opens a chain on P2's turn; P1 answers by playing the hidden Tideturner for [0].
    await game.p2.cast("cleave", { targets: "bystander" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "tt")).toBe(true);
    await game.p1.reveal("tt");
    expect(game.locationOf("tt")).toBe("bfA"); // played "here"
    // opt in; "another location" = P1's base (Pal)
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("pal");
    }
    const items = game.chain().map((c) => c.cardId);
    expect(items.slice(-2)).toEqual(["vex", "tt"]); // Turn Player's (P2's) trigger placed first, P1's on top
    await resolveTop(game); // Tideturner's trigger: swap
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("pal")).toBe("bfA");
    expect(game.state("tt").isStunned).toBe(false);
    await resolveTop(game); // Vex: stun Tideturner where it now is
    expect(game.state("tt")).toMatchObject({ isStunned: true, location: "base" });
    expect(game.state("tt").keywords).toContain("NoMove");
    await game.settle(); // Cleave resolves, back to P2's main phase
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("pal")).toBe("bfA");
    expect(game.violations()).toEqual([]);
  });
});
