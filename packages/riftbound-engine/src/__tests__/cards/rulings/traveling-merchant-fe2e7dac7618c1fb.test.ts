/**
 * Ruling fe2e7dac7618c1fb — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might — "When I move, discard 1, then draw 1."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might — "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: I move the Merchant and Yasuo together into an enemy-controlled battlefield — may I pick which trigger resolves first?
 * A: No. They trigger at different times: the Merchant's MOVE trigger goes on a chain that must fully resolve before the
 *    Showdown begins; only when the Showdown begins does Yasuo gain the Attacker designation and his trigger form the
 *    Initial Chain (during which only Reactions may be played). The two are never on the chain together, so there is
 *    no ordering choice.
 * Rules: 383.4.e (attack triggers on gaining the designation at combat start), 344/323.13 (staged showdown opens only
 *        from an empty chain), 383.3.d (ordering applies only to simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const YASUO_REMORSEFUL = "ogn-076-298";
const CLEAVE = "ogn-004-298"; // [1] Action — used to show the Initial Chain admits no Actions

const pickOptions = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** P1's turn with [1]. P2 controls bf1 with an 8-Might Guard. P1: ready Merchant + Yasuo in base, Junk + Cleave in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Guard" }, "guard")
    .unit(P1, "base", MERCHANT, "merchant")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .hand(P1, { cardType: "unit", energyCost: 3, might: 3, name: "Junk" }, "junk")
    .hand(P1, CLEAVE, "cleave");
}

function showdowns(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

async function bothMove(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["merchant", "yasuo"], "bf1");
  expect(game.p1.units("bf1").sort()).toEqual(["merchant", "yasuo"]);
  return game;
}

/** Both pass → the Merchant trigger resolves: discard Junk, draw 1. */
async function merchantResolved(): Promise<Game> {
  const game = await bothMove();
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (pickOptions(game.decision()).includes("junk")) {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("junk");
  }
  expect(game.zoneOf("junk")).toBe("trash");
  return game;
}

describe("Ruling fe2e7dac7618c1fb — Merchant's move trigger and Yasuo's attack trigger are never on the chain together", () => {
  test("1. the move: ONLY the Merchant's 'When I move' item is on the chain — no Yasuo item, no order prompt, no showdown yet (bf1 merely contested), neither unit is an attacker", async () => {
    const game = await bothMove();
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "yasuo")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(showdowns(game)).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.state("yasuo").combatRole ?? null).toBeNull();
    expect(game.state("merchant").combatRole ?? null).toBeNull();
    expect(game.state("guard").damage).toBe(0);
  });

  test("2–3. the Merchant chain resolves completely (discard Junk, draw 1); only THEN does the showdown begin — Yasuo gains Attacker and his trigger (→ Guard) is the Initial Chain, alone", async () => {
    const deckBefore = (await board().build()).p1.deck().length;
    const game = await merchantResolved();
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p1.hand().length).toBe(2); // cleave + the drawn card
    if (pickOptions(game.decision()).includes("guard")) {
      await game.p1.pick("guard");
    }
    expect(showdowns(game)).toEqual([expect.objectContaining({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true })]);
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["guard"], triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "merchant")).toBe(false);
    expect(game.decision()?.kind).not.toBe("order");
  });

  test("the Initial Chain admits only Reactions: with Yasuo's trigger pending P1 cannot cast the [Action] Cleave; once it resolves (6 to the Guard) the showdown is open and Cleave becomes legal", async () => {
    const game = await merchantResolved();
    if (pickOptions(game.decision()).includes("guard")) {
      await game.p1.pick("guard");
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(6);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
