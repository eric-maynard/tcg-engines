/**
 * Ruling 76b6056d1f5b4189 — Rek'Sai, Swarm Queen (SFD-170 → sfd-170-221) · Champion Unit · Order · [5][order] · 5 Might
 *   "When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play it. If it is a unit,
 *    you may play it here. Recycle the rest."
 *   × Shipyard Skulker (ogn-175-298) · [3] · 3 Might — the revealed card
 *
 * Q: Do I have to pay the selected card's cost when Rek'Sai attacks (and I "play it")?
 * A (riftjudge): No — an ability that says "play it" from a non-hand zone without "pay its cost" plays it for free.
 *
 * RULING-CONFLICT: riftjudge 76b6056d1f5b4189 says the revealed card is played without paying its Energy/Power; CR 419.3.b
 * ("Treat all steps of Play as normal, except as noted by the game effect") + 356.1.b (costs are only zeroed when the effect
 * says "ignoring its cost" — this one does not) say the full cost is paid, and the green card suite (sfd-170-221.test.ts,
 * ruling 7791d327d0c1f1be) pins that — engine follows CR. This file asserts the engine/CR behaviour for the asked scenario.
 * Rules: 419.3.a–c, 356.1.b, 357 (Pay Costs), 383.4.e.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REKSAI_SWARM_QUEEN = "sfd-170-221";
const SKULKER = "ogn-175-298";

/** P1's turn with `energy` floating. P2 holds bf1 with a Wall (7). Rek'Sai ready in base; deck: Skulker, Skulker, Skulker. */
function board(energy: number) {
  return scenario()
    .turn(3)
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", REKSAI_SWARM_QUEEN, "reksai")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"]);
}

const isRevealPick = (d: Decision | null): d is PickDecision => d?.kind === "pick" && /revealed/i.test(d.prompt);

/** Attack bf1, accept the reveal, pass priority until the reveal-and-pick prompt (or an open decision) is reached. */
async function attackAndReveal(energy: number): Promise<Game> {
  const game = await board(energy).build();
  await game.p1.move("reksai", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai" }, timing: "FIN" });
  await game.p1.yes();
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  return game;
}

/** After picking a card: answer destination picks with `dest`, pass chain priority, until the showdown/main decision returns. */
async function finishPlay(game: Game, dest: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      const want = d.options.find((o) => o.key === dest || o.key === `battlefield-${dest}`)?.key ?? d.options[0]!.key;
      await game.seat(d.seat).pick(want);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      return;
    }
  }
}

describe("Ruling 76b6056d1f5b4189 (RULING-CONFLICT, engine follows CR 419.3.b) — the card Rek'Sai reveals is played AT COST", () => {
  test("with [3] available: the top 2 are revealed and both Skulkers are offered (declinable pick)", async () => {
    const game = await attackAndReveal(3);
    const d = game.decision();
    expect(isRevealPick(d)).toBe(true);
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect((d as PickDecision).options.map((o) => o.card ?? o.key).sort()).toEqual(["d1", "d2"]);
    expect(game.p1.energy()).toBe(3); // nothing paid yet
  });

  test("picking d1: it is banished then PLAYED — and its [3] IS paid (3 → 0); it lands on the board exhausted, d2 is recycled to the bottom, d3 is the new top", async () => {
    // RULING-CONFLICT: riftjudge 76b6056d1f5b4189 says energy would stay 3 (free play); CR 419.3.b says pay — engine follows CR.
    const game = await attackAndReveal(3);
    await game.p1.pick("d1");
    await finishPlay(game, "base");
    expect(game.p1.energy()).toBe(0);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("d1"));
    expect(game.state("d1").isExhausted).toBe(true);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p1.deck().at(-1)).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  test("with [0] available the reveal still happens but NO revealed card can be chosen to play (unaffordable) — both are recycled and the board is unchanged", async () => {
    // RULING-CONFLICT: under the ruling a Skulker could be played here for free; under CR 419.2.a/419.3.c it cannot be paid for.
    const game = await attackAndReveal(0);
    const d = game.decision();
    if (isRevealPick(d)) {
      expect(d.options).toEqual([]);
      await game.p1.decline();
    }
    await finishPlay(game, "base");
    expect(game.zoneOf("d1")).toBe("mainDeck");
    expect(game.zoneOf("d2")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    // The attack itself proceeds: Rek'Sai (5) into the Wall (7) dies.
    await game.settle();
    expect(game.zoneOf("reksai")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
