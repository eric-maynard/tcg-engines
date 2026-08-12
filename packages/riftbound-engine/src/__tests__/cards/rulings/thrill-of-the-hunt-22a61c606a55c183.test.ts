/**
 * Ruling 22a61c606a55c183 — Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction · 2 + [rainbow]
 *   "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Q: A unit of mine has +2 [Might] from a spell. If I Thrill of the Hunt it onto a battlefield, does
 *    it keep the +2?
 * A: No. Banishing takes the unit off the board, which ends every effect attached to that object;
 *    what comes back is a brand-new object with only its printed Might (plus whatever permanently
 *    modifies it, such as attached gear). Marked damage is gone for the same reason.
 * Rules: 705 (an object leaving a zone becomes a new object; effects on the old one end),
 *        359.3.f (a returned card is a new game object), 356.1.b ("ignoring its cost").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const THRILL_OF_THE_HUNT = "unl-184-219";
const SPINNING_AXE = "sfd-186-221"; // Equipment, +3 Might — a PERMANENT modifier, not a spell buff

/** [Reaction] "Give a unit +2 [Might] this turn." */
const NUDGE = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Nudge",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

/** P1's turn. A 3-Might Brave in P1's base, a Nudge and Thrill of the Hunt in hand, two battlefields to land on. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Brave" }, "brave", { damage: 1 })
    .hand(P1, NUDGE, "nudge")
    .hand(P1, THRILL_OF_THE_HUNT, "thrill");
}

describe("Ruling 22a61c606a55c183 — a unit Thrilled onto a battlefield comes back without its +2 Might", () => {
  test("premise: the Nudge really does put the Brave on 5 Might (3 + 2) this turn", async () => {
    const game = await board().build();
    await game.p1.cast("nudge", { targets: "brave" });
    await game.settle();
    expect(game.state("brave")).toMatchObject({ baseMight: 3, might: 5, mightModifier: 2 });
  });

  test("ruling: Thrill of the Hunt banishes and replays the Brave — it lands at the chosen battlefield on its printed 3 Might with the +2 gone", async () => {
    const game = await board().build();
    await game.p1.cast("nudge", { targets: "brave" });
    await game.settle();
    expect(game.state("brave").might).toBe(5);
    await game.p1.cast("thrill", { targets: "brave" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual([
      "battlefield-bf1",
      "battlefield-bf2",
    ]);
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("brave")).toBe("bf1");
    expect(game.state("brave")).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0 });
    expect(game.state("brave").damage).toBe(0); // marked damage did not survive the trip either
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // the replay itself was free
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a PERMANENT modifier is not a buff — the Brave keeps a +2 that comes from being buffed only until it leaves, but attached gear re-attaches nothing", async () => {
    const game = await board().gear(P1, SPINNING_AXE, "axe").build();
    // The Axe sits unattached in base, so the Brave is a plain 3; nothing about the trip changes that.
    await game.p1.cast("thrill", { targets: "brave" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    expect(game.locationOf("brave")).toBe("bf2");
    expect(game.state("brave")).toMatchObject({ attachments: [], might: 3, mightModifier: 0 });
  });

  test("the +2 is gone for good: it does not come back later in the same turn", async () => {
    const game = await board().build();
    await game.p1.cast("nudge", { targets: "brave" });
    await game.settle();
    await game.p1.cast("thrill", { targets: "brave" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.state("brave").might).toBe(3);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("nudge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
