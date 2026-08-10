/**
 * Interaction: Teemo, Strategist (ogn-121-298) · Champion Unit · Mind · 2 · 2 Might
 *     "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to
 *      that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Noxus Saboteur (ogn-018-298) · Unit · Fury · 3 · 3 Might
 *     "Your opponents' [Hidden] cards can't be revealed here."
 *
 * Question. P2 controls bf2 with defender D and hid Teemo facedown there last turn. P2's deck top 5 =
 * {H1 [Hidden], H2 [Hidden], N1, N2, N3}.
 *   (a) P1 attacks bf2 with Noxus Saboteur: can P2 flip facedown Teemo as a Reaction to defend? Is the flip absent
 *       from P2's own legal menu, and does P1's view keep only an anonymous facedown placeholder?
 *   (b) P1 attacks bf2 with a vanilla 4-Might unit instead: P2 flips Teemo (public), Teemo becomes a defender,
 *       "When I defend" triggers → target = the attacker; the top 5 are REVEALED (all five public, attributed to
 *       P2, for the duration of the ability); the attacker takes exactly 2; the five are recycled and afterwards no
 *       view (not even P2's) retains their identities / order. Then P1's combat-damage prompt lists D and Teemo.
 *   (c) Teemo played face-up earlier defends where Saboteur attacks: Saboteur does NOT stop the deck reveal and
 *       H1/H2 still count → 2 damage.
 *
 * Rules: 811.1.b / 811.1.d.1 (play from facedown for 0 as a Reaction, to that battlefield), 811.6 / 421.4 (playing
 * a hidden card reveals it → Saboteur's "can't be revealed here" forbids the flip), 811.5 (Hidden is a checkable
 * characteristic), 107.3.f / 128.4 (facedown cards are Private — P1 never learns the identity), 424.1 / 424.1.a.2 /
 * 424.1.a.3 (reveal = presented to all players, cards stay the top 5 meanwhile, state ends with the ability),
 * 128.3 / 108.4.d (Main Deck order is Secret), 416.5 (2+ cards recycled to the Main Deck simultaneously go to the
 * bottom in a RANDOM order — nobody orders them).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const SABOTEUR = "ogn-018-298";
const CONSULT = "ogn-083-298"; // Consult the Past — spell with [Hidden]  (H1)
const FAE = "ogn-097-298"; // [Hidden] unit                              (H2)
const SKULKER = "ogn-175-298"; // Shipyard Skulker — no [Hidden]          (N1..N3, N6)

const TOP_FIVE = ["h1", "h2", "n1", "n2", "n3"];

/**
 * Turn 3, P1 to act. bf2 (P2): Defender D (3) + facedown Teemo (hidden on an earlier turn).
 * P1 base: Noxus Saboteur (3) and a vanilla 4-Might unit. P2's deck, top first: H1 H2 N1 N2 N3 N6 (+ filler).
 */
function board(seed?: string) {
  return scenario(seed === undefined ? {} : { seed })
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "dd")
    .facedown(P2, "bf2", TEEMO, "teemo")
    .unit(P1, "base", SABOTEUR, "sab")
    .unit(P1, "base", { might: 4, name: "Vanilla Four" }, "v4")
    .deck(P2, [CONSULT, FAE, SKULKER, SKULKER, SKULKER, SKULKER], [...TOP_FIVE, "n6"]);
}

/** (b) the vanilla 4 attacks bf2, P1 passes Focus, P2 flips Teemo from facedown. */
async function teemoFlippedIntoCombat(seed?: string): Promise<Game> {
  const game = await board(seed).build();
  await game.p1.move("v4", "bf2");
  await game.p1.passFocus();
  await game.p2.reveal("teemo");
  return game;
}

/** …and both players pass priority so the defend trigger resolves. */
async function triggerResolved(seed?: string): Promise<Game> {
  const game = await teemoFlippedIntoCombat(seed);
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

/** P2's main deck as `viewer` sees it: "?" for a redacted card, else "id:name". */
function p2DeckAsSeenBy(game: Game, viewer: typeof P1 | typeof P2): string[] {
  return game
    .view(viewer)
    .zones.mainDeck!.filter((c) => c.owner === P2)
    .map((c) => (isHiddenView(c) ? "?" : `${c.id}:${c.name}`));
}

describe("Teemo, Strategist × Noxus Saboteur — facedown flip is locked 'here', the deck reveal is not", () => {
  // ── (a) Saboteur attacks bf2: the facedown flip is not a legal action for P2 ───────────────────

  test("(a) with Saboteur attacking bf2, flipping facedown Teemo is NOT on P2's legal menu (811.6/421.4: the play reveals it; Saboteur: can't be revealed here) and an attempt is rejected", async () => {
    const game = await board().build();
    await game.p1.move("sab", "bf2");
    expect(game.locationOf("sab")).toBe("bf2");
    expect(game.chain()).toEqual([]);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    // P2 determines this from P2's own information: Saboteur is public, the facedown card is P2's own.
    expect(game.p2.can("reveal", "teemo")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("reveal");
    const r = await game.p2.try((p) => p.reveal("teemo"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("facedown-bf2");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("(a) P1's view shows only an anonymous facedown placeholder at bf2 (128.4 / 107.3.f) — the identity 'Teemo' is never sent to P1; P2's own view does name it", async () => {
    const game = await board().build();
    await game.p1.move("sab", "bf2");
    await game.p1.passFocus();
    const p1View = game.view(P1);
    expect(p1View.zones["facedown-bf2"]).toEqual([{ hidden: true, index: 0, owner: P2, zone: "facedown-bf2" }]);
    expect(p1View.battlefields.find((b) => b.id === "bf2")).toMatchObject({ contested: true, controller: P2, facedownCount: 1 });
    const p1Json = JSON.stringify(p1View);
    expect(p1Json).not.toContain(TEEMO);
    expect(p1Json).not.toContain("Teemo");
    const p2Facedown = game.view(P2).zones["facedown-bf2"]![0]!;
    expect(isHiddenView(p2Facedown)).toBe(false);
    expect(p2Facedown).toMatchObject({ defId: TEEMO, id: "teemo", name: "Teemo, Strategist" });
  });

  // ── (b) a vanilla attacker: the flip is legal, Teemo defends, the trigger reveals/deals/recycles ─────

  test("(b) without Saboteur here P2 CAN flip Teemo for 0 (811.1.b): it lands at bf2 (811.1.d.1) face-up as a DEFENDER and 'When I defend' goes on the chain naming the lone attacker — all public in P1's view", async () => {
    const game = await board().build();
    await game.p1.move("v4", "bf2");
    await game.p1.passFocus();
    expect(game.p2.can("reveal", "teemo")).toBe(true);
    const before = game.p2.resources();
    await game.p2.reveal("teemo");
    expect(game.p2.resources()).toEqual(before); // ignoring its cost
    expect(game.zoneOf("teemo")).toBe("battlefield-bf2");
    expect(game.state("teemo")).toMatchObject({ combatRole: "defender", isHidden: false });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, targets: ["v4"], triggered: true })]);
    // P1 sees the flipped Teemo and the chain item with its (public) target pick.
    const p1View = game.view(P1);
    const bf2 = p1View.battlefields.find((b) => b.id === "bf2")!;
    expect(bf2.facedownCount).toBe(0);
    expect(bf2.units.map((u) => (isHiddenView(u) ? "?" : u.name)).sort()).toEqual(["Defender D", "Teemo, Strategist", "Vanilla Four"]);
    expect(p1View.chain).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, targets: ["v4"] })]);
  });

  test("(b) 'choose an enemy unit here' is a public target pick: with two attackers P2 is asked to pick between them (units elsewhere not offered)", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Second Attacker" }, "v1").unit(P1, "base", { might: 1 }, "homebody").build();
    await game.p1.move(["v4", "v1"], "bf2");
    await game.p1.passFocus();
    await game.p2.reveal("teemo");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["v1", "v4"]);
    await game.p2.pick("v4");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", targets: ["v4"] })]);
    expect(game.view(P1).chain[0]?.targets).toEqual(["v4"]);
  });

  test("(b) resolving: the top 5 are REVEALED — recorded as presented to all players, all five ids attributed to P2 (424.1) — and the attacker takes exactly 2 (two [Hidden] cards, 811.5); nothing is drawn", async () => {
    const game = await teemoFlippedIntoCombat();
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: TOP_FIVE, playerId: P2, turn: 3 });
    expect(game.state("v4").damage).toBe(2);
    expect(game.state("dd").damage).toBe(0);
    expect(game.state("teemo").damage).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("(b) 'then recycle the revealed cards': the five go to the bottom of P2's deck (N6 is now on top) with NO ordering prompt for P2 — play returns straight to the showdown", async () => {
    // RULING-CONFLICT: the expected answer has P2 order the recycled cards; CR 416.5 says 2+ cards recycled to the
    // Main Deck simultaneously go to the bottom in a RANDOM order (owner's choice is only for the Rune Deck,
    // 416.5.a) — engine follows CR: nobody is asked.
    const game = await triggerResolved();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    const deck = game.p2.deck();
    expect(deck[0]).toBe("n6");
    expect(deck.slice(-5).sort()).toEqual([...TOP_FIVE].sort());
    expect(deck.slice(0, -5)).not.toEqual(expect.arrayContaining(TOP_FIVE));
  });

  test("(b) once the ability has finished, the reveal window is CLOSED (424.1.a.3): neither P1's nor P2's view names any card in P2's deck (128.3 / 108.4.d) and the reveal record is redacted in both seats' observations", async () => {
    const game = await triggerResolved();
    expect(game.gameState.activeReveals ?? []).toEqual([]);
    for (const viewer of [P1, P2]) {
      expect(p2DeckAsSeenBy(game, viewer).every((c) => c === "?")).toBe(true);
      const seen = game.view(viewer);
      expect(seen.state.publicReveals?.at(-1)).toEqual({ cardIds: ["hidden", "hidden", "hidden", "hidden", "hidden"], playerId: P2, turn: 3 });
      const json = JSON.stringify(seen);
      for (const id of TOP_FIVE) {
        expect(json).not.toContain(`"${id}"`);
      }
    }
  });

  // Expected (416.5 / 108.4.d): the five recycled cards reach the bottom in a RANDOM order, so having watched the
  // reveal tells nobody the order of P2's bottom five. Actual: the engine recycles them one by one in reveal order
  // (h1 h2 n1 n2 n3) for every seed — the bottom-of-deck order is fully derivable from the public reveal.
  test("cards recycled together are put on the bottom in a random order (416.5)", async () => {
    const orders = new Set<string>();
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const game = await triggerResolved(seed);
      orders.add(game.p2.deck().slice(-5).join(","));
    }
    // Five independent shuffles of 5 cards all landing on the reveal order: p = (1/120)^5.
    expect(orders).not.toEqual(new Set([TOP_FIVE.join(",")]));
  });

  test("(b) combat then proceeds: after both pass Focus, P1 (attacker, 4 Might) gets the combat-damage assignment prompt listing BOTH defenders — D and Teemo", async () => {
    const game = await triggerResolved();
    await game.p1.passFocus();
    await game.p2.passFocus();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    expect(d?.kind === "distribute" ? d.buckets.map((b) => b.card).sort() : []).toEqual(["dd", "teemo"]);
    expect(d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.card, b.lethal])) : {}).toEqual({ dd: 3, teemo: 2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) face-up Teemo defends against Saboteur: the deck reveal is not "here" ───────────────────

  test("(c) Teemo already face-up at bf2 defends against an attacking Saboteur: the trigger still reveals all five publicly and H1/H2 still count → Saboteur takes 2; the five are recycled", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Defender D" }, "dd")
      .unit(P2, "bf2", TEEMO, "teemo")
      .unit(P1, "base", SABOTEUR, "sab")
      .deck(P2, [CONSULT, FAE, SKULKER, SKULKER, SKULKER, SKULKER], [...TOP_FIVE, "n6"])
      .build();
    await game.p1.move("sab", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, targets: ["sab"], triggered: true })]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: TOP_FIVE, playerId: P2 });
    expect(game.state("sab")).toMatchObject({ damage: 2, zone: "battlefield-bf2" });
    expect(game.p2.deck()[0]).toBe("n6");
    expect(game.p2.deck().slice(-5).sort()).toEqual([...TOP_FIVE].sort());
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });
});
