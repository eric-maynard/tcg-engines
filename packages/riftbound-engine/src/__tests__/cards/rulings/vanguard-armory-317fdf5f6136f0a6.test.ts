/**
 * Ruling 317fdf5f6136f0a6 — Vanguard Armory (SFD-168 → sfd-168-221) · Gear · Order · [7][order]
 *   "[Exhaust]: Play three 1 [Might] Recruit unit tokens. (You may play them to different locations.)"
 *   × Consult the Past (ogn-083-298, [Reaction] [4] "Draw 2.") — the opponent's Reaction
 *
 * Q: Can my opponent react to me using Vanguard Armory?
 * A: Yes. Activated abilities use the chain: exhausting the Armory puts its ability on the chain, and before it resolves
 *    (before any Recruit exists) the opponent receives priority and may play Reactions / fast effects.
 * Rules: 377.3 (activated abilities use the chain), 337–340 (priority round before resolution), 813 (Reaction timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VANGUARD_ARMORY = "sfd-168-221";
const CONSULT_THE_PAST = "ogn-083-298";

/** P1's turn with a ready Armory (no controlled battlefield → tokens go to base unasked). P2 holds Consult the Past + [4]. */
function board() {
  return scenario()
    .resources(P2, { energy: 4 })
    .gear(P1, VANGUARD_ARMORY, "armory")
    .hand(P2, CONSULT_THE_PAST, "consult")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["c1", "c2", "c3"]);
}

const recruits = (game: Game) => game.p1.units("base").filter((id) => game.state(id).name === "Recruit");

async function armoryActivatedP2HasPriority(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("armory");
  expect(game.state("armory").isExhausted).toBe(true); // cost paid on activation
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "armory", controller: P1, triggered: false })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 317fdf5f6136f0a6 — the opponent gets a reaction window on Vanguard Armory's activation", () => {
  test("exhausting the Armory puts its ability on the chain as a pending item; P2 receives priority while NO Recruit token exists yet", async () => {
    const game = await armoryActivatedP2HasPriority();
    expect(recruits(game)).toEqual([]);
    expect(game.p2.can("cast", "consult")).toBe(true); // a Reaction is legally timed here
  });

  test("P2 reacts: Consult the Past goes on the chain above the Armory ability and resolves first (P2 draws 2) — still no tokens at that point", async () => {
    const game = await armoryActivatedP2HasPriority();
    await game.p2.cast("consult");
    expect(game.chain().map((c) => c.cardId)).toEqual(["armory", "consult"]);
    expect(game.p2.energy()).toBe(0);
    const handBefore = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Consult resolves (LIFO)
    expect(game.p2.hand()).toHaveLength(handBefore + 2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["armory"]);
    expect(recruits(game)).toEqual([]);
  });

  test("only after both pass on the Armory ability does it resolve: three exhausted 1-Might Recruit tokens in P1's base", async () => {
    const game = await armoryActivatedP2HasPriority();
    await game.p2.cast("consult");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toHaveLength(3);
    expect(recruits(game).every((t) => game.state(t).isToken && game.state(t).might === 1 && game.state(t).isExhausted)).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
