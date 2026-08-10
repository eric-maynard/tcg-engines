/**
 * Ruling 006d01ab3431f947 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · 9 · "At the end of your turn, reveal cards from the top of your
 *     Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: Is it mandatory? Must you play the FIRST unit revealed? Are the cards revealed publicly?
 * A: Mandatory at the end of your turn (no "may"); you reveal one by one and MUST banish-and-play the first unit you hit — no skipping it or
 *    recycling it instead; every revealed card is shown publicly.
 * Rules: 383 (triggered abilities without "may" are compulsory), 424.1 (reveal = show to all players), 354/419 (play via effect, ignoring cost),
 *        411 (recycle the rest).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const CLEAVE = "ogn-004-298"; // spell
const SKULKER = "ogn-175-298"; // 3-Might unit

/** P1's turn, about to end. Aurora in base. Deck top→: spell s1, spell s2, unit u1, unit u2, spell s3. P2 holds bf1 (irrelevant board). */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .deck(P1, [CLEAVE, CLEAVE, SKULKER, SKULKER, CLEAVE], ["s1", "s2", "u1", "u2", "s3"]);
}

/** End P1's turn and drive Aurora to completion, recording every non-priority prompt P1 was given on the way. */
async function endTurnThroughAurora(game: Game): Promise<Decision[]> {
  const prompts: Decision[] = [];
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    prompts.push(d);
    if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick(d.options[0]!.key); // where the free unit lands (only if asked)
    } else {
      break;
    }
  }
  return prompts;
}

describe("Ruling 006d01ab3431f947 — Dazzling Aurora is compulsory, plays the FIRST unit revealed, and reveals publicly", () => {
  test("mandatory: ending the turn puts the ability straight on the chain — no 'use Dazzling Aurora?' yes/no is ever asked, and it resolves even if P1 does nothing but pass", async () => {
    const game = await board().build();
    const prompts = await endTurnThroughAurora(game);
    expect(prompts.some((p) => p.kind === "yes-no")).toBe(false);
    expect(game.zoneOf("u1")).toBe("base"); // it happened
    expect(game.turnPlayer()).toBe(P2);
  });

  test("must play the FIRST unit revealed: u1 (third card down) is banished-and-played to P1's board for free; P1 is never offered u2, nor a choice to recycle u1 instead", async () => {
    const game = await board().build();
    const prompts = await endTurnThroughAurora(game);
    // No pick that offers a choice between units / offers declining the unit.
    const unitPicks = prompts.filter((p) => p.kind === "pick" && p.semantics !== "destination");
    expect(unitPicks).toEqual([]);
    expect(game.zoneOf("u1")).toBe("base");
    expect(game.state("u1")).toMatchObject({ controller: P1, owner: P1 });
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    expect(game.zoneOf("u2")).toBe("mainDeck"); // never reached
    expect(game.p1.deck()[0]).toBe("u2"); // revealing stopped exactly at the first unit
  });

  test("'recycle the rest': the two spells revealed before u1 go to the BOTTOM of the deck; s3 (below u2) was never revealed and stays put", async () => {
    const game = await board().build();
    await endTurnThroughAurora(game);
    const deck = game.p1.deck();
    expect(deck.slice(0, 2)).toEqual(["u2", "s3"]);
    expect(deck.slice(-2)).toEqual(["s1", "s2"]);
    expect(deck).not.toContain("u1");
  });

  test("public: the reveal is recorded as a PUBLIC reveal by P1 of exactly s1, s2, u1 (in order) — the opponent saw every card turned over, and nothing beyond", async () => {
    const game = await board().build();
    await endTurnThroughAurora(game);
    const reveals = game.gameState.publicReveals ?? [];
    expect(reveals).toContainEqual(expect.objectContaining({ cardIds: ["s1", "s2", "u1"], playerId: P1 }));
    expect(reveals.some((r) => r.cardIds.includes("u2") || r.cardIds.includes("s3"))).toBe(false);
    // and P2's own view of the board now shows the played unit face-up
    const p2Zones = game.view(P2).zones;
    const seen = Object.values(p2Zones).flatMap((cards) => cards.filter((c) => !("hidden" in c) && (c as { id: string }).id === "u1"));
    expect(seen).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
