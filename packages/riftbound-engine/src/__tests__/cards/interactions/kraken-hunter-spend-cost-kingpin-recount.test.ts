/**
 * Interaction: Kraken Hunter (ogn-150-298, 3 + [body][body], 5 Might)
 *     "[Accelerate] [Assault] As you play me, you may spend any number of buffs as an additional cost.
 *      Reduce my cost by [body] for each buff you spend."
 *   × Sett, Kingpin (ogn-240-298, 5 Might) "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."
 *   × Cithria of Cloudfield (ogn-139-298, 1 Might) "When you play another unit, buff me."
 *
 * Rules: 745 / 745.1 (spending counters = removing them), 745.2 / 702.2.b.2 (you may only spend a
 * counter on an object YOU control), 702.2.b (spending a buff removes the counter), 357.2.a / 356
 * (additional costs are paid during cost payment), 426.1.b (Buff places a counter if the unit has
 * none), 703 (a static ability recounts continuously).
 *
 * Board: at bf1 P1 has Sett Kingpin (5), a buffed Cithria (1+1) and a buffed vanilla Y (1+1); P2 has a
 * buffed unit there too. Kingpin = 5 + 2 = 7. P1 has 3 energy and NO body power; Kraken Hunter in hand.
 * Q (a) May P1 spend P2's unit's buff toward the cost?
 *   (b) Spending Cithria's and Y's buffs: what does Kraken Hunter cost, and what is Kingpin's Might once
 *       costs are paid but before anything else resolves?
 *   (c) Cithria's "play another unit → buff me" resolves — can she be re-buffed; Kingpin's final Might;
 *       counter inventory at each step?
 * Expected: (a) No — never offered, rejected if forced. (b) 3 energy + 0 power; counters Cithria 0 / Y 0
 * → Kingpin 5, Cithria 1, Y 1. (c) Yes: Cithria 1 counter (2 Might), Y 0, Kraken Hunter 0 → Kingpin 6.
 * P1-side buff counters: 2 → 0 → 1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KRAKEN_HUNTER = "ogn-150-298";
const SETT_KINGPIN = "ogn-240-298";
const CITHRIA = "ogn-139-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3 }) // exactly the energy; the [body][body] must come from spent buffs
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT_KINGPIN, "sett")
    .unit(P1, "bf1", CITHRIA, "cith", { buffed: true })
    .unit(P1, "bf1", { might: 1, name: "Elder Y" }, "y", { buffed: true })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe", { buffed: true })
    .hand(P1, KRAKEN_HUNTER, "kh");
}

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Every set of buff-bearers the play option offers to spend, flattened to card ids. */
function spendableOffered(game: G): string[] {
  const field = game.p1.option("play", "kh")?.fields.find((f) => f.name === "spentBuffIds");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]) as string[]))];
}

/** Buff counters on P1's side of the board. */
function p1BuffCount(game: G): number {
  return game.p1.units().filter((u) => game.state(u).isBuffed).length;
}

describe("Kraken Hunter spend-buff cost × Sett, Kingpin recount × Cithria re-buff", () => {
  test("starting position: Kingpin 5 + 2 buffed friendly units here = 7 (P2's buffed unit does not count); Cithria 2, Y 2", async () => {
    const game = await board().build();
    expect(game.state("sett").might).toBe(7);
    expect(game.state("cith")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("y")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("foe")).toMatchObject({ isBuffed: true, might: 3 });
    expect(p1BuffCount(game)).toBe(2);
  });

  // ---------------------------------------------------------------- (a)
  test("(a) P2's buff is NOT spendable (745.2 / 702.2.b.2): only Cithria and Y are offered as buffs to spend", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "kh")).toBe(true);
    const offered = spendableOffered(game);
    expect(offered.sort()).toEqual(["cith", "y"]);
    expect(offered).not.toContain("foe");
  });

  test("(a) forcing the enemy buff into the payment is rejected — via the menu and via the raw move; the enemy keeps its buff", async () => {
    const game = await board().build();
    await expect(game.p1.play("kh", { params: { spentBuffIds: ["foe", "cith"] } })).rejects.toThrow();
    const raw = await game.p1.try((p) =>
      p.do("playUnit", { cardId: "kh", location: "base", paidAdditionalCost: true, playerId: P1, spentBuffIds: ["foe", "cith"] }),
    );
    expect(raw.ok).toBe(false);
    expect(game.zoneOf("kh")).toBe("hand");
    expect(game.state("foe").isBuffed).toBe(true);
    expect(game.p1.energy()).toBe(3);
  });

  test("(a) with no body power, one friendly buff alone cannot cover [body][body]: without Y's buff the play is not legal at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SETT_KINGPIN, "sett")
      .unit(P1, "bf1", CITHRIA, "cith", { buffed: true })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe", { buffed: true }) // enemy buff cannot make up the difference
      .hand(P1, KRAKEN_HUNTER, "kh")
      .build();
    expect(game.p1.can("play", "kh")).toBe(false);
  });

  // ---------------------------------------------------------------- (b)
  test("(b) spending both friendly buffs: Kraken Hunter costs 3 energy + 0 power; both counters are removed as the cost is paid", async () => {
    const game = await board().build();
    await game.p1.play("kh", { params: { spentBuffIds: ["cith", "y"] } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("cith").isBuffed).toBe(false);
    expect(game.state("y").isBuffed).toBe(false);
    expect(game.state("foe").isBuffed).toBe(true); // untouched
    expect(p1BuffCount(game)).toBe(0);
  });

  test("(b) right after costs are paid (Cithria's trigger still pending) Kingpin's static recounts: 0 buffed friendly units → 5; Cithria 1, Y 1", async () => {
    const game = await board().build();
    await game.p1.play("kh", { params: { spentBuffIds: ["cith", "y"] } });
    // The permanent has become an object (359.2); Cithria's play trigger waits on the chain.
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([["cith", true]]);
    expect(game.state("sett").might).toBe(5);
    expect(game.state("cith")).toMatchObject({ isBuffed: false, might: 1 });
    expect(game.state("y")).toMatchObject({ isBuffed: false, might: 1 });
    expect(game.state("kh")).toMatchObject({ isBuffed: false, might: 5 });
  });

  // ---------------------------------------------------------------- (c)
  test("(c) Cithria's 'play another unit → buff me' re-buffs her the same turn her buff was spent (702.2.b + 426.1.b): Cithria 1 counter / 2 Might", async () => {
    const game = await board().build();
    await game.p1.play("kh", { params: { spentBuffIds: ["cith", "y"] } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("cith")).toMatchObject({ isBuffed: true, might: 2 });
  });

  test("(c) final inventory: Cithria 1, Y 0, Kingpin 0, Kraken Hunter 0 → Kingpin 5 + 1 = 6; Y at printed 1; P1-side counters went 2 → 0 → 1", async () => {
    const game = await board().build();
    const counts: number[] = [p1BuffCount(game)];
    await game.p1.play("kh", { params: { spentBuffIds: ["cith", "y"] } });
    counts.push(p1BuffCount(game));
    await game.settle();
    counts.push(p1BuffCount(game));
    expect(counts).toEqual([2, 0, 1]);
    expect(game.state("cith").isBuffed).toBe(true);
    expect(game.state("y")).toMatchObject({ isBuffed: false, might: 1 });
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 6 });
    expect(game.state("kh")).toMatchObject({ isBuffed: false, might: 5, zone: "base" });
    expect(game.state("foe")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });
});
