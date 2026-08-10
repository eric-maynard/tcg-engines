/**
 * Ruling a305d4b77acee26a — Gust (OGN-169 → ogn-169-298) · Reaction [1] · "Return a unit at a battlefield with 3 [Might] or less to
 *   its owner's hand."   × Teemo, Strategist (ogn-121-298) · 2 Might · "[Hidden] When I defend, choose an enemy unit here and reveal
 *   the top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the revealed
 *   cards."   (× Flash ogs-011-024 mentioned as an alternative saver.)
 *
 * Q: If I reveal hidden Teemo when an enemy attacks, can I Gust him to safety after his ability triggers?
 * A: Yes. Reveal Teemo (reaction speed) → his defend trigger goes on the chain → Gust him in response → he is safe in hand; the
 *    trigger still resolves (cards are revealed/recycled) but deals no damage because Teemo is no longer there. Nuance: Gust him
 *    AFTER the trigger resolves instead and you get both the damage and the save.
 * Rules: 811.1.c (play from facedown as a Reaction), 383 (triggered ability is its own chain item), 331 (LIFO), 359.3.e
 *        (an instruction whose source/informant left its required location does nothing), 340 (Focus in showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const TEEMO_STRATEGIST = "ogn-121-298";
const HIDDEN_BLADE = "ogn-213-298"; // a [Hidden] card for Teemo's reveal count
const SKULKER = "ogn-175-298"; // no [Hidden]

/**
 * Turn 3, P1's turn. P2 holds bf1 with a 2-Might Holder and Teemo facedown there; Gust + [1] in hand; deck top = 3 Hidden cards
 * among the first five (h1 s1 h2 h3 s2), then s3. P1's 7-Might Attacker in base.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P2, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "base", { might: 7, name: "Attacker" }, "attacker")
    .hand(P2, GUST, "gust")
    .deck(P2, [HIDDEN_BLADE, SKULKER, HIDDEN_BLADE, HIDDEN_BLADE, SKULKER, SKULKER], ["h1", "s1", "h2", "h3", "s2", "s3"]);
}

/** P1 attacks bf1 and passes Focus; P2 reveals Teemo from hidden — he is a Defender and his trigger is on the chain. */
async function teemoRevealed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("attacker", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.p2.can("reveal", "teemo")).toBe(true);
  await game.p2.reveal("teemo");
  expect(game.p2.energy()).toBe(1); // from hidden: [0]
  expect(game.state("teemo")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("attacker"); // "choose an enemy unit here" (only candidate)
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, triggered: true })]);
  return game;
}

describe("Ruling a305d4b77acee26a — reveal Teemo on defense, then Gust him to safety", () => {
  test("Gust in response to Teemo's own defend trigger: chain = [Teemo trigger, Gust]; Gust resolves first and Teemo goes to P2's hand", async () => {
    const game = await teemoRevealed();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "teemo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p2.hand()).toContain("teemo");
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo"]); // his trigger still waits
  });

  test("…the trigger then resolves with Teemo gone: the top 5 are still revealed and recycled, but NO damage is dealt to the Attacker; Teemo stays safe in hand through combat", async () => {
    const game = await teemoRevealed();
    await game.p2.cast("gust", { targets: "teemo" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect((game.gameState.damageLog ?? []).filter((r) => !r.combat && r.target === "attacker")).toEqual([]);
    expect(game.p2.deck()[0]).toBe("s3"); // h1 s1 h2 h3 s2 were revealed and recycled
    expect(game.p2.deck()).toEqual(expect.arrayContaining(["h1", "s1", "h2", "h3", "s2"]));
    expect(game.zoneOf("teemo")).toBe("hand");
    // Combat: 7 vs the lone 2-Might Holder.
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.state("attacker")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: let the trigger resolve FIRST (3 Hidden cards revealed ⇒ 3 damage to the Attacker), then Gust Teemo before combat damage — you get the damage AND the save", async () => {
    const game = await teemoRevealed();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Teemo's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("attacker").damage).toBe(3);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    // Still inside the showdown; P2 acts (Focus/priority) and Gusts Teemo home.
    if (game.actingSeat() !== P2) {
      await game.acting().passFocus();
    }
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "teemo" });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.state("attacker")).toMatchObject({ zone: "battlefield-bf1" }); // 7 Might: 3 + 2 from the Holder is not lethal
  });
});
