/**
 * Ruling 8877e1a8101664c9 — Karma, Channeler (OGN-235 → ogn-235-298) · Champion · Order · 6 · 6 Might (buffed → 7)
 *   × Smoke Screen (OGN-093 → ogn-093-298, Reaction, 2+[mind]) "Give a unit -4 [Might] this turn, to a minimum of 1."
 *   × Falling Star (OGN-029 → ogn-029-298, 2+[fury][fury]) "Deal 3 to a unit. Deal 3 to a unit."
 *   × The Boss (Sett legend, ogn-269-298) "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and
 *     spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Buffed Karma (7) has been Smoke Screened (→ 3). Falling Star deals 3 to her twice; The Boss saves her from the first
 *    3 — does she die to the second?
 * A: Yes. First 3: she would die; The Boss replaces it (heal, exhaust, recall, buff spent) — now she is 6 − 4 = 2 Might in
 *    base with 0 damage. Second 3: 3 ≥ 2 → she dies (no buff left to save her). If The Boss is NOT used she dies to the
 *    first 3 and the second instruction has no valid target. Either way she dies exactly once.
 * Rules: 372 / The Boss (optional costed die-replacement), 359.3.e (a later instruction whose target is gone is skipped),
 *        520 (damage ≥ Might → dies), 702.2.b (spending a buff removes its +1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARMA = "ogn-235-298";
const SMOKE_SCREEN = "ogn-093-298";
const FALLING_STAR = "ogn-029-298";
const THE_BOSS = "ogn-269-298";

/**
 * P2's turn. P1 (Sett — The Boss, ready, 1 spare [order] for the [rainbow]) holds bf1 with a BUFFED Karma (7). P2 has
 * exactly Smoke Screen (2+[mind]) + Falling Star (2+[fury][fury]) and the resources for both.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { order: 1 } })
    .resources(P2, { energy: 4, power: { fury: 2, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", KARMA, "karma", { buffed: true })
    .hand(P2, SMOKE_SCREEN, "smoke")
    .hand(P2, FALLING_STAR, "star");
}

/** Smoke Screen resolves on Karma (7 → 3); then Falling Star is cast with BOTH instructions on Karma and both pass until The Boss asks. */
async function smokeThenDoubleStar(): Promise<Game> {
  const game = await board().build();
  expect(game.state("karma")).toMatchObject({ isBuffed: true, might: 7 });
  await game.p2.cast("smoke", { targets: "karma" });
  await game.settle();
  expect(game.state("karma").might).toBe(3);
  await game.p2.cast("star", { targets: ["karma", "karma"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } }); // 2+[fury][fury]
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["karma", "karma"] })]);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 8877e1a8101664c9 — The Boss saves Smoke-Screened Karma from Falling Star's first 3, the second 3 kills her", () => {
  test("the first 'Deal 3' would kill Karma (3 Might): The Boss's optional replacement is asked of P1 (yes/no sourced from the legend), mid-resolution, Karma not yet dead", async () => {
    const game = await smokeThenDoubleStar();
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.zoneOf("karma")).toBe("battlefield-bf1");
    expect(game.zoneOf("star")).toBe("chain"); // Falling Star is still resolving
  });

  test("YES: Karma is healed, un-buffed, exhausted and recalled (2 Might, 0 damage in base for an instant) — then the SECOND 'Deal 3' hits her there for 3 ≥ 2 and she dies; The Boss is exhausted and the [rainbow] paid; she died exactly once", async () => {
    const game = await smokeThenDoubleStar();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("order")).toBe(0);
    expect(game.zoneOf("karma")).toBe("trash"); // the second 3 killed the 2-Might, unbuffed Karma
    expect(game.p1.trash().filter((c) => c === "karma")).toHaveLength(1);
    // Nobody is asked about The Boss a second time (no buff left to spend).
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("NO: Karma dies to the first 3; the second 'Deal 3 to a unit' has no valid target and is skipped — no re-target prompt, The Boss stays ready, [order] unspent", async () => {
    const game = await smokeThenDoubleStar();
    await game.p1.no();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(d.kind === "pick" && d.seat === P2).toBe(false); // never asked to pick a new unit for the second 3
      // DESIGN.md §Pausing inside a resolving item — declining the shield leaves
      // Falling Star suspended at the instance boundary; continue it.
      if (d.kind === "action" && d.context === "procedure") {
        await game.resume();
        continue;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("karma")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p1.power("order")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("intermediate fact: with only ONE 'Deal 3' aimed at Karma (the other at a P2 Dummy), The Boss's save leaves her ALIVE in base — exhausted, unbuffed, 2 Might, 0 damage", async () => {
    const game = await board().unit(P2, "base", { might: 5, name: "Dummy" }, "dummy").build();
    await game.p2.cast("smoke", { targets: "karma" });
    await game.settle();
    await game.p2.cast("star", { targets: ["karma", "dummy"] });
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("karma")).toBe("base");
    expect(game.state("karma")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 }); // 6 − 4, buff spent
    expect(game.state("dummy").damage).toBe(3);
    expect(game.state("boss").isExhausted).toBe(true);
  });
});
