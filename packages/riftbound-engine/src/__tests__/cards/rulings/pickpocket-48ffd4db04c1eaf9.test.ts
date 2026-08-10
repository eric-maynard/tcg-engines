/**
 * Ruling 48ffd4db04c1eaf9 — Pickpocket (SFD-074 → sfd-074-221) · 3 · 3 Might · "When you play me, you may kill a gear with
 *   Energy cost no more than [1]. If you do, play a Gold gear token exhausted."
 *   × Gold token (SFD-T03 → sfd-t03) · gear token · "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: Can Pickpocket kill a Gold token — a token has no printed cost at all?
 * A: Yes. A token's cost is treated as 0 for all purposes (it is not "null"/missing information), so a Gold token is a
 *    gear "with Energy cost no more than [1]" and a legal choice; killing it then makes Pickpocket's own Gold.
 * Rules: 183/186 (tokens), cost of a token = 0 (designer clarification), 359.3.e.12 (null only for unavailable info).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PICKPOCKET = "sfd-074-221";
const GOLD = "sfd-t03";
const UNLICENSED_ARMORY = "ogn-023-298"; // a 2-cost gear — NOT a legal choice (contrast)

/** P1's turn with [3]. P2's base: a Gold token, a 1-cost Trinket and a 2-cost Armory. Pickpocket in P1's hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .gear(P2, GOLD, "gold")
    .gear(P2, { cardType: "gear", energyCost: 1, name: "Trinket" }, "trinket")
    .gear(P2, UNLICENSED_ARMORY, "armory")
    .hand(P1, PICKPOCKET, "pp");
}

const goldTokensOf = (game: Game, seat: string) =>
  game.findAll({ name: "Gold", owner: seat }).filter((id) => game.zoneOf(id) === "base");

/** Play Pickpocket, opt into its trigger and stop at the gear choice. */
async function playToGearChoice(): Promise<Game> {
  const game = await board().build();
  expect(game.state("gold")).toMatchObject({ energyCost: 0, isToken: true, zone: "base" }); // a token reads as cost 0
  await game.p1.play("pp");
  expect(game.zoneOf("pp")).toBe("base");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "pp" } }); // "you may"
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "pp" } });
  return game;
}

describe("Ruling 48ffd4db04c1eaf9 — Pickpocket can kill a Gold token (token cost counts as 0 ≤ 1)", () => {
  test("the Gold TOKEN is offered as a legal 'gear with Energy cost no more than [1]' alongside the 1-cost Trinket; the 2-cost Armory is not", async () => {
    const game = await playToGearChoice();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["gold", "trinket"]);
    expect(offered).not.toContain("armory");
  });

  test("choosing the Gold token: on resolution it is killed (a token that leaves the board ceases to exist) and — 'if you do' — P1 gets their own exhausted Gold token", async () => {
    const game = await playToGearChoice();
    await game.p1.pick("gold");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pp", targets: ["gold"], triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gold")).toBe("gone");
    expect(goldTokensOf(game, P2)).toEqual([]);
    const mine = goldTokensOf(game, P1);
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0]!)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold" });
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.zoneOf("armory")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("with the Gold token as the ONLY cheap gear around, Pickpocket's trigger still has a legal choice and takes it", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P2, GOLD, "gold").gear(P2, UNLICENSED_ARMORY, "armory").hand(P1, PICKPOCKET, "pp").build();
    await game.p1.play("pp");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "pp" } });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("gold");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pp", targets: ["gold"] })]);
    await game.settle();
    expect(game.zoneOf("gold")).toBe("gone");
    expect(goldTokensOf(game, P1)).toHaveLength(1);
    expect(game.zoneOf("armory")).toBe("base");
  });
});
