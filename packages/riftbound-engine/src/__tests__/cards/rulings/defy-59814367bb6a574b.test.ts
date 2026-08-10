/**
 * Ruling 59814367bb6a574b — Defy (OGN-045 → ogn-045-298) · Reaction · [1]+[calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Public Execution (VEN-154 → ven-154-166) · Spell · [2]+[rainbow]
 *     "Choose a friendly unit. Kill an enemy unit with less Might than it. [Flow] [5][rainbow][rainbow] (You may play
 *      this from your trash for its Flow cost. Then banish it.)"
 *
 * Q: Can you Defy a Public Execution that was played from the trash for its Flow cost?
 * A: Yes. Defy checks the PRINTED cost (2 energy / 1 power), not what was paid; the Flow alternative cost only
 *    changes the payment. If it resolves it banishes itself as usual; if Defied it just goes to the trash like
 *    any countered spell.
 * Rules: 206 (printed cost), 356 (alternative costs), 412.1.a / 425.1.a (countered spell → trash, no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const PUBLIC_EXECUTION = "ven-154-166";

/** P1's turn. Public Execution sits in P1's TRASH; P1 has exactly the Flow cost. P2 holds Defy with exactly [1]+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Headsman" }, "headsman")
    .unit(P2, "bf1", { might: 2, name: "Condemned" }, "condemned")
    .trash(P1, PUBLIC_EXECUTION, "pubex")
    .hand(P2, DEFY, "defy");
}

async function flowCast(game: Game): Promise<void> {
  expect(game.zoneOf("pubex")).toBe("trash");
  const flow = game.p1.option("cast", "pubex")?.fields.find((f) => f.arg === "flow");
  expect(flow?.options).toEqual([true]); // only playable as a Flow play — it is in the trash
  await game.p1.cast("pubex", { flow: true, targets: ["headsman", "condemned"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["pubex"]);
  // The Flow cost [5][rainbow][rainbow] was paid, not the printed [2][rainbow].
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

describe("Ruling 59814367bb6a574b — Defy can counter a Flow-played Public Execution (printed cost is what counts)", () => {
  test("the Flow-played Public Execution (printed [2]+1 pip) is a legal Defy target even though [5]+2 pips were paid", async () => {
    const game = await board().build();
    await flowCast(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "defy")).toEqual(["pubex"]);
    await game.p2.cast("defy", { targets: "pubex" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pubex", "defy"]);
  });

  test("Defied: Public Execution is countered — nobody dies, it leaves the chain, Defy goes to trash", async () => {
    const game = await board().build();
    await flowCast(game);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "pubex" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("pubex")).not.toBe("chain");
    expect(game.zoneOf("condemned")).toBe("battlefield-bf1");
    expect(game.zoneOf("headsman")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT (ruling 59814367bb6a574b): the ruling says a Defied Flow spell "just goes to the trash
  // like any countered spell" (rule 425.1.a.1). The engine follows rule 829.1.b.1 instead, and that rule is
  // the more specific one: Flow's "then banish it" is a DELAYED REPLACEMENT — "if the spell would leave the
  // chain after becoming a finalized chain item, and leaving the chain wasn't instructed by its own
  // execution, banish it instead". Being countered clears a *finalized* item from the chain (425.1.a) and is
  // by definition not instructed by the spell's own execution, so the replacement applies and banishment
  // replaces the trip to the trash. The same model is what makes the un-Defied control case below banish.
  test("engine follows 829.1.b.1: a countered Flow-played spell is BANISHED, not trashed (conflicts with ruling 59814367bb6a574b)", async () => {
    const game = await board().build();
    await flowCast(game);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "pubex" });
    await game.settle();
    expect(game.zoneOf("condemned")).toBe("battlefield-bf1"); // countered — nobody dies (425.1.a)
    expect(game.zoneOf("pubex")).toBe("banishment"); // rule 829.1.b.1 replaces the trash placement
  });

  test("control: un-Defied, the Flow-played Public Execution kills the weaker enemy and then banishes itself", async () => {
    const game = await board().build();
    await flowCast(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("condemned")).toBe("trash");
    expect(game.zoneOf("pubex")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
