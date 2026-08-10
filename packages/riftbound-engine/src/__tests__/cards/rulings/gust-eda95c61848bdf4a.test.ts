/**
 * Ruling eda95c61848bdf4a — Gust (OGN-169 → ogn-169-298) · [Reaction] · 1 · "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand."
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) · 2 Might · "[Hidden] When I defend, choose an enemy unit here and reveal the
 *     top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the
 *     revealed cards."   (Hidden Blade ogn-213-298 = the [Hidden] cards in the deck.)
 *
 * Q: I reveal hidden Teemo when attacked; the OPPONENT reacts with Gust on him. Do I still get Teemo's effect?
 * A: Partly. Gust resolves first and returns Teemo to hand; his trigger stays on the chain and still resolves — the top
 *    5 are revealed and recycled — but the damage portion deals 0 because Teemo is no longer "here".
 * Rules: 811.1.c (play from facedown as a Reaction), 383 (a trigger is its own chain item, independent of its source),
 *        340 (LIFO), 359.3.e ("here" can't be referenced once the source left ⇒ that instruction does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const TEEMO_STRATEGIST = "ogn-121-298";
const HIDDEN_BLADE = "ogn-213-298"; // has [Hidden]
const SKULKER = "ogn-175-298"; // no [Hidden]

/**
 * Turn 3, P1's turn. P2 holds bf1 with a 2-Might Holder and Teemo facedown there (hidden earlier); P2's deck top five hold
 * 3 Hidden cards (h1 s1 h2 h3 s2), then s3. P1: a 7-Might Attacker in base and Gust + [1].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P2, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "base", { might: 7, name: "Attacker" }, "attacker")
    .hand(P1, GUST, "gust")
    .deck(P2, [HIDDEN_BLADE, SKULKER, HIDDEN_BLADE, HIDDEN_BLADE, SKULKER, SKULKER], ["h1", "s1", "h2", "h3", "s2", "s3"]);
}

/** P1 attacks bf1 and passes Focus; P2 reveals Teemo — a defender whose trigger (→ Attacker) is on the chain. */
async function teemoRevealed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("attacker", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.p2.can("reveal", "teemo")).toBe(true);
  await game.p2.reveal("teemo");
  expect(game.state("teemo")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("attacker"); // "choose an enemy unit here" — the only candidate
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, triggered: true })]);
  return game;
}

describe("Ruling eda95c61848bdf4a — opponent Gusts the just-revealed Teemo: reveal/recycle still happens, the damage doesn't", () => {
  test("P2 passes on its own trigger; P1 (the opponent) may Gust Teemo (2 Might, at a battlefield) in response — chain = [Teemo trigger, Gust]", async () => {
    const game = await teemoRevealed();
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "teemo" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
  });

  test("1. LIFO: Gust resolves first — Teemo returns to P2's hand while his trigger is still on the chain", async () => {
    const game = await teemoRevealed();
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("gust", { targets: "teemo" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p2.hand()).toContain("teemo");
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo"]);
  });

  test("2–3. Teemo's trigger then resolves anyway: the top 5 ARE revealed and recycled (s3 is now on top), but the Attacker takes 0 damage — Teemo isn't 'here' any more", async () => {
    const game = await teemoRevealed();
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("gust", { targets: "teemo" });
    // Resolve Gust and then the trigger, stopping before combat damage.
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.p2.deck()[0]).toBe("s3"); // h1 s1 h2 h3 s2 were revealed and went to the bottom
    expect(game.p2.deck()).toEqual(expect.arrayContaining(["h1", "s1", "h2", "h3", "s2"]));
    expect(game.state("attacker")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // would have been 3
    expect((game.gameState.damageLog ?? []).filter((r) => !r.combat && r.target === "attacker")).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("hand");
    // The combat then runs 7 vs the lone Holder.
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control (no Gust): the trigger resolves with Teemo present — 3 Hidden cards among the five ⇒ the Attacker takes 3", async () => {
    const game = await teemoRevealed();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("attacker").damage).toBe(3);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.p2.deck()[0]).toBe("s3");
  });
});
