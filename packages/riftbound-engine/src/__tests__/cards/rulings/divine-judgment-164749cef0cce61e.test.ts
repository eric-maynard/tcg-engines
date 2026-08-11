/**
 * Ruling 164749cef0cce61e — Divine Judgment (OGN-244 → ogn-244-298) · Action · [7][order][order]
 *     "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Q: Can both players choose the same targets for Divine Judgment?
 * A: Yes — the two players' choices are independent. Each player names 2 per category and everything not named is
 *    recycled; one player's choice never takes anything off the other player's menu. A player who has only one unit
 *    simply keeps it: with 2 or fewer there is nothing to recycle and nothing to decide.
 * Rules: 355.10 (each player makes their own choice), 359 (choices happen on resolution), 416 (Recycle).
 *
 * DESIGN: the ruling also reads "2 units" as ranging over EVERY unit on the board, so both players could name the
 * very same unit. The engine scopes each player's choice to permanents that player controls — an adjudicated
 * deviation already recorded in the sibling `divine-judgment-b4a8fb99f1567441.test.ts` (rule 359 wants a resolution's
 * choices made at once and unioned; the engine's `pendingChoice` applies each pick as it is made). Facets that need
 * the wider menu are asserted at the ENGINE's behaviour and flagged RULING-CONFLICT below.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";

type Prompt = { seat: string; kind: Decision["kind"]; options: string[] };

/** P1's turn with exactly [7]+[order][order]. Both players field THREE units and hold nothing else. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .unit(P1, "base", { might: 1, name: "Mine A" }, "a")
    .unit(P1, "base", { might: 2, name: "Mine B" }, "b")
    .unit(P1, "base", { might: 3, name: "Mine C" }, "c")
    .unit(P2, "base", { might: 1, name: "Theirs X" }, "x")
    .unit(P2, "base", { might: 2, name: "Theirs Y" }, "y")
    .unit(P2, "base", { might: 3, name: "Theirs Z" }, "z")
    .hand(P1, DIVINE_JUDGMENT, "dj");
}

/**
 * Cast Divine Judgment and walk its resolution prompts, recording what each seat was shown. The engine states the
 * "keep 2" the other way round — one prompt per excess card, "Pick a revealed card to recycle" — so `letGo` names,
 * per seat, the cards that player gives up (everything else is what they chose to keep).
 */
async function castAndResolve(game: Game, letGo: Record<string, string[]>): Promise<{ game: Game; prompts: Prompt[] }> {
  const prompts: Prompt[] = [];
  await game.p1.cast("dj");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !d || d.kind === "action") {
      break;
    }
    if (d.kind !== "pick") {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}: ${d.prompt}`);
    }
    const options = d.options.map((o) => (o.card ?? o.key) as string);
    prompts.push({ kind: d.kind, options, seat: d.seat });
    const want = letGo[d.seat] ?? [];
    const take = d.options.find((o) => want.includes((o.card ?? o.key) as string)) ?? d.options[0];
    await game.seat(d.seat).pick(take!.key);
  }
  return { game, prompts };
}

describe("Ruling 164749cef0cce61e — Divine Judgment: each player's 'choose 2' is an independent choice", () => {
  test("both players are asked in turn (each a `pick` Decision addressed to that seat) and each keeps the 2 they chose — P1's answer never shrinks P2's menu", async () => {
    const { game, prompts } = await castAndResolve(await board().build(), { [P1]: ["c"], [P2]: ["z"] });
    expect(prompts.map((p) => ({ kind: p.kind, seat: p.seat }))).toEqual([
      { kind: "pick", seat: P1 },
      { kind: "pick", seat: P2 },
    ]);
    // P2's menu is untouched by what P1 answered a moment earlier.
    expect(prompts[1]?.options.toSorted()).toEqual(["x", "y", "z"]);
    expect(game.p1.units().toSorted()).toEqual(["a", "b"]);
    expect(game.p2.units().toSorted()).toEqual(["x", "y"]);
    expect(game.zoneOf("c")).toBe("mainDeck");
    expect(game.zoneOf("z")).toBe("mainDeck");
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the two answers are independent — keeping a different pair on each side changes only that side's board", async () => {
    const { game } = await castAndResolve(await board().build(), { [P1]: ["a"], [P2]: ["x"] });
    expect(game.p1.units().toSorted()).toEqual(["b", "c"]);
    expect(game.p2.units().toSorted()).toEqual(["y", "z"]);
    expect(game.zoneOf("a")).toBe("mainDeck");
    expect(game.zoneOf("x")).toBe("mainDeck");
  });

  test("ruling nuance: a player with only ONE unit keeps it — they are never asked and nothing of theirs is recycled", async () => {
    const solo = scenario()
      .resources(P1, { energy: 7, power: { order: 2 } })
      .unit(P1, "base", { might: 1, name: "Lonely" }, "lonely")
      .unit(P2, "base", { might: 1, name: "Theirs X" }, "x")
      .unit(P2, "base", { might: 2, name: "Theirs Y" }, "y")
      .unit(P2, "base", { might: 3, name: "Theirs Z" }, "z")
      .hand(P1, DIVINE_JUDGMENT, "dj");
    const { game, prompts } = await castAndResolve(await solo.build(), { [P2]: ["z"] });
    expect(prompts.map((p) => p.seat)).toEqual([P2]); // P1 has 1 ≤ 2 ⇒ forced, nothing to ask
    expect(game.p1.units()).toEqual(["lonely"]);
    expect(game.zoneOf("lonely")).toBe("base");
    expect(game.p2.units().toSorted()).toEqual(["x", "y"]);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 164749cef0cce61e reads "each player chooses 2 units" as ranging over every unit on the
  // board — so a player could spend a pick on an opponent's unit, both players could name the SAME unit, and a player
  // with a single unit would have to spend their second pick across the table. The engine (`collectCategory` in
  // abilities/effects/recycle.ts) scopes each player's choice to permanents that player controls; identical on every
  // board where nobody spends a pick on an opponent's permanent. Asserted at the engine so the divergence stays visible.
  test("engine: each seat is shown only its OWN units, so the two menus are disjoint and neither can name the other's", async () => {
    const { prompts } = await castAndResolve(await board().build(), { [P1]: ["c"], [P2]: ["z"] });
    expect(prompts.find((p) => p.seat === P1)?.options.toSorted()).toEqual(["a", "b", "c"]);
    expect(prompts.find((p) => p.seat === P2)?.options.toSorted()).toEqual(["x", "y", "z"]);
  });

  // RULING-CONFLICT: under the ruling's shared menu, three units a side could end on three units total (both players
  // spending a pick on the same one). With per-seat pools the floor is 2 + 2 = 4. Engine behaviour asserted.
  test("engine: with three units each, exactly two per player survive — four in total", async () => {
    const { game } = await castAndResolve(await board().build(), { [P1]: ["c"], [P2]: ["z"] });
    expect(game.p1.units()).toHaveLength(2);
    expect(game.p2.units()).toHaveLength(2);
  });
});
