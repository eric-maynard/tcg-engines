/**
 * Ruling 2f8a262f3049f587 — Cithria of Cloudfield (OGN-139 → ogn-139-298) · Unit · Body · 2 · 1 Might
 *   "When you play another unit, buff me."
 *   × Kraken Hunter (OGN-150 → ogn-150-298) · Unit · Body · 3 + [body][body] · 5 Might
 *   "…As you play me, you may spend any number of buffs as an additional cost. Reduce my cost by [body] for each
 *    buff you spend."
 *
 * Q: Can the buff Cithria gets from playing Kraken Hunter be spent to pay Kraken Hunter's cost?
 * A: No. Costs are paid as Kraken Hunter is played; Cithria's "when you play" trigger only happens afterwards, so
 *    that buff comes too late. If Cithria ALREADY had a buff, that one can be spent — and Kraken Hunter's arrival
 *    then buffs her again.
 * Rules: 355 (costs paid during the play process), 383 / 419.4 (play triggers after the card is played), 560.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CITHRIA = "ogn-139-298";
const KRAKEN_HUNTER = "ogn-150-298";

describe("Ruling 2f8a262f3049f587 — Cithria's play-trigger buff arrives too late to pay for Kraken Hunter", () => {
  test("unbuffed Cithria + only 3 energy / 1 [body]: Kraken Hunter is NOT playable (the future buff can't be pre-spent)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .unit(P1, "base", CITHRIA, "cithria")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, KRAKEN_HUNTER, "kh")
      .build();
    expect(game.state("cithria").isBuffed).toBe(false);
    expect(game.p1.can("play", "kh")).toBe(false);
    expect(game.p1.option("play", "kh")).toBeUndefined();
    const r = await game.p1.try((p) => p.play("kh"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("kh")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
  });

  test("sequence with the full cost (3 + [body][body]): the cost is paid first, THEN Cithria's trigger buffs her", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 2 } })
      .unit(P1, "base", CITHRIA, "cithria")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, KRAKEN_HUNTER, "kh")
      .build();
    await game.p1.play("kh");
    // Cost fully paid at play time — no buff existed to spend.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("kh")).toBe("base");
    await game.settle();
    expect(game.state("cithria").isBuffed).toBe(true);
    expect(game.state("cithria").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: an ALREADY-buffed Cithria can have that buff spent (3 energy + 1 [body] suffices), and Kraken Hunter's arrival re-buffs her", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .unit(P1, "base", CITHRIA, "cithria", { buffed: true })
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, KRAKEN_HUNTER, "kh")
      .build();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.p1.can("play", "kh")).toBe(true);
    const opt = game.p1.option("play", "kh");
    expect(opt?.variants.every((v) => JSON.stringify(v.params.spentBuffIds ?? []) === JSON.stringify(["cithria"]))).toBe(true);
    await game.p1.play("kh");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // The pre-existing buff was spent as the cost, then "When you play another unit, buff me" gave her a fresh one.
    expect(game.state("cithria").isBuffed).toBe(true);
    expect(game.state("cithria").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
