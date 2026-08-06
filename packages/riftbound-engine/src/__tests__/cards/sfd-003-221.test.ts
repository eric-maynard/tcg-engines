/**
 * Blood Rush — sfd-003-221 · Spell · Fury · 1 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   [Repeat] [1] (You may pay the additional cost to repeat this spell's effect.)
 *   Give a unit [Assault 2] this turn. (+2 [Might] while it's an attacker.)
 *
 * Rules: 820 (Repeat: optional additional cost paid as you play; the instructions execute
 * one additional time on resolution; the spell is still played once), 807.2 (multiple
 * Assault grants sum), 807.1.c (Assault only counts while attacking), 806 (Action timing).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-003-221";

function board(energy: number, defenderMight = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: defenderMight, name: "Foe" }, "foe")
    .hand(P1, CARD, "br");
}

describe("Blood Rush (sfd-003-221)", () => {
  test("costs 1 energy; gives the chosen unit Assault 2 this turn; any unit is a legal target; goes to trash", async () => {
    const game = await board(1).build();
    const targets = game.p1.option("cast", "br")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    await game.p1.cast("br", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(game.state("ally").might).toBe(2); // Assault does nothing at rest
    expect(game.zoneOf("br")).toBe("trash");
    const broke = await board(0).build();
    expect(broke.p1.can("cast", "br")).toBe(false);
  });

  test("Assault 2 while attacking: the 2-Might unit kills a 4-Might defender", async () => {
    const game = await board(1, 4).build();
    await game.p1.cast("br", { targets: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 2 + 2 = 4 ≥ 4
  });

  test("'this turn': the granted Assault expires at end of turn", async () => {
    const game = await board(1).build();
    await game.p1.cast("br", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("ally").grantedKeywords).toEqual([]);
    expect(game.state("ally").keywords).not.toContain("Assault");
  });

  test("[Repeat] [1]: paying 1 more executes the effect twice — Assault sums to 4 (rule 807.2), enough to kill a 6-Might defender", async () => {
    const game = await board(2, 6).build();
    await game.p1.cast("br", { repeat: 1, targets: "ally" });
    expect(game.p1.energy()).toBe(0); // 1 base + 1 repeat
    expect(game.chain()).toHaveLength(1); // still a single spell (rule 820.3.a)
    await game.settle();
    const assault = game.state("ally").grantedKeywords.filter((k) => k.keyword === "Assault").reduce((n, k) => n + (k.value ?? 0), 0);
    expect(assault).toBe(4);
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 2 + 4 = 6 ≥ 6
  });

  test("[Repeat] is optional and its cost must be affordable: with 1 energy only the un-repeated cast is legal", async () => {
    const game = await board(1).build();
    const r = await game.p1.try((p) => p.cast("br", { repeat: 1, targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("br")).toBe("hand");
    await game.p1.cast("br", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
  });

  test("[Action] timing: legal with Focus in a showdown on the opponent's turn, illegal in their Open state", async () => {
    const game = await board(1).active(P2).battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 3 }, "def").unit(P2, "base", { might: 2 }, "atk").build();
    expect(game.p1.can("cast", "br")).toBe(false);
    await game.p2.move("atk", "bf2");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "br")).toBe(true);
  });
});
