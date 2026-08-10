/**
 * Ruling 481087b62d5401a2 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a
 *   friendly unit here to base."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Yasuo attacks and his trigger targets a defender; before it resolves the defender leaves via Reaver's Row. Does the
 *    damage follow the unit?
 * A: No. Yasuo's ability needs its target to be "here" when it RESOLVES. The Row's defend trigger resolves first (LIFO) and
 *    moves the unit home; Yasuo's trigger then resolves — it does not fizzle off the chain — but its damage instruction cannot
 *    be followed and is ignored. No damage anywhere.
 * Rules: 464.2 (initial chain: attacker's triggers then defender's → defender's resolve first), 359.3.e.6 / 359.3.e.9
 *        (mistargeted instruction ignored), 359.3.e.1 (the ability still resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn. P2 holds Reaver's Row (live text) with Runner (3) and Anchor (7, survives Yasuo in combat). Yasuo ready in P1's base. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "row", { might: 7, name: "Anchor" }, "anchor")
    .unit(P1, "base", YASUO, "yasuo");
}

/** Yasuo attacks; P1 aims his trigger at Runner; P2 opts into the Row and (if `retreat`) sends Runner home. */
async function attack(retreat: boolean): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "row");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  // Attacker's trigger chooses its enemy unit "here" as it is put on the chain.
  let d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "yasuo" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["anchor", "runner"]);
  await game.p1.pick("runner");
  // Defender's Reaver's Row: "you may" → P2 decides, then names the friendly unit here.
  d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  if (!retreat) {
    await game.p2.no();
    return game;
  }
  await game.p2.yes();
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
  await game.p2.pick("runner");
  expect(game.chain().map((c) => [c.cardId, c.controller, c.targets])).toEqual([
    ["yasuo", P1, ["runner"]],
    ["row", P2, ["runner"]],
  ]);
  return game;
}

/** Both players pass once each → the top chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling 481087b62d5401a2 — Yasuo's attack damage does not follow a unit that Reaver's Row moved home", () => {
  test("the Row's defend trigger sits above Yasuo's attack trigger and resolves first: Runner is in P2's base, Yasuo's item still on the chain with its locked target", async () => {
    const game = await attack(true);
    await resolveTop(game); // Reaver's Row
    expect(game.locationOf("runner")).toBe("base");
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["yasuo", ["runner"]]]);
    expect(game.state("runner").damage).toBe(0);
  });

  test("Yasuo's trigger then RESOLVES (it gets its window, no early fizzle) but deals nothing: Runner is no longer 'here', and the damage does not jump to the Anchor either", async () => {
    const game = await attack(true);
    await resolveTop(game); // Row
    await resolveTop(game); // Yasuo's trigger → no effect
    expect(game.chain()).toEqual([]);
    expect(game.state("runner")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("anchor")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    // No re-target prompt was raised; we are simply in the showdown now.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    // Let the combat play out: Yasuo 6 into Anchor 7 — Yasuo dies, P2 keeps the Row, Runner safe at home.
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.zoneOf("anchor")).toBe("battlefield-row");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.gameState.battlefields.row?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control: if P2 declines the Row, Runner is still 'here' when Yasuo's trigger resolves and takes the full 6 (dies)", async () => {
    const game = await attack(false);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.state("anchor").damage).toBe(0);
  });
});
