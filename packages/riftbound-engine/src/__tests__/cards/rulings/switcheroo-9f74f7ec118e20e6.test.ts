/**
 * Ruling 9f74f7ec118e20e6 — Switcheroo (SFD-145 → sfd-145-221) · Spell · Chaos · [2][chaos][chaos] · Action · [Hidden]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Dr. Mundo, Expert (OGN-109 → ogn-109-298) · Unit · 6 Might · "My Might is increased by the number of cards in your
 *     trash. …"
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · Unit · 2 Might
 *
 * Q: I Switcheroo my own Mundo with my own Traveling Merchant. Does Mundo "refresh" to 2 + cards in trash?
 * A: No dynamic re-swap. Switcheroo snapshots X = (Mundo's Might at resolution − Merchant's) and applies fixed
 *    continuous modifiers: Merchant +X, Mundo −X, for the turn. Cards hitting the trash afterwards raise Mundo's Might
 *    through his passive, but the Switcheroo modifiers stay at their snapshotted values. (Both units may be yours.)
 * Rules: 433 (Swap Might = ± the difference, computed once), 522 (Mundo's static keeps applying), 317 (expires at
 *        end of turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const DR_MUNDO = "ogn-109-298";
const TRAVELING_MERCHANT = "ogn-185-298";
const EN_GARDE = "ogn-046-298"; // [1] Reaction — a cheap second spell to put one more card in the trash afterwards

/**
 * P1's turn. P1 holds bf1 with Dr. Mundo AND Traveling Merchant; P1's trash already has 2 cards (Mundo = 6 + 2 = 8).
 * P1: Switcheroo + En Garde in hand, exactly [3] + chaos×2; a Pal in base as En Garde's later target.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DR_MUNDO, "mundo")
    .unit(P1, "bf1", TRAVELING_MERCHANT, "merchant")
    .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
    .trash(P1, { might: 1, name: "Junk A" }, "junkA")
    .trash(P1, { might: 1, name: "Junk B" }, "junkB")
    .hand(P1, SWITCHEROO, "switcheroo")
    .hand(P1, EN_GARDE, "engarde")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker");
}

async function swapped(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("switcheroo", { targets: ["mundo", "merchant"] });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
  // While Switcheroo is on the chain it is not in the trash yet: Mundo is still 8 at resolution time.
  expect(game.zoneOf("switcheroo")).toBe("chain");
  expect(game.state("mundo").might).toBe(8);
  await game.settle();
  expect(game.zoneOf("switcheroo")).toBe("trash");
  return game;
}

describe("Ruling 9f74f7ec118e20e6 — Switcheroo on my own Mundo and Merchant snapshots the difference; Mundo's passive keeps counting", () => {
  test("premise: with 2 cards in P1's trash Mundo is 6 + 2 = 8, the Merchant 2; both are P1's own units at the same battlefield and Switcheroo accepts the pair", async () => {
    const game = await board().build();
    expect(game.p1.trash()).toHaveLength(2);
    expect(game.state("mundo")).toMatchObject({ baseMight: 6, might: 8 });
    expect(game.state("merchant").might).toBe(2);
    const pairs = game.p1.option("cast", "switcheroo")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toContainEqual(["mundo", "merchant"]);
  });

  test("on resolution X = 8 − 2 = 6: Merchant gets a fixed +6 (→ 8), Mundo a fixed −6; Switcheroo itself then lands in the trash (3 cards) so Mundo reads 6 + 3 − 6 = 3 — NOT re-swapped down to 2", async () => {
    const game = await swapped();
    expect(game.p1.trash()).toHaveLength(3);
    expect(game.state("merchant")).toMatchObject({ might: 8, mightModifier: 6 });
    expect(game.state("mundo").mightModifier).toBe(-6);
    expect(game.state("mundo").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("more cards to the trash later in the turn (En Garde on Pal resolves → 4 in trash): Mundo climbs to 4 while the Merchant stays at exactly 8 — the modifiers are snapshots, not a live link", async () => {
    const game = await swapped();
    await game.p1.cast("engarde", { targets: "pal" });
    await game.settle();
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.p1.trash()).toHaveLength(4);
    expect(game.state("mundo")).toMatchObject({ might: 4, mightModifier: -6 });
    expect(game.state("merchant")).toMatchObject({ might: 8, mightModifier: 6 });
  });

  test("'this turn': after the turn passes both modifiers expire — Mundo is 6 + 4 = 10, the Merchant 2", async () => {
    const game = await swapped();
    await game.p1.cast("engarde", { targets: "pal" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mundo")).toMatchObject({ might: 10, mightModifier: 0 });
    expect(game.state("merchant")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
