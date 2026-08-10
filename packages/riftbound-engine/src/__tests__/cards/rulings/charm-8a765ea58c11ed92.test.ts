/**
 * Ruling 8a765ea58c11ed92 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1+[calm] · "Move an enemy unit."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *
 * Q: I Charm my opponent's Traveling Merchant — who discards and draws off the Merchant's trigger?
 * A: The Merchant's CONTROLLER (the opponent). Moving an enemy unit with Charm does not give you control of its abilities.
 * Rules: 108.2 / 376 (a triggered ability is controlled by the permanent's controller), 137 (Charm's move IS a move —
 *        "When I move" triggers), 409 (discard is from that player's hand).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const TRAVELING_MERCHANT = "ogn-185-298";
const FILLER = "ogn-175-298";

/**
 * P1's turn with exactly 1+[calm] and Charm + one other card in hand. P2's Traveling Merchant sits in P2's base; bf1 is
 * open. P2 holds two known cards and has a known deck top.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, CHARM, "charm")
    .hand(P1, FILLER, "p1keep")
    .hand(P2, FILLER, "p2a")
    .hand(P2, FILLER, "p2b")
    .deck(P2, [FILLER], ["p2top"])
    .deck(P1, [FILLER], ["p1top"]);
}

/** P1 Charms the Merchant to bf1 and the spell resolves; returns with the Merchant's trigger pending. */
async function charmMerchantToBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "merchant" });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("battlefield-bf1"); // destination, chosen by the Charm player
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  // Resolve Charm (both pass); answer a late destination prompt if the engine asks on resolution instead.
  for (let i = 0; i < 6 && game.zoneOf("charm") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("battlefield-bf1");
    } else if (d?.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("merchant")).toBe("bf1");
  return game;
}

describe("Ruling 8a765ea58c11ed92 — a Charmed Traveling Merchant's discard/draw belongs to its controller, not the Charm player", () => {
  test("after Charm moves P2's Merchant, the 'When I move' item on the chain is CONTROLLED BY P2 and the discard choice is asked of P2 (from P2's hand)", async () => {
    const game = await charmMerchantToBf1();
    expect(game.state("merchant")).toMatchObject({ controller: P2, owner: P2 }); // Charm never changed control
    // Walk to the discard prompt.
    let asked: string | undefined;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        asked = d.seat;
        expect(d.seat).toBe(P2);
        expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["p2a", "p2b"]); // P2's cards, never P1's
        break;
      }
      if (game.chain().length > 0) {
        expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P2, triggered: true })]);
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(asked).toBe(P2);
  });

  test("resolution: P2 discards one of THEIR cards and draws THEIR top card; P1's hand (p1keep) and deck are untouched", async () => {
    const game = await charmMerchantToBf1();
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        expect(d.seat).toBe(P2);
        await game.p2.pick("p2a");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("p2a")).toBe("trash");
    expect(game.p2.trash()).toContain("p2a");
    expect(game.p2.hand().sort()).toEqual(["p2b", "p2top"]); // discarded 1, drew 1
    expect(game.p1.hand()).toEqual(["p1keep"]); // P1 neither discarded nor drew
    expect(game.p1.deck()[0]).toBe("p1top");
    expect(game.p1.trash()).toEqual(["charm"]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 }); // back to P1 (showdown at bf1 or main)
    expect(game.violations()).toEqual([]);
  });
});
