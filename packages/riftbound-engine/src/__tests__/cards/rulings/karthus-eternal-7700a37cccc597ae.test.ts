/**
 * Ruling 7700a37cccc597ae — Karthus, Eternal (OGN-236 → ogn-236-298) · Unit · [3][order] · 3 Might
 *     "Your [Deathknell] effects trigger an additional time."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *   × Hidden Blade (OGN-213 → ogn-213-298) — used to do the killing.
 *
 * Q: Do multiple Karthus stack, so a Deathknell can trigger more than twice?
 * A: Yes. Each Karthus adds one additional trigger: base 1, +1 per Karthus. Two Karthus ⇒ the Deathknell
 *    triggers three times.
 * Rules: 733 ([Deathknell] = "when I die, get the effect"), 393 (each applicable continuous effect that adds a
 *        trigger applies), 383.2 (each instance is its own chain item).
 */
import { describe, expect, test } from "bun:test";
import type { ScenarioBuilder } from "../../../harness";
import { P1, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn with exactly [2][order]. The Sentry holds bf1 alongside a Holder; `karthusCount` copies of Karthus sit in base. */
function board(karthusCount: number): ScenarioBuilder {
  let s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, HIDDEN_BLADE, "blade");
  for (let i = 0; i < karthusCount; i++) {
    s = s.unit(P1, "base", KARTHUS, `karthus${i}`);
  }
  return s;
}

/** Kill the Sentry with Hidden Blade and stop with the Deathknell items still on the chain. */
async function killSentry(karthusCount: number) {
  const game = await board(karthusCount).build();
  const deck = game.p1.deck().length;
  await game.p1.cast("blade", { targets: "sentry" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Hidden Blade resolves: the Sentry dies (and P1 draws its 2)
  return { deck, game };
}

describe("Ruling 7700a37cccc597ae — Karthus stacks: one extra Deathknell trigger per copy", () => {
  test("baseline (no Karthus): the Sentry's [Deathknell] makes exactly ONE chain item and draws 1", async () => {
    const { deck, game } = await killSentry(0);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry"]);
    await game.settle();
    expect(deck - game.p1.deck().length).toBe(3); // 2 from Hidden Blade + 1 Deathknell
  });

  test("one Karthus: the Deathknell triggers TWICE — two chain items, two draws", async () => {
    const { deck, game } = await killSentry(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry", "sentry"]);
    await game.settle();
    expect(deck - game.p1.deck().length).toBe(4); // 2 + 2
  });

  test("ruling: TWO Karthus stack — the Deathknell triggers three times (1 base + 1 per Karthus), three draws", async () => {
    const { deck, game } = await killSentry(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry", "sentry", "sentry"]);
    await game.settle();
    expect(deck - game.p1.deck().length).toBe(5); // 2 + 3
    expect(game.violations()).toEqual([]);
  });
});
