/**
 * Ruling 2f91fdb494178bdf — Bellows Breath (SFD-080 → sfd-080-221) [Action] · 1 + [mind]
 *   "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *   × Defy (OGN-045 → ogn-045-298) [Reaction] · 1 + [calm] "Counter a spell that costs no more than [4] and no more
 *     than [rainbow]."
 *
 * Q: Can Defy counter Bellows Breath if its Repeat cost was paid?
 * A: Yes. Defy checks the BASE cost (1 energy, 1 power) — additional costs like Repeat don't count. Repeat does
 *    not create a second spell/chain item; countering it stops the entire spell, both executions, and it goes
 *    to the trash.
 * Rules: 746.1.d (Repeat modifies the one spell), 412.1.a (countered → no effect, to trash), Defy cost check = base cost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const DEFY = "ogn-045-298";

/** P1's turn. P2's three 4-Might Grunts hold bf1. P1: Bellows Breath + exactly base+repeat (2 energy, 2 mind). P2: Defy + 1 + [calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Grunt A" }, "ga")
    .unit(P2, "bf1", { might: 4, name: "Grunt B" }, "gb")
    .unit(P2, "bf1", { might: 4, name: "Grunt C" }, "gc")
    .hand(P1, BELLOWS_BREATH, "bb")
    .hand(P2, DEFY, "defy");
}

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1 casts Bellows Breath paying the Repeat cost, aiming both executions at the three Grunts; passes to P2. */
async function repeatedBreath(game: Game): Promise<void> {
  await game.p1.cast("bb", { repeat: 1, targets: ["ga", "gb", "gc"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // base 1+[mind] AND repeat 1+[mind] paid
  expect(game.chain()).toHaveLength(1); // Repeat is not a second chain item
  expect(game.chain()[0]).toMatchObject({ cardId: "bb", controller: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 2f91fdb494178bdf — Defy counters a repeated Bellows Breath entirely", () => {
  test("control: un-countered, the repeated Bellows Breath deals 1 twice to each Grunt (both executions come from the single chain item)", async () => {
    const game = await board().build();
    await repeatedBreath(game);
    await game.settle();
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.state("ga").damage).toBe(2);
    expect(game.state("gb").damage).toBe(2);
    expect(game.state("gc").damage).toBe(2);
  });

  test("Defy may target the repeated Bellows Breath — its BASE cost (1 energy, 1 power) is within [4]/[rainbow] even though 2+2 was actually paid", async () => {
    const game = await board().build();
    await repeatedBreath(game);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "p2", "defy")).toContain("bb");
    await game.p2.cast("defy", { targets: "bb" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bb", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("Defy resolves first and counters the whole spell: Bellows Breath goes to the trash, NEITHER execution deals damage, and nothing is refunded", async () => {
    const game = await board().build();
    await repeatedBreath(game);
    await game.p2.cast("defy", { targets: "bb" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.state("ga").damage).toBe(0);
    expect(game.state("gb").damage).toBe(0);
    expect(game.state("gc").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // repeat cost stays spent too
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
