/**
 * Ruling 3a0e59fea5557fda — Hard Bargain (SFD-136 → sfd-136-221) · [Reaction] · [2]
 *   "[Repeat] [2] — Counter a spell unless its controller pays [2]."
 *
 * Q: Can I pay Repeat on Hard Bargain to counter two DIFFERENT spells on the same chain?
 * A: Yes. The choices made for the additional execution need not match the ones made for the initial
 *    execution, so the first execution may counter one spell and the Repeat execution another.
 * Rules: 820 / 746.1.d ([Repeat] = an additional cost that makes the same item execute again),
 *        355.16 (choices for an additional execution are made independently), 425.1 (a countered spell
 *        does nothing and goes to the trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";
const VOID_SEEKER = "ogn-024-298"; // [Action] [3][fury] — Deal 4 to a unit at a battlefield. Draw 1.
const STUPEFY = "ogn-095-298"; // [Reaction] [1] — Give a unit -1 Might this turn. Draw 1.

/**
 * P2's turn. P1 holds bf1 with a 6-Might Warden. P2 has EXACTLY the two spells' costs (so they cannot
 * afford either "unless its controller pays [2]" ransom afterwards). P1 has exactly [4] = Hard Bargain + Repeat.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 1 } })
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Warden" }, "warden")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P1, HARD_BARGAIN, "hb");
}

/** P2 stacks both spells on one chain; P1 answers with a Repeat-paid Hard Bargain naming BOTH of them. */
async function twoSpellsThenBargain(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("seeker", { targets: "warden" });
  await game.p2.cast("stupefy", { targets: "warden" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "stupefy"]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  await game.p1.cast("hb", { repeat: 1, targets: ["stupefy", "seeker"] });
  expect(game.p1.energy()).toBe(0); // [2] base + [2] Repeat, paid up front
  return game;
}

describe("Ruling 3a0e59fea5557fda — one Repeat-paid Hard Bargain counters two different spells on the chain", () => {
  test("both executions may name different spells: Hard Bargain is a SINGLE chain item that took two targets", async () => {
    const game = await twoSpellsThenBargain();
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "stupefy", "hb"]);
    expect(game.chain().filter((c) => c.cardId === "hb")).toHaveLength(1); // Repeat is not a second copy
  });

  test("ruling: it resolves and counters BOTH — neither spell does anything to the Warden and both go to the trash", async () => {
    const game = await twoSpellsThenBargain();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("warden")).toMatchObject({ damage: 0, might: 6, mightModifier: 0 });
    expect(game.p2.hand()).toEqual([]); // neither "Draw 1" happened
    expect(game.violations()).toEqual([]);
  });

  test("contrast — WITHOUT paying Repeat only one spell can be named; the other resolves normally", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "warden" });
    await game.p2.cast("stupefy", { targets: "warden" });
    await game.p2.passPriority();
    await game.p1.cast("hb", { targets: "stupefy" });
    expect(game.p1.energy()).toBe(2); // only the base [2]
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("warden")).toMatchObject({ damage: 4, mightModifier: 0 }); // Void Seeker got through
    expect(game.p2.hand()).toHaveLength(1); // Void Seeker's draw only
  });

  test("the two executions name two DISTINCT spells: both orderings are offered, naming the same spell twice is not", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "warden" });
    await game.p2.cast("stupefy", { targets: "warden" });
    await game.p2.passPriority();
    const variants = (game.p1.option("cast", "hb")?.variants ?? []).filter((v) => (v.params as { repeatCount?: number }).repeatCount === 1);
    const pairs = variants.map((v) => JSON.stringify((v.params as { targets?: unknown }).targets));
    expect(pairs).toContain(JSON.stringify(["seeker", "stupefy"]));
    expect(pairs).toContain(JSON.stringify(["stupefy", "seeker"]));
    expect(pairs).not.toContain(JSON.stringify(["stupefy", "stupefy"]));
    const both = await game.p1.try((p) => p.cast("hb", { repeat: 1, targets: ["stupefy", "stupefy"] }));
    expect(both.ok).toBe(false);
  });
});
