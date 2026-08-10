/**
 * Ruling fff9558f67286f63 — Sacrifice (UNL-173 → unl-173-219) · Spell · Order · 1 · [Reaction]
 *   "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Defy (OGN-045 → ogn-045-298) · Spell · Calm · 1+[calm] · [Reaction] "Counter a spell that costs no more than [4] …"
 *
 * Q: If the opponent counters Sacrifice with Defy, is the friendly unit still killed?
 * A: Yes. The kill is an additional COST, paid before Sacrifice is finalized on the chain; by the time Defy can even be
 *    played the unit is already in the trash. Countering refunds no costs (425.1.c): the unit stays dead, Sacrifice is
 *    countered (no draw, no channel).
 * Rules: 357 (costs paid during play), 425.1.c (no refund on counter), 356.2 (additional costs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const DEFY = "ogn-045-298";

/** P1's turn. P1: a 5-Might (Mighty) Brute in base, Sacrifice + 1 energy. P2: Defy + 1 energy + 1 calm. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 2, name: "Runt" }, "runt")
    .hand(P1, SACRIFICE, "sac")
    .hand(P2, DEFY, "defy");
}

describe("Ruling fff9558f67286f63 — Sacrifice's cost-kill is paid before Defy can counter it", () => {
  test("playing Sacrifice kills the Mighty unit AT ONCE as a cost — it is in the trash while Sacrifice sits on the chain, before P2 has even acted", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "brute" });
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("sac")).toBe("chain");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sac"]);
    expect(game.p1.energy()).toBe(0);
    // Only now does P2 get priority to respond.
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(game.zoneOf("brute")).toBe("trash");
  });

  test("Defy counters Sacrifice: no draw, no channel, nothing refunded — and the Brute stays in the trash", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length; // includes sac
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("sac", { sacrifice: "brute" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "sac" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("sac")).toBe("trash"); // countered → trash
    expect(game.zoneOf("brute")).toBe("trash"); // cost not refunded (425.1.c)
    expect(game.p1.energy()).toBe(0); // energy not refunded either
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // no Draw 2
    expect(game.p1.runes()).toHaveLength(runesBefore); // no channel
    expect(game.zoneOf("runt")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — uncountered, Sacrifice resolves: Brute dead, P1 draws 2 and channels 1 rune exhausted", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("sac", { sacrifice: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });
});
