/**
 * Ruling 0e6f0bb757ad8a6e — Tasty Faefolk (OGN-075 → ogn-075-298) · Unit · Calm · 7 · 6 Might
 *   "[Accelerate] … [Deathknell] — Channel 2 runes exhausted and draw 1. (When I die, get the effect.)"
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) Gear "[Hidden] … If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can I get Faefolk's Deathknell AND save it with Zhonya's?
 * A: No. Zhonya's is a replacement effect: the unit never dies, so Deathknell (which triggers only after
 *    the unit dies) never triggers. It is one or the other.
 * Rules: 370.1.a.1 (a replaced event never happened), 438 (replacement), Deathknell keyword.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TASTY_FAEFOLK = "ogn-075-298";
const ZHONYAS_HOURGLASS = "ogn-077-298";

/** P2's turn. P1 holds bf1 with Tasty Faefolk (6); optionally a face-up Zhonya's in P1's base. P2's 7-Might Bruiser attacks from base. */
function board(opts: { zhonyas: boolean }) {
  const s = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TASTY_FAEFOLK, "faefolk")
    .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser");
  return opts.zhonyas ? s.gear(P1, ZHONYAS_HOURGLASS, "zh") : s;
}

describe("Ruling 0e6f0bb757ad8a6e — Zhonya's saves Faefolk INSTEAD of it dying, so Deathknell never triggers", () => {
  test("control (no Zhonya's): Bruiser (7) kills Faefolk (6) in combat → Deathknell: P1 channels 2 runes exhausted and draws 1", async () => {
    const game = await board({ zhonyas: false }).build();
    const hand = game.p1.hand().length;
    const runeDeck = game.p1.runeDeck().length;
    expect(game.p1.runes()).toHaveLength(0);
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // channeled exhausted
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 2);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("with Zhonya's out: the lethal combat damage is replaced — Zhonya's is killed instead; Faefolk is healed, exhausted and recalled to base (never dies, never in trash)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("faefolk")).toBe("base");
    expect(game.state("faefolk").damage).toBe(0);
    expect(game.state("faefolk").isExhausted).toBe(true);
    expect(game.p1.trash()).not.toContain("faefolk");
    // Bruiser took Faefolk's 6 (< 7) and is left alone at bf1 → conquers.
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("...and because the death never happened, Deathknell did NOT trigger: no runes channeled, no card drawn, nothing of Faefolk's on the chain", async () => {
    const game = await board({ zhonyas: true }).build();
    const hand = game.p1.hand().length;
    const runeDeck = game.p1.runeDeck().length;
    await game.p2.move("bruiser", "bf1");
    // Step through manually so a Deathknell chain item could be observed if it (wrongly) appeared.
    let sawFaefolkTrigger = false;
    for (let i = 0; i < 20; i++) {
      if (game.chain().some((c) => c.cardId === "faefolk" && c.triggered)) {
        sawFaefolkTrigger = true;
      }
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await game.settle({ maxSteps: 1 });
    }
    await game.settle();
    expect(sawFaefolkTrigger).toBe(false);
    expect(game.zoneOf("faefolk")).toBe("base");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.violations()).toEqual([]);
  });
});
