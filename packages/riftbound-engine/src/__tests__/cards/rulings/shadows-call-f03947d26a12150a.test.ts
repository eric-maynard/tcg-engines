/**
 * Ruling f03947d26a12150a — Shadow's Call (UNL-165 → unl-165-219) · Action · [2] · "Choose a friendly unit without [Temporary]. Give it
 *     [Temporary]. Draw 2."   (Shadow unl-194-219 is listed by the scrape but plays no part.)
 *
 * Q: Does Shadow's Call still do anything if the chosen unit is killed at Reaction speed while it is on the chain?
 * A: Yes — you still draw 2. The spell resolves; "Give it [Temporary]" is skipped (its target is gone) but "Draw 2" has no target and
 *    is carried out (do as much as you can).
 * Rules: 359.3.e.7 (instruction on a missing target skipped), 359.3.e.11 (partial resolution), 336.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADOWS_CALL = "unl-165-219";

/** P2's 0-cost Reaction: kill a unit. */
const SNIPE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Snipe",
  timing: "reaction",
};

/** P1's turn with [2]; Pal (2) in base is the chosen unit; deck top d1, d2, d3. P2 holds the Snipe reaction. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, SHADOWS_CALL, "call")
    .hand(P2, SNIPE, "snipe")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function callOnPal(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("call", { targets: "pal" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "call", targets: ["pal"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling f03947d26a12150a — Shadow's Call still draws 2 when its unit is killed in response", () => {
  test("control: unanswered, Pal gains [Temporary] and P1 draws d1, d2", async () => {
    const game = await callOnPal();
    await game.settle();
    expect(game.state("pal").keywords).toContain("Temporary");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });

  test("P2 Snipes Pal in response (LIFO: Pal dies first); Shadow's Call then RESOLVES: the [Temporary] grant is skipped (Pal is in the trash, no keyword) but P1 STILL draws 2", async () => {
    const game = await callOnPal();
    expect(game.p2.can("cast", "snipe")).toBe(true);
    await game.p2.cast("snipe", { targets: "pal" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["call", "snipe"]);
    // Resolve the Snipe only.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "snipe"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "call", targets: ["pal"] })]); // still resolving, not countered
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.state("pal").keywords).not.toContain("Temporary"); // that part missed
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]); // "Draw 2" still happened
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
