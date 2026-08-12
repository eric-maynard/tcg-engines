/**
 * Ruling 248c189184a32fd8 — Called Shot (SFD-122 → sfd-122-221) · Action · [0][chaos]
 *   "[Repeat] [chaos] — Look at the top 2 cards of your Main Deck. Draw one and recycle the other."
 *   × Vex, Cheerless (SFD-146 → sfd-146-221) · 5 Might
 *     "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy
 *      spells cost [1][rainbow] more."
 *
 * Q: Playing Called Shot with Vex out, do I pay [1] with no recycle, or [0] with no recycle?
 * A: [0] — Vex's discount wipes out Called Shot's Power pip, so the first cast costs nothing at all
 *    (no rune recycled). A [Repeat] execution is priced separately and still costs its [chaos].
 * Rules: 356.4 (cost reduction applies to the total cost), 820.1 / 820.2 ([Repeat] is an additional
 *        cost paid per extra execution), 159.3 / 416 (Power comes from recycling a rune).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CALLED_SHOT = "sfd-122-221";
const VEX_CHEERLESS = "sfd-146-221";
const FILLER = "ogn-175-298";

/** P1's turn, [3] + three [chaos] in the pool, a known deck, and (optionally) Vex ready in base. */
function board(withVex: boolean) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"])
    .hand(P1, CALLED_SHOT, "cs");
  return withVex ? s.unit(P1, "base", VEX_CHEERLESS, "vex") : s;
}

/** Send Vex into the enemy battlefield so her "while I'm in combat" clause is live. */
async function vexInCombat(): Promise<Game> {
  const game = await board(true).build();
  await game.p1.move("vex", "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  return game;
}

describe("Ruling 248c189184a32fd8 — Called Shot costs 0 with Vex in combat; a Repeat still costs [chaos]", () => {
  test("baseline: without Vex, Called Shot's own [chaos] pip is charged", async () => {
    const game = await board(false).build();
    await game.p1.cast("cs");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 2 } }); // one Power spent
  });

  test("ruling: with Vex in combat the first cast costs NOTHING — no energy and no Power (no rune recycled)", async () => {
    const game = await vexInCombat();
    const before = game.p1.resources();
    expect(before).toEqual({ energy: 3, power: { chaos: 3 } });
    await game.p1.cast("cs");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 3 } });
  });

  test("…and it still does its job: P1 looks at the top 2, draws one and recycles the other", async () => {
    const game = await vexInCombat();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("cs");
    const stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("d1");
    }
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toHaveLength(deck0 - 1); // one drawn, the other recycled back in
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling (Repeat): electing the [Repeat] execution does cost its [chaos] even with Vex out", async () => {
    const game = await vexInCombat();
    const field = game.p1.option("cast", "cs")?.fields.find((f) => f.name === "repeatCount");
    expect((field?.options ?? []).map(Number)).toEqual([1]);
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.energy()).toBe(3); // the energy side is still free
    expect(game.p1.power("chaos")).toBe(2); // exactly one Power for the extra execution
  });

  test("…and that Repeat really buys a second execution: two cards are drawn in all", async () => {
    const game = await vexInCombat();
    await game.p1.cast("cs", { repeat: 1 });
    for (let i = 0; i < 6; i++) {
      const stop = await game.settle();
      if (stop.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]!.key);
        continue;
      }
      break;
    }
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
