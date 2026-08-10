/**
 * Ruling c0f9018419f58c51 — Bottled Constellation (VEN-067 → ven-067-166, Gear) "At the start of your Main Phase, you may kill 3 other
 *     friendly units and/or gear to score 1 point."
 *   × Patched Porobot (VEN-058 → ven-058-166) · 2 Might Mech (unit that is also gear per rule 178) · (Swain, Visionary ven-173-166 is
 *     cited only as the contrasting "existence check".)
 *
 * Q: Can Patched Porobot count as 2 of the 3 kills Bottled Constellation needs?
 * A: No. The cost is a QUANTITY of game objects — 3 other friendly units and/or gear. Porobot is one object (even with two types), so it
 *    is a valid choice but satisfies only one of the three; you still need 2 more. "Other" also excludes the Constellation itself.
 * Rules: 178 (one object, several types), 383.3.b / 404 (cost of three objects, all-or-nothing), "other" excludes the source.
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOTTLED_CONSTELLATION = "ven-067-166";
const PATCHED_POROBOT = "ven-058-166";
const ORB = "ogn-090-298"; // Orb of Regret — a plain 1-cost gear

/** End of P2's turn 2. P1: Bottled Constellation + Patched Porobot + `orbs` Orbs in base. */
function board(orbs: 1 | 2) {
  const s = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .gear(P1, BOTTLED_CONSTELLATION, "bottle")
    .unit(P1, "base", PATCHED_POROBOT, "poro")
    .gear(P1, ORB, "orb1")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs");
  return orbs === 2 ? s.gear(P1, ORB, "orb2") : s;
}

describe("Ruling c0f9018419f58c51 — Patched Porobot is ONE of Bottled Constellation's three kills, never two", () => {
  test("Porobot + ONE Orb = only 2 other objects: the Constellation's cost can't be paid — P1 can never accept, nothing dies, no point", async () => {
    const game = await board(1).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        expect(d.seat).toBe(P1);
        expect(d.canAccept).toBe(false); // Porobot does not count double
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
        await game.p1.no();
      } else if (d.kind === "pick") {
        // Should never get here — but if a pick were offered, Porobot must appear once, not twice.
        expect(d.options.filter((o) => (o.card ?? o.key) === "poro")).toHaveLength(1);
        break;
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.zoneOf("orb1")).toBe("base");
    expect(game.zoneOf("bottle")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Porobot + TWO Orbs = 3 others: P1 may opt in; the chooser lists Porobot exactly ONCE alongside orb1/orb2 (and never the Constellation itself), and all three must be named", async () => {
    const game = await board(2).build();
    await game.p2.endTurn();
    let pick: PickDecision | undefined;
    for (let i = 0; i < 10 && !pick; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        pick = d;
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        expect(d.canAccept).not.toBe(false);
        await game.p1.yes();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(pick).toBeDefined();
    expect(pick!.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["orb1", "orb2", "poro"]);
    expect(pick!.max).toBe(3);
  });

  test("paying with Porobot + orb1 + orb2 kills exactly those three and scores 1; the Constellation survives", async () => {
    const game = await board(2).build();
    await game.p2.endTurn();
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1) {
        const offered = d.options.map((o) => o.card ?? o.key);
        const take = ["poro", "orb1", "orb2"].filter((v) => offered.includes(v)).slice(0, d.max);
        await game.p1.pick(...take);
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("orb1")).toBe("trash");
    expect(game.zoneOf("orb2")).toBe("trash");
    expect(game.zoneOf("bottle")).toBe("base");
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
