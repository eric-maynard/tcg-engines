/**
 * Ruling f7853a53004e1f84 — Harnessed Dragon (OGN-234 → ogn-234-298) · Unit · Order · 6 Might · [8][order][order]
 *   "When you play me, kill an enemy unit."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · [Hidden]
 *     "When you play me, you may choose a unit you control at another location. Move me to its location and
 *      it to my original location."
 *
 * Q: Harnessed Dragon's trigger targets a unit at battlefield A and the opponent then swaps that unit to
 *    battlefield B with Tideturner. Does the Dragon kill Tideturner or the originally chosen unit?
 * A: The originally chosen unit. The target is locked in when the trigger is finalized; the swap moves the
 *    chosen unit around but does not change WHICH object was chosen, and it is still a legal target when
 *    the trigger resolves.
 * Rules: 402.2 (a trigger's targets are chosen at finalization), 359.3.e.5 (targets are re-checked, never
 *        re-aimed, at resolution), 450 (a move does not make an object a new object).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HARNESSED_DRAGON = "ogn-234-298";
const TIDETURNER = "ogn-199-298";

/**
 * P1's turn with the Dragon in hand and [8][order][order] available. P2 has a 3-Might Victim at bf1 and a
 * hidden Tideturner at bf2 ready to react.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf2", { might: 1, name: "Anchor" }, "anchor")
    .facedown(P2, "bf2", TIDETURNER, "tide")
    .hand(P1, HARNESSED_DRAGON, "dragon");
}

describe("Ruling f7853a53004e1f84 — the Dragon kills the unit it originally chose, wherever the swap leaves it", () => {
  test("premise: playing the Dragon locks its kill onto the chosen Victim at bf1 before anyone can respond", async () => {
    const game = await board().build();
    await game.p1.play("dragon", { to: "base", answers: ["victim"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", targets: ["victim"], triggered: true })]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
  });

  test("ruling: P2 reveals Tideturner and swaps the Victim away — the Dragon still kills the VICTIM, and Tideturner lives", async () => {
    const game = await board().build();
    await game.p1.play("dragon", { to: "base", answers: ["victim"] });
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "tide")).toBe(true);
    await game.p2.reveal("tide");
    // Tideturner's own "you may swap" trigger: take it, naming the Victim at the other location.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d) break;
      if (d.kind === "yes-no" && d.seat === P2) await game.p2.yes();
      else if (d.kind === "pick" && d.seat === P2) {
        const victim = d.options.find((o) => o.card === "victim");
        if (!victim) break;
        await game.p2.pick(victim.key);
      } else break;
    }
    // Let everything resolve.
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "action") await game.seat(d.seat).passPriority();
      else break;
    }
    await game.settle();
    expect(game.locationOf("tide")).toBe("bf1"); // the swap really happened
    expect(game.zoneOf("victim")).toBe("trash"); // …and the Dragon killed its original choice
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("control: with no interference the Dragon simply kills the chosen Victim at bf1", async () => {
    const game = await board().build();
    await game.p1.play("dragon", { to: "base", answers: ["victim"] });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("anchor")).toBe("battlefield-bf2");
  });

  test("control: naming the OTHER enemy unit kills that one instead — the choice is what matters", async () => {
    const game = await board().build();
    await game.p1.play("dragon", { to: "base", answers: ["anchor"] });
    await game.settle();
    expect(game.zoneOf("anchor")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
