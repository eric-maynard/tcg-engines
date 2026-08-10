/**
 * Ruling 52a3351a9d22bd90 — Switcheroo (SFD-145 → sfd-145-221) · [Hidden] Action · [2][chaos][chaos]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Ember Monk (OGN-167 → ogn-167-298) · 4 Might · "When you play a card from [Hidden], give me +2 [Might] this turn."
 *
 * Q: Can I play Switcheroo from Hidden with only Ember Monk at that battlefield? Would Ember Monk's ability still proc?
 * A: No and no. Switcheroo needs two units at the same battlefield (from Hidden: at THAT battlefield); with one unit there is
 *    no legal pair of targets, so it cannot be played at all — and since no card is played from Hidden, Ember Monk's trigger
 *    condition is never met.
 * Rules: 358.1 / 355 (all targets must be legal to play), 811.1.d / 811.1.d.2 (hidden: targets at that battlefield; a spell
 *        with no valid targets there can't be played from Hidden), 383 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const EMBER_MONK = "ogn-167-298";

/** P1's turn. P1 controls bf1 with Ember Monk alone and Switcheroo facedown there (hidden on an earlier turn). */
function lonelyMonk() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EMBER_MONK, "monk")
    .facedown(P1, "bf1", SWITCHEROO, "sw");
}

describe("Ruling 52a3351a9d22bd90 — hidden Switcheroo with only Ember Monk there: unplayable, and the Monk gets nothing", () => {
  test("with a single unit at bf1 the facedown Switcheroo has no legal pair of targets: revealing/playing it is not a legal action, and forcing it is refused", async () => {
    const game = await lonelyMonk().build();
    expect(game.zoneOf("sw")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "sw")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "sw")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("sw", { answers: ["monk", "monk"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sw")).toBe("facedown-bf1"); // still hidden
    expect(game.chain()).toEqual([]);
  });

  test("…so nothing was 'played from Hidden': Ember Monk's trigger never fires — it stays at 4 Might with no chain item", async () => {
    const game = await lonelyMonk().build();
    await game.p1.try((p) => p.reveal("sw", { answers: ["monk", "monk"] }));
    expect(game.state("monk")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.chain().some((c) => c.cardId === "monk")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a second unit at bf1 (an enemy Brute 7) makes it legal: revealed for [0], Switcheroo swaps Monk ↔ Brute and the Monk's 'played from Hidden' trigger adds +2 on top", async () => {
    const game = await lonelyMonk().unit(P2, "bf1", { might: 7, name: "Brute" }, "brute").build();
    expect(game.p1.can("reveal", "sw")).toBe(true);
    expect(game.p1.energy()).toBe(0); // played from facedown ignoring its cost
    await game.p1.reveal("sw", { answers: ["monk", "brute"] });
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.some((o) => o.key === "monk") && !game.chain().some((c) => c.targets?.includes("monk")) ? "monk" : "brute");
      } else {
        break;
      }
    }
    expect(game.chain().some((c) => c.cardId === "sw")).toBe(true);
    await game.settle();
    expect(game.zoneOf("sw")).toBe("trash");
    // Swap: Monk 4 ↔ Brute 7 → Monk +3, Brute −3; and Ember Monk's own trigger: +2 this turn.
    expect(game.state("brute").might).toBe(4);
    expect(game.state("monk").might).toBe(4 + 3 + 2);
    expect(game.violations()).toEqual([]);
  });
});
