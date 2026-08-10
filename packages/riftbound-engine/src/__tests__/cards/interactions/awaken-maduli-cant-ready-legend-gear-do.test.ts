/**
 * Interaction: Maduli the Gatekeeper (unl-144-219) "I can't be readied. [chaos]: Move me to an occupied
 *   enemy battlefield if my Might is greater than the total Might of enemy units there."
 *   × Keeper of the Hammer (unl-203-219, legend) "When you hold, gain 1 XP. Spend 3 XP, [Exhaust]: Draw 1."
 *   × Forgotten Signpost (unl-045-219, gear) "[Action][>] Exhaust a unit you control, [Exhaust]: Move a
 *     different unit you control to the location of the unit you exhausted…"
 *
 * Question: P1's turn starts with EVERYTHING exhausted — Maduli alone at bf1 (P1 controls bf1), a
 * vanilla unit + the Signpost in base, the Keeper legend (used last turn), both runes; P2 likewise has
 * an exhausted unit at bf2, an exhausted Gold token and an exhausted legend.
 *   (a) Awaken Phase: which objects ready? Maduli? Anything of P2's?
 *   (b) Scoring Step: Maduli is exhausted and P1's only unit at bf1 — does P1 still Hold, score, and
 *       fire the Keeper's "When you hold, gain 1 XP"?
 *   (c) Mirror: on P2's next Awaken P2's objects ready and P1's (incl. the Signpost P1 exhausted during
 *       its own turn) do not; Maduli never does.
 *
 * Rules: 315.1.b / 415.3.a (Awaken: the Turn Player readies ALL non-spell game objects THEY control
 * that are able to be readied — units, gear, runes, legend — as one task, no chain), 054.1 (can't
 * beats can: Maduli's static prohibition wins), 190.4.a + 469.2 (Hold only needs control = a unit
 * present; readiness is irrelevant), 315.2.b.2 / 471.1 (score 1 point), 383.4.d.2.b + 471.2.b (the
 * legend's Hold ability triggers as a chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MADULI = "unl-144-219";
const KEEPER = "unl-203-219";
const SIGNPOST = "unl-045-219";
const GOLD = "sfd-t03"; // Gold gear token

const P1_READYABLE = ["keeper", "grunt", "signpost", "r1", "r2"] as const;
const P2_OBJECTS = ["p2legend", "foe", "gold", "p2rune"] as const;

/** P2 is about to end turn 2; every permanent / rune / legend on both sides is exhausted. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .card("keeper", { def: KEEPER, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    .card("p2legend", { def: KEEPER, meta: { exhausted: true }, owner: P2, zone: "legendZone" })
    .unit(P1, "bf1", MADULI, "maduli", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt", { exhausted: true })
    .gear(P1, SIGNPOST, "signpost", { exhausted: true })
    .rune(P1, "chaos", { alias: "r1", exhausted: true })
    .rune(P1, "calm", { alias: "r2", exhausted: true })
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe", { exhausted: true })
    .gear(P2, GOLD, "gold", { exhausted: true })
    .rune(P2, "body", { alias: "p2rune", exhausted: true });
}

describe("Awaken × Maduli 'can't be readied' × exhausted legend / gear / runes", () => {
  test("precondition: everything on both sides starts exhausted, Maduli is P1's only unit at bf1", async () => {
    const game = await board().build();
    for (const id of ["maduli", ...P1_READYABLE, ...P2_OBJECTS]) {
      expect(game.state(id).isExhausted).toBe(true);
    }
    expect(game.p1.units("bf1")).toEqual(["maduli"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(a) Awaken readies P1's legend, gear, both runes and base unit in one task — already done when the Beginning Phase opens, before any chain item resolves (315.1.b, 415.3.a)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning"); // Awaken is behind us, the Hold trigger is still pending
    for (const id of P1_READYABLE) {
      expect(game.state(id).isReady).toBe(true);
    }
    // No Awaken item ever hit the chain — the only thing there is the Keeper's Hold trigger.
    expect(game.chain().every((i) => i.cardId === "keeper" && i.triggered)).toBe(true);
  });

  test("(a) Maduli's static 'I can't be readied' beats the Awaken ready-all (054.1): it stays exhausted", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.state("maduli").isExhausted).toBe(true);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("maduli").isExhausted).toBe(true);
    expect(game.state("maduli").keywords).toContain("CantReady");
  });

  test("(a) nothing P2 controls is touched by P1's Awaken — P2's unit, Gold token, legend and rune stay exhausted", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    for (const id of P2_OBJECTS) {
      expect(game.state(id).isExhausted).toBe(true);
    }
  });

  test("(b) an exhausted lone Maduli still Holds bf1: one Keeper trigger on the chain, then +1 point and +1 XP (469.2, 190.4.a, 471.2.b)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "keeper", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1); // the Hold point is banked (471.1); the XP waits for the trigger to resolve
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("maduli").isExhausted).toBe(true); // holding did not need (or cause) a ready
    expect(game.violations()).toEqual([]);
  });

  test("(c) mirror: P1 exhausts the Signpost (+ Grunt as its cost) and a rune on its own turn; on P2's Awaken only P2's objects ready — P1's stay exhausted, Maduli never readies", async () => {
    const game = await board().build();
    await game.advanceTurn(); // → P1 main (held, +1 XP)
    expect(game.turnPlayer()).toBe(P1);
    // Signpost: exhaust Grunt (cost) + exhaust itself → move Maduli to Grunt's location (base).
    await game.p1.activate("signpost", 0, { targets: "maduli" });
    expect(game.state("signpost").isExhausted).toBe(true);
    await game.settle({ policy: "first" });
    expect(game.state("grunt").isExhausted).toBe(true);
    await game.p1.tapRune("r1");
    expect(game.state("r1").isExhausted).toBe(true);

    await game.advanceTurn({ policy: "first" }); // → P2's turn: P2's Awaken
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    for (const id of P2_OBJECTS) {
      expect(game.state(id).isReady).toBe(true);
    }
    expect(game.state("signpost").isExhausted).toBe(true);
    expect(game.state("grunt").isExhausted).toBe(true);
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.state("r2").isReady).toBe(true); // untouched since P1's Awaken
    expect(game.state("maduli").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
