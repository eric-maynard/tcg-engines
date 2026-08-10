/**
 * Ruling 479d56955e72d492 — Defy (OGN-045 → ogn-045-298) · [Reaction] "Counter a spell that costs no more than [4]
 *   and no more than [rainbow]."
 *   × Virtuoso (UNL-181 → unl-181-219, Jhin legend): "When you play a spell, if you spent [4] or more, you may banish
 *   it. Then, if there are four spells banished with me, …"
 *   × Jhin, Meticulous Killer (UNL-089 → unl-089-219): "If you've spent [4] or more to play a spell this turn, you may
 *   play me for [mind]."   (+ Disintegrate ogn-005-298 as the 4-cost spell.)
 *
 * Q: I play a 4-cost spell and my opponent Defies it — does it still count for Virtuoso, can I banish it?
 * A: No. A countered spell is not "played" for play-triggers (425.1.b), so Virtuoso does not trigger; and the spell is
 *    cleared to the trash (425.1.a), so it could not be banished anyway. The energy nevertheless stays "spent" (no
 *    refund, 425.1.c) — e.g. Jhin, Meticulous Killer's alternative cost is still unlocked.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const VIRTUOSO = "unl-181-219";
const JHIN_KILLER = "unl-089-219";
const DISINTEGRATE = "ogn-005-298"; // 4, [Action] Deal 3 to a unit at a battlefield…

/**
 * P1's turn. P1: legend Virtuoso, hand Disintegrate + Jhin, exactly [4] + 1 mind (the mind is Jhin's alt cost, not
 * spent on the spell). P2: bf1 with a 5-might X, hand Defy with exactly [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P1, VIRTUOSO, "virtuoso")
    .unit(P2, "bf1", { might: 5, name: "Target X" }, "X")
    .hand(P1, DISINTEGRATE, "dis")
    .hand(P1, JHIN_KILLER, "jhin")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 479d56955e72d492 — a Defied spell never counts as 'played' for Virtuoso", () => {
  test("contrast: unopposed, the 4-cost spell IS played — Virtuoso offers 'you may banish it' and accepting banishes Disintegrate", async () => {
    const game = await board().build();
    await game.p1.cast("dis", { targets: "X" });
    expect(game.p1.energy()).toBe(0);
    // Drive to Virtuoso's opt-in (whenever the engine raises it) and accept it.
    let offered = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        expect(d.source?.cardId).toBe("virtuoso");
        offered = true;
        await game.p1.yes();
        continue;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
        continue;
      }
      break;
    }
    expect(offered).toBe(true);
    await game.settle();
    expect(game.state("X").damage).toBe(3);
    expect(game.zoneOf("dis")).toBe("banishment");
  });

  test("P2 Defies it: Defy resolves first, Disintegrate is countered to the TRASH doing nothing, and Virtuoso never triggers (no banish offer at any point)", async () => {
    const game = await board().build();
    await game.p1.cast("dis", { targets: "X" });
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 }); // no Virtuoso prompt yet
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "dis" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dis", "defy"]);
    // Resolve the whole chain, watching for any Virtuoso opt-in — there must be none.
    let virtuosoAsked = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        virtuosoAsked = true;
        await game.p1.no();
        continue;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
        continue;
      }
      break;
    }
    expect(virtuosoAsked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dis")).toBe("trash"); // 425.1.a.1 — cleared to trash, not banished
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("X").damage).toBe(0); // countered: did nothing
    expect(game.p1.energy()).toBe(0); // 425.1.c — no refund
  });

  test("…yet the [4] still counts as SPENT this turn: Jhin, Meticulous Killer becomes playable for just [mind]", async () => {
    const game = await board().build();
    await game.p1.cast("dis", { targets: "X" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "dis" });
    await game.settle();
    expect(game.zoneOf("dis")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("play", "jhin")).toBe(true);
    await game.p1.play("jhin", { to: "base", params: { altCost: true } });
    await game.settle({ policy: "first" }); // Vision look — any answer
    expect(game.zoneOf("jhin")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // paid [mind] only, with 0 energy
  });
});
