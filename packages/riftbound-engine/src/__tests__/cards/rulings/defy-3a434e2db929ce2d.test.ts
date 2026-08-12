/**
 * Ruling 3a434e2db929ce2d — Defy (OGN-045 → ogn-045-298)
 *   "[Reaction] Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Desert's Call (sfd-031-221) "[Repeat] [2] — Play a 2 [Might] Sand Soldier unit token."
 *
 * Q: If my spell has [Repeat] and my opponent Defies it, can I still use Repeat afterwards?
 * A: No. [Repeat] is an optional ADDITIONAL COST chosen and paid as the spell is played, before anyone
 *    gets priority; it extends the one spell rather than making a second one. Once Defy counters that
 *    chain item the whole thing — repeated execution included — never resolves, and the paid cost is
 *    not refunded.
 * Rules: 820.2 ([Repeat] is an additional cost of playing the spell), 356.2 (additional costs are paid
 *        at play time), 425.1 (a countered object does nothing), 425.1.c (costs already paid stay paid).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DESERTS_CALL = "sfd-031-221"; // [2] + [Repeat] [2]

function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, DESERTS_CALL, "call")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 3a434e2db929ce2d — Repeat is decided as the spell is cast; Defy counters the repeated spell whole", () => {
  test("the Repeat choice belongs to the PLAY: it is a cast-time field, paid at once, and gone once the spell is on the Chain", async () => {
    const game = await board().build();

    // 1. Repeat is offered as a parameter of playing the spell, not as a later action.
    const repeatField = game.p1.option("cast", "call")?.fields.find((f) => f.arg === "repeat");
    expect(repeatField).toMatchObject({ kind: "int", max: 1, min: 0 });

    await game.p1.cast("call", { repeat: 1 });
    // 2. [2] base + [2] Repeat are both paid immediately — before P2 has had any priority.
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "call", controller: P1 })]);

    // 3. Nothing on P1's menu can add (or retract) Repeat now — only passing or conceding.
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
  });

  test("Defy on a repeated Desert's Call ⇒ NO Sand Soldier at all, and the Repeat cost is not refunded", async () => {
    const game = await board().build();
    await game.p1.cast("call", { repeat: 1 });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "call" });
    await game.settle();

    expect(game.p1.base()).toEqual([]); // neither execution happened
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.energy()).toBe(1); // 5 - 2 - 2, still spent (425.1.c)
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the same repeated cast makes TWO Sand Soldiers — so Defy really removed both", async () => {
    const game = await board().build();
    await game.p1.cast("call", { repeat: 1 });
    await game.settle();
    expect(game.p1.base()).toHaveLength(2);
    expect(game.p1.energy()).toBe(1);
  });

  test("and without Repeat, Defy still counters the single execution", async () => {
    const game = await board().build();
    await game.p1.cast("call", { repeat: 0 });
    expect(game.p1.energy()).toBe(3);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "call" });
    await game.settle();
    expect(game.p1.base()).toEqual([]);
    expect(game.p1.energy()).toBe(3);
  });
});
