/**
 * Ruling bb658feaab7aca69 — Divine Judgment (OGN-244 → ogn-244-298) · [7][order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Q: Can Divine Judgment choose enemy units, and how does the selection work?
 * A: The choice is compulsory — "chooses 2", not "may" or "up to 2" — and the card names no controller, so under
 *    the ruling a player with fewer than two units of their own must spend picks on the opponent's. It also does
 *    not TARGET (the objects are chosen as it resolves, in part by other players), so removing a unit in response
 *    does not make the spell fizzle.
 * Rules: 355.10 (each player makes their own choice on resolution), 359 (choices are made as the spell resolves),
 *        355.9 (choices made on resolution are not targets), 416 (Recycle).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const GUST = "ogn-169-298";

type Prompt = { seat: string; options: string[] };

/** P1's turn with exactly [7][order][order] (+ P2 holding Gust and [1]). Unit counts per side are per test. */
function board(mine: number, theirs: number) {
  let b = scenario()
    .turn(3)
    .resources(P1, { energy: 7, power: { order: 2 } })
    .resources(P2, { energy: 1 })
    .hand(P1, DIVINE_JUDGMENT, "dj");
  for (let i = 0; i < mine; i++) {
    b = b.unit(P1, "base", { might: i + 1, name: `Mine ${i}` }, `m${i}`);
  }
  for (let i = 0; i < theirs; i++) {
    b = b.unit(P2, "base", { might: i + 1, name: `Theirs ${i}` }, `t${i}`);
  }
  return b;
}

/**
 * Cast Divine Judgment and walk its resolution prompts. The engine states the "keep 2" the other way round — one
 * prompt per excess permanent, "pick a revealed card to recycle" — so each answer names the card that seat gives up.
 */
async function castAndResolve(game: Game): Promise<Prompt[]> {
  const prompts: Prompt[] = [];
  await game.p1.cast("dj");
  for (let i = 0; i < 14; i++) {
    const r = await game.settle();
    const d: Decision | null = game.decision();
    if (r.reason !== "unanswered" || !d || d.kind === "action") {
      break;
    }
    if (d.kind !== "pick") {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}`);
    }
    prompts.push({ options: d.options.map((o) => (o.card ?? o.key) as string), seat: d.seat });
    await game.seat(d.seat).pick(d.options[0]!.key);
  }
  return prompts;
}

describe("Ruling bb658feaab7aca69 — Divine Judgment's 'choose 2' is compulsory and does not target", () => {
  test("it is not optional and not 'up to': with three units a side each player is asked and each ends on exactly two", async () => {
    const game = await board(3, 3).build();
    const prompts = await castAndResolve(game);
    expect(prompts.map((p) => p.seat)).toEqual([P1, P2]);
    expect(game.p1.units()).toHaveLength(2);
    expect(game.p2.units()).toHaveLength(2);
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a player already at two or fewer is never asked — there is nothing to give up and nothing to decide", async () => {
    const game = await board(3, 2).build();
    const prompts = await castAndResolve(game);
    expect(prompts.map((p) => p.seat)).toEqual([P1]);
    expect(game.p2.units().toSorted()).toEqual(["t0", "t1"]);
  });

  test("ruling: it does NOT target — removing a unit in response does not fizzle the spell, which still resolves and trims the rest", async () => {
    const game = await board(3, 3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Scamp" }, "scamp")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.cast("dj");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dj"]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]); // nothing was targeted on the play
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "scamp" });
    await game.settle();
    expect(game.zoneOf("scamp")).toBe("hand");
    // Divine Judgment still resolved: both players were trimmed to two units.
    for (let i = 0; i < 14; i++) {
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      await game.seat(d.seat).pick(d.options[0]!.key);
      await game.settle();
    }
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.p1.units()).toHaveLength(2);
    expect(game.p2.units()).toHaveLength(2);
  });

  test("the unchosen permanents are RECYCLED to the Main Deck (the card's own wording), not put in the trash", async () => {
    const game = await board(3, 0).build();
    await castAndResolve(game);
    const recycled = ["m0", "m1", "m2"].filter((id) => game.zoneOf(id) === "mainDeck");
    expect(recycled).toHaveLength(1);
    expect(game.p1.trash()).not.toContain(recycled[0]);
  });

  // RULING-CONFLICT / DESIGN: riftjudge bb658feaab7aca69 reads "each player chooses 2 units" as ranging over EVERY
  // unit on the board — a player controlling fewer than two would have to spend the remaining picks on the
  // opponent's units, and the two players could name the same unit. Rule 359 wants a resolution's choices made at
  // once and unioned; the engine's `pendingChoice` applies each pick as it is made, so it scopes each player's
  // choice to permanents that player controls (`collectCategory` in abilities/effects/recycle.ts) — identical on
  // every board where nobody spends a pick across the table. Already adjudicated in the sibling
  // `divine-judgment-b4a8fb99f1567441.test.ts`; the engine's behaviour is asserted here so the divergence stays visible.
  test("engine/DESIGN: a player with a single unit keeps it and is NOT made to name enemy units to reach two", async () => {
    const game = await board(1, 3).build();
    const prompts = await castAndResolve(game);
    expect(prompts.map((p) => p.seat)).toEqual([P2]); // P1 is never asked
    expect(prompts[0]?.options.toSorted()).toEqual(["t0", "t1", "t2"]); // and P2 sees only its own
    expect(game.p1.units()).toEqual(["m0"]);
    expect(game.p2.units()).toHaveLength(2);
  });
});
