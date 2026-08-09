/**
 * Ruling 0f7901bdeb46f6a7 — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion Unit · Mind · 2+[mind] · 2 Might
 *   "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to
 *    that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · "[Deflect] (Opponents must pay [rainbow] to choose me
 *     with a spell or ability.) You may play me to an occupied enemy battlefield."
 *
 * Q: Does Teemo's defend trigger have to pay Deflect to choose the Predator? Can I decline, and then what?
 * A: Yes — choosing a Deflect unit incurs the [rainbow] ONCE (per targeting, not per damage). You may decline to
 *    pay a cost a triggered ability incurs; if you do, the pending ability is removed from the chain and never
 *    becomes a chain item: nothing is revealed, no damage is dealt. If you pay, it finalizes normally: reveal 5,
 *    deal 1 per [Hidden] card revealed, then recycle them.
 * Rules: 404.2 (declining a cost incurred by a triggered ability removes the pending item), 812 (Deflect),
 *        337 / 354 (pending items → finalized chain items), 403 (Recycle), 424 (Reveal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const BACK_OFF = "unl-042-219"; // [Hidden] spell
const HERE_TO_HELP = "sfd-111-221"; // [Hidden] spell
const SKULKER = "ogn-175-298"; // no [Hidden]

const TOP_SIX = ["h1", "n1", "h2", "n2", "h3", "n3"];

/**
 * P2's turn. P1 holds bf1 with Teemo, Strategist; P2's Deadbloom Predator is in base ready to attack. P1's deck,
 * top first: Back Off (H), Skulker, Here to Help (H), Skulker, Teemo (H), Skulker, then filler — so the top FIVE
 * hold exactly three [Hidden] cards. P1 has `rainbow` power and nothing else.
 */
function board(rainbow: number) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 0, power: { rainbow } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", DEADBLOOM_PREDATOR, "pred")
    .deck(P1, [BACK_OFF, SKULKER, HERE_TO_HELP, SKULKER, TEEMO_STRATEGIST, SKULKER], TOP_SIX);
}

/** Pass priority until the chain is empty (bounded), stopping at any non-action prompt. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 0f7901bdeb46f6a7 — Teemo, Strategist's defend trigger vs a Deflect attacker: pay once, or decline and it fizzles", () => {
  test("paying: the Predator attacks, Teemo defends; choosing the (only) enemy unit here costs [rainbow] exactly ONCE (2 → 1, not once per damage); the trigger then reveals 5, deals 3 (three [Hidden] cards) and recycles the five to the bottom", async () => {
    const game = await board(2).build();
    expect(game.p1.deck().slice(0, 6)).toEqual(TOP_SIX);
    await game.p2.move("pred", "bf1");
    // If the engine asks about the Deflect payment / the forced target, accept.
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("pred");
      } else {
        break;
      }
    }
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["pred"], triggered: true })]);
    expect(game.p1.power("rainbow")).toBe(1); // Deflect paid once, at targeting
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("pred").damage).toBe(3); // Back Off, Here to Help, Teemo = 3 [Hidden] among the top 5
    expect(game.p1.power("rainbow")).toBe(1); // no further Deflect payments "per damage"
    // The five revealed cards were recycled: n3 is the new top, the five sit at the bottom.
    const deck = game.p1.deck();
    expect(deck[0]).toBe("n3");
    expect(deck.slice(-5).sort()).toEqual(["h1", "h2", "h3", "n1", "n2"]);
    expect(game.p1.hand()).toEqual([]); // revealed, not drawn
  });

  // rule 404.2: with the Predator the only enemy unit here and a [rainbow] available, P1 is ASKED whether to
  // pay the Deflect cost the trigger incurs (a P1 decision before the item is finalized); answering "no" removes
  // the pending ability — chain empty, rainbow kept, nothing revealed (deck untouched), no damage.
  test("ruling 0f7901bdeb46f6a7 — the controller may decline the Deflect cost Teemo's forced target incurs", async () => {
    const game = await board(1).build();
    await game.p2.move("pred", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(`${d?.prompt ?? ""}`).toMatch(/deflect|rainbow|pay/i);
    expect(game.p1.power("rainbow")).toBe(1); // not taken before the answer
    await game.p1.no();
    expect(game.chain()).toEqual([]); // never became a chain item
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("pred").damage).toBe(0);
    expect(game.p1.deck().slice(0, 6)).toEqual(TOP_SIX); // nothing revealed or recycled
  });

  test("unable to pay (no power at all): the trigger cannot choose its Deflect target, so it is removed without ever reaching the chain — no reveal, no recycle, no damage; the combat just proceeds", async () => {
    const game = await board(0).build();
    await game.p2.move("pred", "bf1");
    expect(game.state("teemo").combatRole).toBe("defender"); // Teemo DID defend — the trigger condition was met
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown" });
    expect(game.state("pred").damage).toBe(0);
    expect(game.p1.deck().slice(0, 6)).toEqual(TOP_SIX);
    await game.settle(); // combat: Predator (8) kills Teemo (2) and conquers
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.locationOf("pred")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.deck().slice(0, 6)).toEqual(TOP_SIX);
  });
});
