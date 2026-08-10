/**
 * Ruling 61f458ec2fa35505 — Ezreal, Dashing (SFD-082 → sfd-082-221) · [4][mind] · 3 Might · "When I attack or defend, deal damage equal
 *     to my Might to an enemy unit here. I don't deal combat damage. [mind]: [Action] — Move me to your base."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Can the triggers be stacked so that Ezreal's resolves first and Reaver's Row after?
 * A: No. Order is fixed by the rules: the attacker's "When I attack" trigger goes on the chain first, the defender's "When you
 *    defend" (Reaver's Row) on top; LIFO → the Row resolves first. If the defender sends Ezreal's target home, Ezreal's ability then
 *    resolves but its "enemy unit here" instruction cannot be carried out (target no longer here) — it whiffs.
 * Rules: 464.2 (initial combat chain: attacker's triggers, then defender's), 340 (LIFO), 359.3.e (instruction needing "here" is skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-082-221";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn. Ezreal ready in P1's base. P2 controls the live Reaver's Row with Runner (2) and Anchor (6). */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 2, name: "Runner" }, "runner")
    .unit(P2, "row", { might: 6, name: "Anchor" }, "anchor")
    .unit(P1, "base", EZREAL, "ez");
}

/** Ezreal attacks the Row aiming his trigger at Runner; P2 opts into the Row naming Runner. Returns with both items on the chain. */
async function attack(): Promise<{ game: Game; orderOffered: boolean }> {
  const game = await board().build();
  let orderOffered = false;
  await game.p1.move("ez", "row");
  expect(game.state("ez").combatRole).toBe("attacker");
  let d = game.decision();
  if (d?.kind === "order") {
    orderOffered = true;
  }
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ez" } });
  await game.p1.pick("runner");
  d = game.decision();
  if (d?.kind === "order") {
    orderOffered = true;
  }
  expect(d).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  await game.p2.yes();
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
  await game.p2.pick("runner");
  if (game.decision()?.kind === "order") {
    orderOffered = true;
  }
  return { game, orderOffered };
}

async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling 61f458ec2fa35505 — Ezreal's attack trigger cannot be stacked above Reaver's Row; the Row resolves first and Ezreal whiffs", () => {
  test("the chain is built in the mandated order — Ezreal's 'When I attack' at the bottom, the Row's 'When you defend' on top — and nobody is offered a chance to reorder them", async () => {
    const { game, orderOffered } = await attack();
    expect(orderOffered).toBe(false);
    expect(game.chain().map((c) => [c.cardId, c.controller, c.targets])).toEqual([
      ["ez", P1, ["runner"]],
      ["row", P2, ["runner"]],
    ]);
  });

  test("LIFO: Reaver's Row resolves first and Runner moves to P2's base; Ezreal's item is still waiting with its locked target", async () => {
    const { game } = await attack();
    await resolveTop(game);
    expect(game.locationOf("runner")).toBe("base");
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["ez", ["runner"]]]);
    expect(game.state("runner").damage).toBe(0);
  });

  test("Ezreal's trigger then resolves but whiffs: Runner (no longer 'here') takes nothing, and the damage does not jump to the Anchor", async () => {
    const { game } = await attack();
    await resolveTop(game); // Row
    await resolveTop(game); // Ezreal — no effect
    expect(game.chain()).toEqual([]);
    expect(game.state("runner")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("anchor")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    // Ezreal deals no combat damage; Anchor's 6 kills him. P2 keeps the Row.
    await game.settle();
    expect(game.zoneOf("ez")).toBe("trash");
    expect(game.state("anchor").damage).toBe(0);
    expect(game.gameState.battlefields.row?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control: if P2 declines the Row, Runner is still here when Ezreal's trigger resolves and takes his 3 (dies)", async () => {
    const game = await board().build();
    await game.p1.move("ez", "row");
    await game.p1.pick("runner");
    await game.p2.no();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("runner")).toBe("trash");
  });
});
