/**
 * Ruling 18b4705e20cb78e0 — Bellows Breath (SFD-080 → sfd-080-221) · Action spell · [1][mind]
 *     "[Repeat] [1][mind] … Deal 1 to up to three units at the same location."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than [4] and no
 *     more than [rainbow]."
 *
 * Q: Can Defy counter a Bellows Breath whose owner paid to Repeat it, and does the counter stop the repeat too?
 * A: Yes. Defy checks only the BASE cost (1 + one pip), so the Repeat payment doesn't take it out of range.
 *    Repeat is not a separate copy — it is one spell made bigger (like kicker) — so countering it stops the
 *    whole thing: neither execution deals damage.
 * Rules: 206 (cost = printed cost), 820 / 746.1.d (Repeat = additional cost on the same item), 425.1 (countered
 *        spell does nothing, goes to trash), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const DEFY = "ogn-045-298";

/** P1's turn with exactly base + repeat ([2] + 2 mind); P2 holds Defy with exactly [1] + calm. Three P2 units at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Grunt A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Grunt B" }, "b")
    .unit(P2, "bf1", { might: 3, name: "Grunt C" }, "c")
    .hand(P1, BELLOWS_BREATH, "bellows")
    .hand(P2, DEFY, "defy");
}

async function castRepeated(game: Game): Promise<void> {
  await game.p1.cast("bellows", { repeat: 1, targets: ["a", "b", "c"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // base AND repeat paid up front
  expect(game.chain()).toHaveLength(1); // one item, not two
  await game.p1.passPriority();
}

describe("Ruling 18b4705e20cb78e0 — Defy counters a repeated Bellows Breath, repeat and all", () => {
  test("control: unopposed, the repeated Bellows Breath executes twice — each of the three grunts takes 2", async () => {
    const game = await board().build();
    await castRepeated(game);
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    for (const u of ["a", "b", "c"]) {
      expect(game.state(u).damage).toBe(2);
    }
  });

  test("Defy may target the Repeat-paid Bellows Breath: its base cost ([1] + one pip) is within 'no more than [4] / [rainbow]' even though 4 resources were spent", async () => {
    const game = await board().build();
    await castRepeated(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["bellows"]);
    await game.p2.cast("defy", { targets: "bellows" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bellows", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("Defy resolves first (LIFO) and counters the ENTIRE spell — no first execution, no repeat: all three grunts undamaged, both spells in trash, nothing refunded", async () => {
    const game = await board().build();
    await castRepeated(game);
    await game.p2.cast("defy", { targets: "bellows" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("bellows")).toBe("trash");
    for (const u of ["a", "b", "c"]) {
      expect(game.state(u).damage).toBe(0);
      expect(game.zoneOf(u)).toBe("battlefield-bf1");
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
