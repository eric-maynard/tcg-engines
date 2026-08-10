/**
 * Ruling ea159a6dd42c85b8 — Gangplank, Naval (VEN-181 → ven-181-166) · 6 Might · [6]
 *     "[Empower] [body][body]
 *      [Empowered] If a spell or ability that chooses me would stun me, give me -[Might], or return me to hand, give me
 *      +3 [Might] instead."
 *   (× Body Rune OGN-126 — just the [body] payment.)
 *
 * Q: How does Gangplank, Naval work?
 * A: Two pieces. (1) Empower: an activated ability costing [body][body]; usable only while NOT Empowered; the Empowered
 *    status persists until he leaves the board / is Disempowered. (2) While Empowered, a spell or ability that CHOOSES him
 *    and would stun him, give him -Might, or bounce him instead gives him +3 Might this turn (expires in the Expiration
 *    Step). An effect that doesn't choose him (e.g. "stun all units") is not replaced.
 * Rules: 827 (Empower; 827.1.c.1 not while Empowered), 366–372 (replacement effects), 317.2.c ("this turn" expiry).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GANGPLANK_NAVAL = "ven-181-166";
const RUNE_PRISON = "ogn-050-298"; // [2][calm] Action "Stun a unit."
const STUPEFY = "ogn-095-298"; // [1] Reaction "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
const REBUKE = "ogn-172-298"; // [2][chaos][chaos] Action "Return a unit at a battlefield to its owner's hand."
const THOUSAND_TAILED_WATCHER = "ogn-116-298"; // [7][mind] "When you play me, give enemy units -3 [Might] this turn (min 1)." — chooses nobody

/** P2's turn with lots of resources and the three "chooses him" spells + the Watcher; P1's Gangplank at bf1 (Empowered per flag). */
function p2Turn(empowered: boolean) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 20, power: { calm: 3, chaos: 3, mind: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GANGPLANK_NAVAL, "gp", empowered ? { empowered: true } : undefined)
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P2, RUNE_PRISON, "prison")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, REBUKE, "rebuke")
    .hand(P2, THOUSAND_TAILED_WATCHER, "watcher");
}

describe("Ruling ea159a6dd42c85b8 — how Gangplank, Naval works", () => {
  test("Empower: on P1's turn, paying exactly [body][body] Empowers him; once Empowered the ability is no longer available, and the status survives into later turns", async () => {
    const game = await scenario()
      .resources(P1, { power: { body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GANGPLANK_NAVAL, "gp")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .build();
    expect(game.state("gp")).toMatchObject({ isEmpowered: false, might: 6 });
    expect(game.p1.can("activate", "gp")).toBe(true);
    await game.p1.activate("gp");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("gp")).toMatchObject({ isEmpowered: true, might: 6 }); // Empowered itself gives no Might
    // Can't Empower again while Empowered — even with fresh [body][body].
    await game.p1.do("addResources", { power: { body: 2 } });
    expect(game.p1.can("activate", "gp")).toBe(false);
    // Still Empowered on P2's turn and on P1's next turn.
    await game.advanceTurn();
    expect(game.state("gp").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "gp")).toBe(false);
  });

  test("Empowered: a -Might spell that chooses him (Stupefy) becomes +3 instead (6 → 9); a stun that chooses him (Rune Prison) becomes +3 instead (→ 12, not stunned); a bounce that chooses him (Rebuke) becomes +3 instead (→ 15, still on bf1)", async () => {
    const game = await p2Turn(true).build();
    expect(game.state("gp")).toMatchObject({ isEmpowered: true, might: 6 });

    await game.p2.cast("stupefy", { targets: "gp" });
    await game.settle();
    expect(game.state("gp")).toMatchObject({ might: 9, mightModifier: 3 });

    await game.p2.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp")).toMatchObject({ isStunned: false, might: 12 });

    await game.p2.cast("rebuke", { targets: "gp" });
    await game.settle();
    expect(game.zoneOf("gp")).toBe("battlefield-bf1");
    expect(game.state("gp").might).toBe(15);
    expect(game.violations()).toEqual([]);
  });

  test("the +3 is 'this turn': it wears off in the Expiration Step (back to 6 next turn) while the Empowered status stays", async () => {
    const game = await p2Turn(true).build();
    await game.p2.cast("stupefy", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").might).toBe(9);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("gp")).toMatchObject({ isEmpowered: true, might: 6, mightModifier: 0 });
    expect(game.trace().expiration.some((p) => p.expired.some((e) => e.includes("gp")))).toBe(true);
  });

  test("control — NOT Empowered: the same Stupefy simply gives -1 (6 → 5)", async () => {
    const game = await p2Turn(false).build();
    await game.p2.cast("stupefy", { targets: "gp" });
    await game.settle();
    expect(game.state("gp")).toMatchObject({ isEmpowered: false, might: 5, mightModifier: -1 });
  });

  // Thousand-Tailed Watcher's "give enemy units -3 [Might]" does not CHOOSE Gangplank, so the replacement does not
  // apply — an Empowered 6-Might Gangplank drops to 3.
  test("ruling ea159a6dd42c85b8 — a NON-choosing -Might (Thousand-Tailed Watcher's 'enemy units -3') is not replaced", async () => {
    const game = await p2Turn(true).build();
    await game.p2.play("watcher");
    await game.settle();
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.state("gp")).toMatchObject({ isEmpowered: true, might: 3, mightModifier: -3 });
  });
});
