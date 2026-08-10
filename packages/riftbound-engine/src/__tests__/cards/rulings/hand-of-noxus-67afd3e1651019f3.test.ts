/**
 * Ruling 67afd3e1651019f3 — Hand of Noxus (Darius legend, OGN-253 → ogn-253-298)
 *     "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Get the effect if you've played a card this turn.)"
 *   × Cleave (OGN-004 → ogn-004-298) · [1] spell   × Hard Bargain (SFD-136 → sfd-136-221) · [Reaction] "Counter a spell unless
 *     its controller pays [2]." (not repeated)
 *
 * Q: I play Cleave, opponent Hard Bargains it. Can I pay 1 floating energy plus Darius's [Add] [1] to meet the [2]?
 * A: Yes. The [2] is paid during Hard Bargain's resolution; an [Add] ability with Reaction may be activated whenever a
 *    resolving spell asks for a payment and it resolves immediately (429.3 / 429.3.a). Legion is satisfied — Cleave was
 *    played this turn. Exhaust Darius for [1], add your other [1], pay [2]: Cleave is not countered.
 * Rules: 429.3, 429.3.a ([Add] during payment), 819 (Legion), 359 (pay-unless on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";
const CLEAVE = "ogn-004-298";
const HARD_BARGAIN = "sfd-136-221";

/** P1's turn, Darius legend ready. P1: Cleave + exactly [2] (Cleave's [1] + ONE floating). P2: Hard Bargain + exactly [2] (no Repeat). */
function board() {
  return scenario()
    .legend(P1, HAND_OF_NOXUS, "darius")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, HARD_BARGAIN, "hb");
}

/** Cleave (on Ally) then a non-repeated Hard Bargain on it; P2 passes → P1 holds the last priority before resolution. */
async function cleaveBargained(game: Game): Promise<void> {
  expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(0);
  await game.p1.cast("cleave", { targets: "ally" });
  expect(game.p1.energy()).toBe(1); // one floating energy left
  expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // Legion condition now met
  await game.p1.passPriority();
  await game.p2.cast("hb", { targets: "cleave" });
  expect(game.p2.energy()).toBe(0); // base cost only — not repeated
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "hb"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling 67afd3e1651019f3 — Darius's [Add] [1] can help pay Hard Bargain's [2] and save Cleave", () => {
  test("Legion is live once Cleave has been played: Darius's Reaction [Add] ability is activatable while Hard Bargain sits on the chain, and it resolves immediately (+1 energy, no chain item)", async () => {
    const game = await board().build();
    await cleaveBargained(game);
    expect(game.p1.can("activate", "darius")).toBe(true);
    await game.p1.activate("darius");
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "hb"]); // [Add] abilities don't use the chain
  });

  test("with [2] in pool when Hard Bargain resolves, P1 is asked to pay, pays, and Cleave resolves normally (Ally gets Assault 3); everything spent", async () => {
    const game = await board().build();
    await cleaveBargained(game);
    await game.p1.activate("darius"); // (activated in the response window here; the ruling's mid-resolution timing is the next test)
    await game.p1.passPriority();
    if (game.chain().some((c) => c.cardId === "hb")) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "hb" } });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.violations()).toEqual([]);
  });

  // The ruling's exact line: P1 does NOT pre-float the energy; when Hard Bargain resolves and demands [2] with only [1] in
  // the pool, P1 activates Darius DURING that payment (429.3 / 429.3.a), then pays. Expected: the pay prompt is surfaced
  // with Darius's [Add] ability among its available actions; after activating, "yes" is legal and Cleave survives.
  test("ruling 67afd3e1651019f3 — the pay prompt is raised even with [1] short and Darius's [Add] can be activated during it", async () => {
    const game = await board().build();
    await cleaveBargained(game);
    await game.p1.passPriority(); // all passed → Hard Bargain resolves and asks P1 for [2]
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "hb" } });
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:darius"))).toBe(true);
    await game.p1.activate("darius");
    expect(game.p1.energy()).toBe(2);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });
});
