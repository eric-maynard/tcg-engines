/**
 * Ruling 44be0d05b01da626 — Startipped Peak (OGN-288 → ogn-288-298) · Battlefield
 *     "When you hold here, you may channel 1 rune exhausted."
 *
 * Q: For "you may" abilities like Startipped Peak, is the choice made when the ability triggers or when it resolves?
 * A (riftjudge): on resolution — the trigger always goes on the chain and the controller decides as it resolves; you
 *    cannot skip putting it on the chain.
 *
 * RULING-CONFLICT: riftjudge 44be0d05b01da626 says a leading "you may" is decided at RESOLUTION and the trigger is always
 * a chain item; CR 383.3.a / 383.3.a.1 / 383.3.a.2 (2026 CR — Tideturner example) say a Triggered Ability whose effect
 * STARTS with "you may" is decided during FINALIZATION, and if declined "it is removed from the chain and considered to
 * have not triggered". Engine follows CR (optional-kind model `may-at-finalization`, FIXER-PRIMER §2): the yes/no is a
 * FIN-timing prompt raised before anyone receives priority; YES keeps the item on the chain (opponent may then react,
 * and nothing further is asked at resolution — 383.3.a.1), NO removes it with no chain / no priority window at all.
 * Rules: 383.3.a–a.3, 469.2 (Hold), 430.2 (channel exhausted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STARTIPPED_PEAK = "ogn-288-298";
const STUPEFY = "ogn-095-298"; // P2's Reaction: "Give a unit -1 [Might] this turn… Draw 1."

/** End of P2's turn 2; P1 controls the live Peak with a Holder on it. P2 keeps a Reaction + resources to prove the window. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("peak", { controller: P1, def: STARTIPPED_PEAK, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "peak", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Their Holder" }, "theirs")
    .hand(P2, STUPEFY, "stupefy");
}

describe("Ruling 44be0d05b01da626 (rewritten to CR 383.3.a) — Startipped Peak's leading 'you may' is decided at FINALIZATION", () => {
  test("holding the Peak: 1 point, the trigger is being finalized under P1 and the 'you may' yes/no is asked NOW (timing FIN) — before either player has a priority window", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    // RULING-CONFLICT: riftjudge 44be0d05b01da626 says this choice waits for resolution; CR 383.3.a says finalization — engine follows CR.
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "peak" }, timing: "FIN" });
    expect(game.p2.decision()?.kind === "action").toBe(false); // P2 has not been given priority yet
  });

  test("YES: the item stays on the chain as a real chain item — P2 gets a Closed-state window (Reaction legal) — and on resolution the rune is channeled exhausted with NO second question (383.3.a.1)", async () => {
    const game = await board().build();
    const runes0 = game.p1.runes().length;
    await game.p2.endTurn();
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1 })]);
    // Walk priority by hand: P1 (controller) first, then P2 must get a window in which a Reaction is legal.
    if (game.decision()?.kind === "action" && game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.do("addResources", { energy: 1 }); // P2's pool emptied at its own end of turn (317); refill [1] for Stupefy
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.p2.passPriority();
    // Resolved: no further yes/no was asked; the extra rune is in the pool exhausted (Channel Phase adds 2 ready ones).
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(runes0 + 3);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("NO: the trigger is removed and 'considered to have not triggered' — the chain is empty at once, P2 never gets a reaction window off it, hold point kept, only the normal 2 runes", async () => {
    const game = await board().build();
    const runes0 = game.p1.runes().length;
    await game.p2.endTurn();
    // RULING-CONFLICT: riftjudge 44be0d05b01da626 says "you cannot skip putting the trigger on the chain"; CR 383.3.a.2 says a
    // declined leading-"may" trigger is removed from the chain — engine follows CR.
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("cast", "stupefy")).toBe(false); // no Closed state to react into (and not P2's turn)
    expect(game.p2.decision()?.kind === "action" && (game.p2.decision() as { context?: string }).context === "chain").toBe(false);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.p1.runes({ ready: false })).toEqual([]);
  });
});
