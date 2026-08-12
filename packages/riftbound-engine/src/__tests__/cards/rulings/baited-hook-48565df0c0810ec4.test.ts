/**
 * Ruling 48565df0c0810ec4 — Baited Hook (OGN-242 → ogn-242-298) · gear
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may
 *    banish a unit from among them that has Might up to 1 more than the killed unit and play it,
 *    ignoring its cost. Then recycle the rest."
 *   × Altar of Memories (sfd-169-221) — the "Altar" that triggers on the death: "When a friendly unit
 *     dies, you may exhaust me to draw 1, then put a card from your hand on the top or bottom of your Main Deck."
 *
 * Q: Can I stack the Altar trigger on top of Baited Hook so the Altar resolves first, mid-Hook?
 * A: No. The kill happens inside Baited Hook's resolution; the Altar trigger only becomes a PENDING item
 *    on the Chain and has to wait until Baited Hook has finished (look, play the unit, recycle the rest).
 *    The played unit even goes on the Chain on top of the waiting Altar trigger.
 * Rules: 320 / 401.1 (nothing is finalized or resolved while an item is resolving), 337.1 (pending items
 *        are finalized afterwards, oldest first), 339 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const ALTAR_OF_MEMORIES = "sfd-169-221";

const spell = (name: string) => ({ cardType: "spell", energyCost: 7, name });

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .gear(P1, ALTAR_OF_MEMORIES, "altar")
    .unit(P1, "base", { might: 2, name: "Bait" }, "bait")
    .hand(P1, spell("Junk"), "junk")
    .deck(
      P1,
      [{ cardType: "unit", might: 3, name: "Fish" }, spell("S1"), spell("S2"), spell("S3"), spell("S4")],
      ["fish", "s1", "s2", "s3", "s4"],
    );
}

const chainLabels = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

describe("Ruling 48565df0c0810ec4 — the Altar trigger waits for Baited Hook to finish resolving", () => {
  test("step by step: the kill happens mid-resolution, the Altar trigger only becomes pending, and the played unit lands on top of it", async () => {
    const game = await board().build();
    expect(game.state("hook").isReady).toBe(true);

    // 1. Activation: the victim is named now, the Hook goes on the Chain, nothing has died.
    await game.p1.activate("hook", 0, { answers: [] });
    expect(chainLabels(game)).toEqual(["hook"]);
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });

    // 2. Reaction window, then Baited Hook starts resolving.
    await game.p1.passPriority();
    await game.p2.passPriority();

    // 3. The bait is dead and the Altar has TRIGGERED — but only as a pending item; the Hook is still
    //    resolving (its look-at-5 prompt is open) and nothing of the Altar has happened.
    expect(game.zoneOf("bait")).toBe("trash");
    expect(chainLabels(game)).toEqual(["altar*"]);
    expect(game.state("altar").isExhausted).toBe(false);
    expect(game.p1.hand()).toEqual(["junk"]); // no draw yet
    expect(game.decision()).toMatchObject({
      kind: "pick",
      seat: P1,
      semantics: "from-revealed",
      source: { cardId: "hook" },
      timing: "RES",
    });

    // 4. Picking the unit puts IT on the Chain on top of the still-waiting Altar trigger.
    await game.p1.pick("fish");
    expect(chainLabels(game)).toEqual(["altar*", "fish"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "altar" }, timing: "FIN" });

    // 5. Altar is finalized, the unit enters, and only then does the Altar resolve.
    await game.p1.yes();
    expect(game.zoneOf("fish")).toBe("base"); // the unit resolved first
    expect(chainLabels(game)).toEqual(["altar*"]);
    expect(game.p1.hand()).toEqual(["junk"]); // still no draw

    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(2); // NOW the Altar drew
    await game.p1.pick("junk");
    await game.p1.pick("mainDeck-top");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()[0]).toBe("junk");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("declining the Altar leaves it ready and undrawn, while Baited Hook's own effects all happened", async () => {
    const game = await board().build();
    await game.p1.activate("hook", 0, { answers: [] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("fish");
    await game.p1.no();
    await game.settle();

    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.zoneOf("fish")).toBe("base");
    expect(game.state("altar").isExhausted).toBe(false);
    expect(game.p1.hand()).toEqual(["junk"]);
    // The other four looked-at cards were recycled, not left on top.
    expect(game.p1.deck().slice(0, 4)).not.toContain("s1");
  });

  // RULING-CONFLICT: riftjudge 48565df0c0810ec4 says the Altar "is only exhausted when it resolves, not
  // when it triggers"; CR 383.3.b + 204.3.a say a "you may [exhaust me] to …" trigger pays its base cost
  // at FINALIZATION — engine follows CR.
  test("the Altar is exhausted as its trigger finalizes, before it resolves", async () => {
    const game = await board().build();
    await game.p1.activate("hook", 0, { answers: [] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("fish");
    expect(game.state("altar").isExhausted).toBe(false);
    await game.p1.yes();
    expect(game.state("altar").isExhausted).toBe(true); // paid at FIN
    expect(chainLabels(game)).toEqual(["altar*"]); // still unresolved
    expect(game.p1.hand()).toEqual(["junk"]);
  });
});
