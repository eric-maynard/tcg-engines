/**
 * Ruling 0a4fd10ce0c8b530 — Lonely Poro (SFD-036 → sfd-036-221) · Unit · Calm · 2 · 2 Might
 *   "[Deathknell] — If I died alone, draw 1."
 *   × Singularity (OGN-105 → ogn-105-298) · Spell · Mind · [6][mind][mind] — "Deal 6 to each of up to two units."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · Hidden
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Outside a showdown, if they Singularity my Lonely Poro, can I chain (hidden) Zhonya's to the Deathknell?
 * A: You CAN react — the Deathknell trigger on the chain closes the state and a hidden Zhonya's plays as a
 *    Reaction. But it will NOT save the Poro: Zhonya's is a replacement effect that must already be active when
 *    the death happens; by the time Deathknell is on the chain the Poro is already in the trash. LIFO: Zhonya's
 *    resolves (just enters play), then Deathknell resolves and you draw 1 (it died alone).
 * Rules: 808/428.1.a.1.b (Deathknell goes on the chain as the unit dies), 811 (Hidden → react for [0]),
 *        369–370 (replacement effects apply only to events that have not yet happened), LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LONELY_PORO = "sfd-036-221";
const SINGULARITY = "ogn-105-298";
const ZHONYAS = "ogn-077-298";

/**
 * P2's turn (turn 3), no showdown. P1 controls bf1 where the Poro stands ALONE with Zhonya's hidden there
 * (hidden on an earlier turn). P2 holds Singularity with exactly [6] + 2 mind.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .hand(P2, SINGULARITY, "sing");
}

/** P2 resolves Singularity on the Poro (both pass). */
async function singularityKillsPoro(game: Game): Promise<void> {
  await game.p2.cast("sing", { targets: ["poro"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("sing")).toBe("trash");
}

/** Pass priority until it is P1's to act on the chain (bounded). */
async function untilP1HasPriority(game: Game): Promise<void> {
  for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
    await game.acting().passPriority();
  }
  expect(game.actingSeat()).toBe(P1);
}

describe("Ruling 0a4fd10ce0c8b530 — Zhonya's chained to Lonely Poro's Deathknell: legal, but too late to save it", () => {
  test("Singularity kills the Poro outright: it is ALREADY in the trash while its Deathknell trigger waits on the chain (state Closed, no showdown)", async () => {
    const game = await board().build();
    await singularityKillsPoro(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    // The hidden Hourglass is still P1's facedown card at bf1 (control is not re-evaluated mid-chain).
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
  });

  test("P1 may flip the hidden Zhonya's for [0] in response to the Deathknell trigger (P1 gets priority on the Closed chain and 'reveal' is legal)", async () => {
    const game = await board().build();
    await singularityKillsPoro(game);
    await untilP1HasPriority(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.p1.energy()).toBe(0); // [0] from hidden
    expect(game.state("zh").isHidden).toBe(false);
  });

  test("Zhonya's, played first (LIFO — a gear completes its play at once), simply ENTERS PLAY: nothing to replace, the Poro stays dead and the Deathknell is still pending; then Deathknell resolves and P1 draws 1", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p1Deck = game.p1.deck().length;
    await singularityKillsPoro(game);
    await untilP1HasPriority(game);
    await game.p1.reveal("zh");
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh")); // in play as P1's gear, NOT killed "instead"
    expect(game.p1.gear()).toContain("zh");
    expect(game.zoneOf("poro")).toBe("trash"); // not rescued retroactively
    expect(game.p1.hand()).toHaveLength(p1Hand); // Deathknell has not resolved yet
    expect(game.chain().map((c) => c.cardId)).toEqual(["poro"]);
    await game.settle(); // both pass → Deathknell resolves: died alone → draw 1
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p1.deck()).toHaveLength(p1Deck - 1);
    expect(game.p1.gear()).toContain("zh"); // still around afterwards
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — timing is everything: had Zhonya's been face up BEFORE Singularity resolved, it replaces the death (Hourglass killed instead; Poro healed, exhausted, recalled to base) and no Deathknell fires", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LONELY_PORO, "poro")
      .gear(P1, ZHONYAS, "zh")
      .hand(P2, SINGULARITY, "sing")
      .build();
    const p1Hand = game.p1.hand().length;
    await singularityKillsPoro(game);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.hand()).toHaveLength(p1Hand); // it never died → no Deathknell draw
    expect(game.chain()).toEqual([]);
  });
});
