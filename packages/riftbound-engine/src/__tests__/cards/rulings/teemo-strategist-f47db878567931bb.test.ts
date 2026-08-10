/**
 * Ruling f47db878567931bb — Teemo, Strategist (OGN-121 → ogn-121-298) · 2 Might "[Hidden] When I defend, choose an enemy unit
 *     here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way,
 *     then recycle the revealed cards."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · 4 Might "[Ganking] As you look at or reveal me from the top of your
 *     deck, you may banish me. If you do, you may play me for [rainbow]."
 *
 * Q: Teemo's defend trigger reveals Nocturne during the showdown he is defending — can Nocturne be played into THAT battlefield?
 * A: Yes. Units normally can't be played during a showdown (Closed/Showdown state), but Nocturne's own ability plays him
 *    when revealed — card text beats the timing default — and he may go to any location his controller could play a unit
 *    to, including the battlefield being defended (his controller controls it).
 * Rules: 419.1 / 354 (a play instructed by an ability ignores normal timing), 355.2.a (base or a battlefield you control),
 *        424 (reveal), 464.2.c.3.a (a unit arriving mid-combat on the defender's side joins as a defender).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const NOCTURNE = "ogn-194-298";
const HIDDEN_CARD = "ogn-083-298"; // Consult the Past — [Hidden]
const PLAIN = "ogn-175-298";

/**
 * P1's turn. P2 holds bf1 with Teemo, Strategist and has exactly 1 rainbow (Nocturne's alternative cost). P2's deck, top
 * first: plain, NOCTURNE, plain, Consult the Past ([Hidden]), plain, plain. P1 attacks with a 5-Might Scout.
 */
function board() {
  return scenario()
    .resources(P2, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TEEMO, "teemo")
    .unit(P1, "base", { might: 5, name: "Scout" }, "scout")
    .deck(P2, [PLAIN, NOCTURNE, PLAIN, HIDDEN_CARD, PLAIN, PLAIN], ["t1", "noc", "t3", "consult", "t5", "t6"]);
}

/** Scout attacks; Teemo's defend trigger (auto-targeting the lone enemy) resolves after both pass → the reveal hits Nocturne. */
async function attackIntoTeemo(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    await game.p2.pick("scout");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, triggered: true })]);
  expect(game.state("teemo").combatRole).toBe("defender");
  await game.acting().passPriority();
  await game.acting().passPriority(); // Teemo's ability resolves: reveal top 5 …
  return game;
}

describe("Ruling f47db878567931bb — Nocturne revealed by a defending Teemo can be played straight into that battlefield", () => {
  test("mid-showdown, as Teemo's reveal shows Nocturne, P2 is asked whether to banish him and then whether to play him for [rainbow] — a play offered DURING the showdown", async () => {
    const game = await attackIntoTeemo();
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    const banish = game.decision();
    expect(banish).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(banish?.prompt ?? "").toContain("Nocturne");
    await game.p2.yes();
    expect(game.zoneOf("noc")).toBe("banishment");
    const play = game.decision();
    expect(play).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(play?.prompt ?? "").toContain("Nocturne");
  });

  test("accepting: the destination menu includes bf1 — the very battlefield Teemo is defending (P2 controls it) — as well as P2's base", async () => {
    const game = await attackIntoTeemo();
    await game.p2.yes();
    await game.p2.yes();
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    const keys = dest?.kind === "pick" ? dest.options.map((o) => o.key) : [];
    expect(keys).toContain("battlefield-bf1");
    expect(keys).toContain("base");
  });

  test("choosing bf1: Nocturne enters there for exactly [rainbow] (his 4+[chaos] unpaid), joins the ongoing combat on Teemo's side; Teemo's ability still counts the one [Hidden] card (1 to the Scout) and recycles the rest", async () => {
    const game = await attackIntoTeemo();
    const deckBefore = game.p2.deck().length; // after the reveal started; recycled cards return to the deck
    await game.p2.yes();
    await game.p2.yes();
    await game.p2.pick("battlefield-bf1");
    // Drain whatever remains of the chain (Nocturne's play / Teemo's damage) up to the open showdown.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.locationOf("noc")).toBe("bf1");
    expect(game.state("noc")).toMatchObject({ combatRole: "defender", controller: P2 });
    expect(game.p2.power()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(game.state("scout").damage).toBe(1); // one [Hidden] card (Consult the Past) among the five revealed
    expect(game.p2.deck()).toEqual(expect.arrayContaining(["t1", "t3", "consult", "t5"])); // recycled, Nocturne is not
    expect(game.p2.deck()).not.toContain("noc");
    expect(game.p2.deck().length).toBeGreaterThanOrEqual(deckBefore - 1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("and he fights: Scout 5 vs Teemo 2 + Nocturne 4 — the Scout dies (taking Teemo with it), Nocturne holds bf1 for P2", async () => {
    const game = await attackIntoTeemo();
    await game.p2.yes();
    await game.p2.yes();
    await game.p2.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: declining the banish leaves Nocturne in the deck to be recycled with the others — nothing is played", async () => {
    const game = await attackIntoTeemo();
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("noc")).toBe("mainDeck");
    expect(game.p2.power()).toBe(1);
  });
});
