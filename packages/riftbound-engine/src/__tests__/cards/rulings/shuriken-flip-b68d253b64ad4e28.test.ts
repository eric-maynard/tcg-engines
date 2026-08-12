/**
 * Ruling b68d253b64ad4e28 — Shuriken Flip (VEN-140 → ven-140-166) · Spell · [1]+[rainbow] · "Deal 2 to up to one enemy unit at a
 *     battlefield, then move a friendly unit. [Flow] [3][rainbow]"
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1]+[calm] · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: If I play Shuriken Flip from my trash for its Flow cost, can it get Defied?
 * A: Yes. Defy reads the PRINTED cost (1 energy / 1 power) — not what was paid. Paying the Flow cost (3 + any Power) does not
 *    change the printed cost, so the Flow-played Flip is still within Defy's range and is countered.
 * Rules: 206 (cost in text = printed cost), 356 (alternative costs change only the payment), 425.1 (a countered spell does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHURIKEN_FLIP = "ven-140-166";
const DEFY = "ogn-045-298";

/** P1's turn. Shuriken Flip is in P1's TRASH; P1 has exactly the Flow cost [3]+1. P2's Target (5) at bf1; P2 holds Defy with [1]+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "target")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .trash(P1, SHURIKEN_FLIP, "flip")
    .hand(P2, DEFY, "defy");
}

async function flowCast(): Promise<Game> {
  const game = await board().build();
  const flow = game.p1.option("cast", "flip")?.fields.find((f) => f.arg === "flow");
  expect(flow?.options).toEqual([true]); // from the trash it is only playable as a Flow play
  // rule 355.5 / 355.12 (ven-140-166) — a [Flow] play names the same objects as
  // one from hand: the (optional) damage victim AND the mandatory friendly mover.
  await game.p1.cast("flip", { flow: true, targets: ["target", "ally"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["flip"]);
  // rule 355.4 — the Move Destination is part of the same step, asked before
  // anyone receives Priority.
  await game.p1.pick("battlefield-bf2");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // the FLOW cost [3]+1 was paid
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

function defyTargets(game: Game): string[] {
  const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

describe("Ruling b68d253b64ad4e28 — a Flow-played Shuriken Flip is still Defy-able (printed cost 1+1)", () => {
  test("printed cost check: Shuriken Flip reads energy 1 / one Power pip regardless of how it was paid", async () => {
    const game = await flowCast();
    expect(game.state("flip")).toMatchObject({ energyCost: 1 });
    expect(game.state("flip").powerCost).toHaveLength(1);
  });

  test("with the Flow-played Flip on the chain, Defy is legal for P2 and offers the Flip as its target", async () => {
    const game = await flowCast();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(defyTargets(game)).toEqual(["flip"]);
    await game.p2.cast("defy", { targets: "flip" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["flip", "defy"]);
  });

  test("Defy resolves first and counters it: no damage to the Target, no friendly move is asked for or made, Defy → trash, Flip off the chain", async () => {
    const game = await flowCast();
    await game.p2.cast("defy", { targets: "flip" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("flip")).not.toBe("chain");
    expect(game.state("target").damage).toBe(0);
    expect(game.locationOf("ally")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-Defied, the Flow-played Flip resolves normally — 2 to the Target, then P1 moves the Ally", async () => {
    const game = await flowCast();
    await game.p2.passPriority();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      const wanted = d.semantics === "destination" ? (d.options.find((o) => (o.zone ?? o.key).includes("bf2")) ?? d.options[0]!) : (d.options.find((o) => (o.card ?? o.key) === "ally") ?? d.options[0]!);
      await game.p1.pick(wanted.key);
    }
    await game.settle();
    expect(game.state("target").damage).toBe(2);
    expect(game.locationOf("ally")).toBe("bf2");
  });
});
