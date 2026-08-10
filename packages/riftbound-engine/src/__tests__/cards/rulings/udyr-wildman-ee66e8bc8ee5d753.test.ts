/**
 * Ruling ee66e8bc8ee5d753 — Udyr, Wildman (OGN-157 → ogn-157-298) · 6 Might "Spend my buff: Choose one you've not chosen this
 *     turn — Deal 2 to a unit at a battlefield. Stun a unit at a battlefield. Ready me. Give me [Ganking] this turn."
 *   × Wildclaw Shaman (OGN-147 → ogn-147-298) · 3 Might · [4] "When you play me, you may spend a buff to buff me and ready me."
 *   (× "Lee Sin buffs Udyr" — represented by Udyr simply starting buffed; the scrape's ven-089 guess is unrelated.)
 *
 * Q: Udyr is buffed. Can Udyr's ability (cost: spend HIS buff) be squeezed in after playing Wildclaw Shaman but before the
 *    Shaman's play effect takes the buff?
 * A: No. Udyr's ability is an activated ability at base speed (no Action/Reaction) — it can't be used between the Shaman
 *    being played and its effect happening, so the Shaman spends the buff. Conversely, if Udyr goes first the buff is gone
 *    and the Shaman has nothing to spend. ("Spend my buff" before the colon is a COST.)
 * Rules: 381/398 (activated ability timing — Open state, your turn), 130 (cost : effect), 383.3.b (the Shaman's optional
 *        "spend a buff to …" is a cost settled as its trigger is finalized).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UDYR_WILDMAN = "ogn-157-298";
const WILDCLAW_SHAMAN = "ogn-147-298";

/** P1's turn with exactly [4]. Udyr in base, BUFFED (7 Might) and exhausted (so "Ready me" is observable); Shaman in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P1, "base", UDYR_WILDMAN, "udyr", { buffed: true, exhausted: true })
    .hand(P1, WILDCLAW_SHAMAN, "shaman");
}

describe("Ruling ee66e8bc8ee5d753 — Udyr can't spend his buff in between; whoever goes first gets it", () => {
  test("premise: in the Open state Udyr's ability IS available (he has a buff to spend)", async () => {
    const game = await board().build();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, isExhausted: true, might: 7 });
    expect(game.p1.can("activate", "udyr")).toBe(true);
  });

  test("Shaman first: from the moment it is played until its ability has resolved, Udyr's base-speed ability is never legal; the Shaman's 'spend a buff' takes Udyr's buff, and the Shaman ends buffed (4) and ready", async () => {
    const game = await board().build();
    await game.p1.play("shaman");
    expect(game.p1.energy()).toBe(0);
    // The Shaman's optional costed trigger is put to P1 right away (finalization) — no window for Udyr before it.
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.p1.can("activate", "udyr")).toBe(false);
    await game.p1.yes(); // the only buff P1 controls is Udyr's → spent as the cost
    expect(game.state("udyr").isBuffed).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shaman", controller: P1, triggered: true })]);
    // Closed state with the Shaman item pending resolution: still no Udyr activation (base speed).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "udyr")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    await game.settle();
    expect(game.state("shaman")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
    // Back in the Open state — but the buff is gone, so Udyr has nothing to pay with any more.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isExhausted: true, might: 6 });
    expect(game.p1.can("activate", "udyr")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Udyr first: he spends his buff as the COST (choosing 'Ready me'); the Shaman played afterwards finds no buff to spend — no prompt, it enters unbuffed (3) and exhausted", async () => {
    const game = await board().build();
    await game.p1.activate("udyr");
    // Mode menu surfaced to P1.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.chooseMode(2); // "Ready me"
    expect(game.state("udyr").isBuffed).toBe(false); // paid on activation, before resolution
    await game.settle();
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isReady: true, might: 6 });

    await game.p1.play("shaman");
    // Nothing to spend → the optional ability is dropped without asking (402.4); the unit just enters.
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
