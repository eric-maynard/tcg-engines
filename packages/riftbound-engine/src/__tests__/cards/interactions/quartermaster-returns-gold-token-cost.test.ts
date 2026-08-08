/**
 * Interaction: Legion Quartermaster (sfd-044-221) · Unit · Calm · 3 · 4 Might
 *     "As an additional cost to play me, return a friendly gear to its owner's hand."
 *   × Trove Golem (sfd-174-221) · Unit · Order · 8 + [order][order] · 9 Might
 *     "When you play me, play four Gold gear tokens exhausted."
 *   × Akshan, Mischievous (sfd-109-221) — "…move an enemy gear to your base. You control it until I
 *     leave the board." (modelled here as a P2-owned gear already under P1's control)
 *   × Hard Bargain (sfd-136-221) · Spell (Reaction) — "Counter a spell unless its controller pays [2]."
 *
 * Question: P1's only gear are exhausted Gold TOKENS (from Trove Golem) plus one P2-owned gear P1
 * controls (Akshan). (a) May P1 pay the Quartermaster's cost by returning a Gold token "to its owner's
 * hand"? What happens to the token; is the cost paid; is the Quartermaster played? (b) May P1 return
 * the stolen P2-owned gear instead — is it "friendly", and whose hand does it go to? (c) With no gear
 * under P1's control at all (only P2 has gear) can P1 return an enemy gear, or skip the cost? (d) Can P2
 * Hard-Bargain the Quartermaster, and would the returned token / gear come back?
 *
 * Rules: 185.2.d (a Gold token is a gear), 740.1.a/b (friendly = shares a CONTROLLER; enemy otherwise),
 * 357.2 (pay additional costs), 183 / 127.1 (token owner = the player who created it), 186.1 (a token
 * in a non-board zone ceases to exist), 056.2 (goes to its OWNER's hand), 124 (Akshan's control effect
 * simply loses its object), 356.2.a.1 (mandatory additional cost — unpayable ⇒ unplayable), 143.4
 * (units enter exhausted), 359.2 / 359.3.c (a permanent leaves the chain on finalization — only spells
 * linger to be reacted to), 425.1.c/.c.1 (countering never refunds costs, additional costs included).
 *
 * Expected: (a) yes — token returned → ceases to exist; cost paid; Quartermaster enters base exhausted
 * for 3 energy. (b) yes — the stolen gear is friendly (P1 controls it); it goes to P2's hand; cost paid.
 * (c) no and no — enemy gear is not friendly and the cost is mandatory: the play is illegal. (d) P2 never
 * gets the chance: a unit is not a spell and does not linger on the chain; either way nothing paid as a
 * cost ever comes back.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const QUARTERMASTER = "sfd-044-221";
const TROVE_GOLEM = "sfd-174-221";
const AKSHAN = "sfd-109-221";
const HARD_BARGAIN = "sfd-136-221";
const SEAL_OF_FOCUS = "ogn-081-298"; // a plain real gear (Calm, 0) to stand in for "P2's gear"

const golds = (game: Game) => game.cardsAt("base").filter((id) => game.state(id).name === "Gold");

/**
 * P1: 11 energy + [order][order] (8+OO for the Golem, 3 for the Quartermaster), Akshan on board, and a
 * P2-OWNED Seal of Focus already under P1's control ("stolen"). P2: their own Seal in base, Hard Bargain
 * in hand with [2] + a chaos pip to cast it.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { order: 2 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .unit(P1, "base", AKSHAN, "akshan")
    .card("stolen", { controller: P1, def: SEAL_OF_FOCUS, owner: P2, zone: "base" })
    .gear(P2, SEAL_OF_FOCUS, "p2seal")
    .hand(P1, TROVE_GOLEM, "golem")
    .hand(P1, QUARTERMASTER, "qm")
    .hand(P2, HARD_BARGAIN, "hb");
}

/** Play Trove Golem and let its trigger mint the four exhausted Gold tokens. */
async function withGold(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("golem");
  await game.settle();
  expect(golds(game)).toHaveLength(4);
  expect(game.p1.energy()).toBe(3);
  return game;
}

describe("Legion Quartermaster — paying 'return a friendly gear' with a Gold token or a stolen gear", () => {
  test("setup: the Golem's four Gold are exhausted gear TOKENS owned and controlled by P1; 'stolen' is P2-owned but P1-controlled", async () => {
    const game = await withGold();
    for (const g of golds(game)) {
      expect(game.state(g)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, owner: P1 });
    }
    expect(game.state("stolen")).toMatchObject({ cardType: "gear", controller: P1, owner: P2, zone: "base" });
    expect(game.state("p2seal")).toMatchObject({ controller: P2, owner: P2 });
  });

  test("the cost menu offers exactly the FRIENDLY gear — every Gold token and the stolen Seal — and never P2's own Seal (740.1.a/b)", async () => {
    const game = await withGold();
    const field = game.p1.option("play", "qm")?.fields.find((f) => f.arg === "sacrifice");
    expect(field).toBeDefined();
    expect([...(field?.options ?? [])].sort()).toEqual([...golds(game), "stolen"].sort());
    expect(field?.options ?? []).not.toContain("p2seal");
    await expect(game.p1.play("qm", { sacrifice: "p2seal" })).rejects.toThrow();
    expect(game.zoneOf("qm")).toBe("hand");
  });

  // ---- (a) pay with a Gold token --------------------------------------------------------------------

  test("(a) returning a Gold TOKEN pays the cost: the token ceases to exist (186.1) — it is in no zone, not in any hand or trash", async () => {
    const game = await withGold();
    const [coin] = golds(game);
    await game.p1.play("qm", { sacrifice: coin! });
    expect(game.has(coin!)).toBe(false);
    expect(golds(game)).toHaveLength(3);
    expect(game.p1.hand()).toEqual([]); // qm left the hand and no token arrived
    expect(game.p2.hand()).toEqual(["hb"]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("(a) …and the Quartermaster is played: 3 energy spent, it enters P1's base exhausted as a 4-Might unit (357.2, 143.4)", async () => {
    const game = await withGold();
    await game.p1.play("qm", { sacrifice: golds(game)[0]! });
    await game.settle();
    expect(game.zoneOf("qm")).toBe("base");
    expect(game.state("qm")).toMatchObject({ controller: P1, isExhausted: true, might: 4 });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("stolen")).toBe("base"); // the other friendly gear stays
    expect(game.state("stolen").controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) pay with the Akshan-stolen gear ----------------------------------------------------------

  test("(b) the P2-owned gear P1 controls is 'friendly' and may pay the cost — it returns to its OWNER's hand: P2's, not P1's (740.1.a, 056.2)", async () => {
    const game = await withGold();
    await game.p1.play("qm", { sacrifice: "stolen" });
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p2.hand()).toContain("stolen");
    expect(game.p1.hand()).not.toContain("stolen");
    expect(game.state("stolen")).toMatchObject({ controller: P2, owner: P2 });
    await game.settle();
    expect(game.zoneOf("qm")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(golds(game)).toHaveLength(4); // no token was spent
  });

  // ---- (c) no friendly gear at all ------------------------------------------------------------------

  test("(c) with no gear under P1's control (only P2's Seal on board) the mandatory cost is unpayable — the Quartermaster cannot be played at all (356.2.a.1, 740.1.b)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P1, "base", AKSHAN, "akshan")
      .gear(P2, SEAL_OF_FOCUS, "p2seal")
      .hand(P1, QUARTERMASTER, "qm")
      .build();
    expect(game.p1.can("play", "qm")).toBe(false);
    const r = await game.p1.try((p) => p.play("qm", { sacrifice: "p2seal" }));
    expect(r.ok).toBe(false);
    const bare = await game.p1.try((p) => p.play("qm"));
    expect(bare.ok).toBe(false);
    expect(game.zoneOf("qm")).toBe("hand");
    expect(game.zoneOf("p2seal")).toBe("base");
    expect(game.p1.energy()).toBe(5);
  });

  // ---- (d) Hard Bargain -----------------------------------------------------------------------------

  test("(d) P2 gets no window to Hard-Bargain the Quartermaster: a unit is not a spell and leaves the chain on finalization (359.2 / 359.3.c) — no cast is offered and he is already on the board", async () => {
    const game = await withGold();
    await game.p1.play("qm", { sacrifice: golds(game)[0]! });
    expect(game.chain().some((c) => c.cardId === "qm")).toBe(false);
    expect(game.p2.can("cast", "hb")).toBe(false);
    expect(game.zoneOf("qm")).toBe("base");
    await game.settle();
    expect(game.zoneOf("hb")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  });

  test("(d) costs are never refunded (425.1.c.1): after the play the spent Gold token stays nonexistent and, on the stolen-gear line, P2 simply keeps the card in hand", async () => {
    const viaToken = await withGold();
    const [coin] = golds(viaToken);
    await viaToken.p1.play("qm", { sacrifice: coin! });
    await viaToken.settle();
    await viaToken.advanceTurn(); // nothing later in the turn cycle brings it back either
    expect(viaToken.has(coin!)).toBe(false);
    expect(golds(viaToken)).toHaveLength(3);

    const viaStolen = await withGold();
    await viaStolen.p1.play("qm", { sacrifice: "stolen" });
    await viaStolen.settle();
    await viaStolen.advanceTurn();
    expect(viaStolen.zoneOf("stolen")).toBe("hand");
    expect(viaStolen.p2.hand()).toContain("stolen");
    expect(viaStolen.state("stolen").controller).toBe(P2);
  });
});
