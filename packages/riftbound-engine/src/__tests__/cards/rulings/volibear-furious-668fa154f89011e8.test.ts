/**
 * Ruling 668fa154f89011e8 — Volibear, Furious (OGN-041 → ogn-041-298) · [10][fury][fury] · 9 Might · "[Deflect 2] When I attack, deal 5
 *     damage split among any number of enemy units here."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Volibear attacks into Reaver's Row — in what order do the triggers resolve?
 * A: Volibear's "When I attack" goes on the chain first (attacker), the Row's "When you defend" second (defender); both may react;
 *    LIFO → the Row resolves first (defender may pull a unit home), then Volibear's split damage resolves against the remaining valid
 *    targets. Targets are chosen when the triggers go on the chain; a unit moved home by the Row is no longer "here" and takes nothing.
 * Rules: 464.2 (initial chain order), 340 (LIFO), 355.14 (split damage: recipients chosen on the chain, amounts on resolution),
 *        359.3.e (a recipient no longer here is skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn. Volibear ready in base. P2 controls the live Row with Runner (2) and Anchor (5). */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 2, name: "Runner" }, "runner")
    .unit(P2, "row", { might: 5, name: "Anchor" }, "anchor")
    .unit(P1, "base", VOLIBEAR, "voli");
}

type PickD = Extract<Decision, { kind: "pick" }>;

/** Volibear attacks; P1 names BOTH enemy units as split recipients; P2 opts into the Row and names Runner. */
async function attack(rowAnswer: "runner" | "no"): Promise<Game> {
  const game = await board().build();
  await game.p1.move("voli", "row");
  expect(game.state("voli").combatRole).toBe("attacker");
  // Attacker's trigger first: recipients of the split are chosen NOW (amounts later).
  let d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" } });
  expect((d as PickD).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["anchor", "runner"]);
  await game.p1.pick("runner", "anchor");
  // Then the defender's Reaver's Row.
  d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  if (rowAnswer === "no") {
    await game.p2.no();
    return game;
  }
  await game.p2.yes();
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
  await game.p2.pick("runner");
  return game;
}

/** Both pass once → the top item resolves; answer Volibear's amount distribution if it is asked. */
async function resolveTop(game: Game, split?: Record<string, number>): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
  const d = game.decision();
  if (d?.kind === "distribute") {
    expect(d.seat).toBe(P1);
    const keys = d.buckets.map((b) => b.card ?? b.key);
    const alloc: Record<string, number> = {};
    for (const k of keys) {
      alloc[k] = split?.[k] ?? 0;
    }
    if (Object.values(alloc).reduce((a, b) => a + b, 0) !== d.total) {
      alloc[keys[0]!] = (alloc[keys[0]!] ?? 0) + d.total - Object.values(alloc).reduce((a, b) => a + b, 0);
    }
    await game.p1.distribute(alloc);
  }
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling 668fa154f89011e8 — Volibear into Reaver's Row: attacker's trigger placed first, Row resolves first", () => {
  test("chain order: Volibear's 'When I attack' (P1, recipients Runner + Anchor locked) at the bottom, Reaver's Row (P2 → Runner) on top; both players now hold priority in turn and could react", async () => {
    const game = await attack("runner");
    expect(game.chain().map((c) => [c.cardId, c.controller, [...(c.targets ?? [])].toSorted()])).toEqual([
      ["voli", P1, ["anchor", "runner"]],
      ["row", P2, ["runner"]],
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    const first = game.decision()!.seat;
    await game.seat(first).passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.decision()!.seat).not.toBe(first); // the other player gets a say too
  });

  test("LIFO: the Row resolves first — Runner is home, undamaged — while Volibear's item still waits", async () => {
    const game = await attack("runner");
    await resolveTop(game);
    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").damage).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["voli"]);
  });

  test("Volibear's split then resolves against the REMAINING valid target only: Runner (in base) takes nothing; all 5 can go to the Anchor, which dies", async () => {
    const game = await attack("runner");
    await resolveTop(game); // Row
    await resolveTop(game, { anchor: 5 }); // Volibear
    expect(game.chain()).toEqual([]);
    expect(game.state("runner")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("anchor")).toBe("trash");
    await game.settle(); // no defenders left → Volibear conquers
    expect(game.locationOf("voli")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: if P2 declines the Row, both recipients are still here and the 5 is split between them (2 to Runner, 3 to Anchor → Runner dies, Anchor on 3)", async () => {
    const game = await attack("no");
    await resolveTop(game, { anchor: 3, runner: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.state("anchor")).toMatchObject({ damage: 3, zone: "battlefield-row" });
  });
});
