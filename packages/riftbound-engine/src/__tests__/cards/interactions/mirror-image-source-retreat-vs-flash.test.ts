/**
 * Interaction: Mirror Image (unl-200-219) · Spell · Mind/Order · [3]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that
 *      unit. Give it [Temporary]."
 *   × Retreat (ogn-104-298) · Spell · Mind · [1] · [Reaction]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Flash (ogs-011-024) · Spell · Chaos · [2] · [Reaction]
 *     "Move up to 2 friendly units to base."
 *
 * Question. P1 casts Mirror Image naming P2's 5-Might unit M at bf1 (a 9-Might Titan also stands
 * there, so a resolution-time re-pick would be visibly better for P1).
 *   (a) When is the copy SOURCE chosen — may the engine defer it to resolution?
 *   (b) NO side: P2 responds with Retreat, sending M to P2's hand. What resolves — is the whole
 *       spell fizzled, does P1 still get a token, and what are its name / Might / keywords?
 *   (c) YES side: P2 instead responds with Flash, moving M to P2's base. Does the copy still happen?
 *   (d) Does P1 keep the token in either branch, and is [Temporary] granted in both?
 *
 * Expected.
 *   (a) At FINALIZATION. "Choose a unit" names an object in a public board zone, so it is a target
 *       picked in step 2 of playing the spell (355.5, 355.7) and locked there (355.15); the
 *       finalized chain item publicly shows M. No resolution-time re-pick exists.
 *   (b) Retreat sends M to hand — a non-board zone — so M is an illegal target when Mirror Image
 *       resolves (359.3.e.2, 359.3.e.4). "Play a ready Reflection unit token to your base"
 *       references no target and still executes; "It becomes a copy of that unit" is a linked
 *       instruction whose referent is now null, so it is ignored (359.3.e.5, 359.3.e.12,
 *       359.3.e.14 / 359.3.e.14.a). P1 ends up with a ready 0-Might Reflection token in base that
 *       copies nothing, and it still gets [Temporary] (that instruction refers to the token, not to
 *       M). No new source may be chosen.
 *   (c) Yes: Mirror Image carries no location restriction, so a move to base leaves M a legal target
 *       (359.3.e.3) and the token becomes a full copy of M — printed traits and rules text only, no
 *       gear, buffs or granted keywords — plus [Temporary].
 *   (d) The token is played in both branches; the only difference is whether the copy instruction
 *       executes.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const RETREAT = "ogn-104-298";
const FLASH = "ogs-011-024";

/**
 * P1's turn, P1 holding Mirror Image. P2 holds both reactions and owns bf1 with the 5-Might
 * Marksman M ([Tank], buffed +2 so "printed only" is observable) plus a 9-Might Titan.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 2, order: 2 } })
    .resources(P2, { energy: 5, power: { chaos: 2, mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { keywords: ["Tank"], might: 5, name: "Marksman" }, "m", { buffed: true, mightModifier: 2 })
    .unit(P2, "bf1", { might: 9, name: "Titan" }, "big")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P2, RETREAT, "retreat")
    .hand(P2, FLASH, "flash");
}

/** The single Reflection token P1 owns (the harness ids it `token-reflection-N`). */
function token(game: Game): string {
  const ids = game.p1.units("base");
  expect(ids).toHaveLength(1);
  return ids[0]!;
}

/** Flatten the `targets` field of a cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Mirror Image × Retreat / Flash — when the copy source is locked and what survives it", () => {
  // ── (a) the source is a play-time target ──────────────────────────────────────────────────────

  test("(a) the copy source is a play-time TARGET: both board units are offered and one must be named as Mirror Image is played (355.5, 355.7)", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "p1", "mirror").sort()).toEqual(["big", "m"]);
    // A bare cast is not a legal submission — the target is chosen in step 2 of playing the spell.
    const bare = await game.p1.try((p) => p.cast("mirror"));
    expect(bare.ok).toBe(false);
  });

  test("(a) the finalized chain item publicly shows the named source, and the whole cost is paid at once (355.7)", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mirror", controller: P1, targets: ["m"], triggered: false })]);
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("mirror")).toBe("chain");
  });

  test("(a) the source is LOCKED (355.15): resolution asks nothing, so the bigger Titan cannot be swapped in — the token copies the named 5-Might M", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open"); // nothing was ever asked mid-resolution
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state(token(game))).toMatchObject({ baseMight: 5, name: "Marksman" });
  });

  // ── (b) NO side — Retreat pulls the source off the board ──────────────────────────────────────

  test("(b) Retreat resolves first and sends M to its owner's hand, leaving Mirror Image on the chain with a target in a non-board zone (359.3.e.2)", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "retreat")).toBe(true);
    await game.p2.cast("retreat", { targets: "m" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "mirror", controller: P1 }),
      expect.objectContaining({ cardId: "retreat", controller: P2 }),
    ]);
    await game.settle();
    expect(game.zoneOf("m")).toBe("hand");
    expect(game.locationOf("m")).toBeUndefined();
  });

  test("(b) Mirror Image is NOT fizzled: the token-less instruction still executes — P1 gets a ready Reflection token in base (359.3.e.12, 359.3.e.14)", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "m" });
    await game.settle();
    expect(game.state(token(game))).toMatchObject({ controller: P1, isReady: true, location: "base", name: "Reflection" });
    expect(game.zoneOf("mirror")).toBe("trash");
  });

  test("(b) the linked copy instruction is IGNORED — the token is a 0-Might Reflection with none of M's printed traits (359.3.e.5, 359.3.e.14.a)", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "m" });
    await game.settle();
    const state = game.state(token(game));
    expect(state.baseMight).toBe(0);
    expect(state.might).toBe(0);
    expect(state.name).toBe("Reflection");
    expect(state.keywords).not.toContain("Tank");
  });

  test("(b) [Temporary] still lands — that instruction refers to the token, not to M", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "m" });
    await game.settle();
    expect(game.state(token(game)).keywords).toContain("Temporary");
  });

  test("(b) NO new copy source may be chosen at resolution — the Titan is still on the board and is never offered", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "m" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.state(token(game)).name).not.toBe("Titan");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) YES side — Flash only moves the source ────────────────────────────────────────────────

  test("(c) Flash moves M to P2's base; M is still on the board, so Mirror Image's target stays legal (359.3.e.3)", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "m" });
    await game.settle();
    expect(game.zoneOf("m")).toBe("base");
    expect(game.locationOf("m")).toBe("base");
    expect(game.state(token(game))).toMatchObject({ baseMight: 5, might: 5, name: "Marksman" });
  });

  test("(c) the copy takes PRINTED traits and keywords only — [Tank] yes, M's buff and Might modifier no", async () => {
    const game = await board().build();
    expect(game.state("m")).toMatchObject({ isBuffed: true, might: 8 }); // 5 printed +2 modifier, buffed
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "m" });
    await game.settle();
    const state = game.state(token(game));
    expect(state.keywords).toContain("Tank");
    expect(state.isBuffed).toBe(false);
    expect(state.mightModifier).toBe(0);
    expect(state.might).toBe(5);
  });

  test("(c) [Temporary] is granted on top of the copy", async () => {
    const game = await board().build();
    await game.p1.cast("mirror", { targets: "m" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "m" });
    await game.settle();
    expect(game.state(token(game)).keywords).toEqual(expect.arrayContaining(["Tank", "Temporary"]));
    expect(game.violations()).toEqual([]);
  });

  // ── (d) both branches ─────────────────────────────────────────────────────────────────────────

  test("(d) P1 keeps exactly one Reflection token with [Temporary] in BOTH branches — only the copy instruction differs", async () => {
    const retreatGame = await board().build();
    await retreatGame.p1.cast("mirror", { targets: "m" });
    await retreatGame.p1.passPriority();
    await retreatGame.p2.cast("retreat", { targets: "m" });
    await retreatGame.settle();

    const flashGame = await board().build();
    await flashGame.p1.cast("mirror", { targets: "m" });
    await flashGame.p1.passPriority();
    await flashGame.p2.cast("flash", { targets: "m" });
    await flashGame.settle();

    for (const game of [retreatGame, flashGame]) {
      expect(game.p1.units("base")).toHaveLength(1);
      expect(game.state(token(game)).keywords).toContain("Temporary");
      expect(game.state(token(game)).controller).toBe(P1);
      expect(game.zoneOf("mirror")).toBe("trash");
    }
    expect(retreatGame.state(token(retreatGame)).might).toBe(0);
    expect(flashGame.state(token(flashGame)).might).toBe(5);
  });
});
