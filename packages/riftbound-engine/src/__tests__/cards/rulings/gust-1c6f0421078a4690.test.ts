/**
 * Ruling 1c6f0421078a4690 — Gust (OGN-169 → ogn-169-298) [Reaction] · 1 "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand."
 *   × Miss Fortune, Captain (ogn-162-298) "[Ganking] The first time I move each turn, you may ready something else that's
 *     exhausted."  (the ruling also name-drops Shield / a Master Yi legend passive — irrelevant to the timing answer)
 *
 * Q: Miss Fortune moves into an enemy Poro's battlefield. Can her controller Gust the Poro "in response to becoming a
 *    defender", using the rune her move trigger readies?
 * A: Becoming attacker/defender is not a trigger — there is nothing to respond to. But Miss Fortune's on-move trigger goes
 *    on the chain BEFORE combat begins, and Gust (a Reaction) can be played in that window on the Poro — paid with an
 *    ALREADY-ready rune; whatever her trigger would ready is still exhausted until the trigger resolves. Only after it
 *    resolves does combat begin and units gain attacker/defender designations.
 * Rules: 460 (combat begins at a Cleanup with an empty chain), 464.2.c (designations assigned as combat begins),
 *        383.4.e/f (only attack/defend TRIGGERS create chain items).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const MISS_FORTUNE_CAPTAIN = "ogn-162-298";

/**
 * P1's turn. P2 holds bf1 with a 2-Might Poro. P1: Miss Fortune (ready) + an exhausted Sleepy unit in base, one READY chaos
 * rune and one EXHAUSTED chaos rune, Gust in hand, empty pool.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MISS_FORTUNE_CAPTAIN, "mf")
    .unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true })
    .rune(P1, "chaos", { alias: "readyRune" })
    .rune(P1, "chaos", { alias: "spentRune", exhausted: true })
    .unit(P2, "bf1", { might: 2, name: "Poro" }, "poro")
    .hand(P1, GUST, "gust");
}

describe("Ruling 1c6f0421078a4690 — Gust in Miss Fortune's on-move trigger window, before combat designations exist", () => {
  test("Miss Fortune moves in: her on-move trigger is on the chain and combat has NOT begun — no showdown, nobody is an attacker/defender yet", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    if (game.decision()?.kind === "yes-no") {
      expect(game.decision()?.seat).toBe(P1);
      await game.p1.yes(); // "you may ready something else"
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sleepy");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mf", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("poro").combatRole).toBeNull();
    expect(game.state("mf").combatRole).toBeNull();
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
  });

  test("in that window the thing her trigger would ready is STILL exhausted (trigger unresolved) — only the already-ready rune can pay for Gust", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sleepy");
    }
    expect(game.state("sleepy").isExhausted).toBe(true);
    expect(game.state("spentRune").isExhausted).toBe(true);
    expect(game.p1.can("tapRune", "spentRune")).toBe(false);
    expect(game.p1.can("tapRune", "readyRune")).toBe(true);
    expect(game.p1.can("cast", "gust")).toBe(false); // no energy yet
    await game.p1.tapRune("readyRune");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "gust")).toBe(true);
  });

  test("P1 Gusts the Poro in response to the move trigger: Gust resolves first (Poro → P2's hand), then the trigger (Sleepy readies); Miss Fortune then stands alone at bf1 and conquers it", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sleepy");
    }
    await game.p1.tapRune("readyRune");
    await game.p1.cast("gust", { targets: "poro" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mf", "gust"]);
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.hand()).toContain("poro");
    expect(game.state("sleepy").isReady).toBe(true);
    expect(game.locationOf("mf")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — nobody responds: once the trigger resolves combat begins, Poro/Miss Fortune gain defender/attacker designations with an EMPTY chain (nothing to respond to); P1 simply has Focus", async () => {
    const game = await board().build();
    await game.p1.move("mf", "bf1");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sleepy");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("mf").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // Gust is still playable here (Reaction, P1 has Focus) — but that is acting in the showdown, not "responding to a designation".
    await game.p1.tapRune("readyRune");
    expect(game.p1.can("cast", "gust")).toBe(true);
  });
});
