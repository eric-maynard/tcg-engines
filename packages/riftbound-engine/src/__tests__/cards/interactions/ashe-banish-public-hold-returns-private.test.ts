/**
 * Interaction: Ashe, Focused (unl-169-219, Champion Unit, 5+[order], 4) "When you play me, choose an
 *   opponent. They reveal their hand. Choose a card revealed this way and banish it. When they hold,
 *   return it to their hand (even if I'm no longer on the board)."
 *   × Undertitan (sfd-175-221, Unit, 6+[order], 5) "When you play me, give your other units +2 [Might]
 *   this turn. As I'm revealed from your deck, [Add] [2]."
 *
 * Question: privacy follows the zone (128.2.a) across reveal → banish → return-to-hand. P2's hand is
 * {Undertitan, X}. (a) On resolution both are revealed — does Undertitan's "revealed from your DECK"
 * add [2] when it is revealed from HAND? P1 banishes Undertitan. (b) After Ashe's ability finishes,
 * is X anonymous again to P1 while Undertitan in P2's banishment is face-up to both seats? (c) Ashe is
 * killed; on P2's next turn P2 holds — does the delayed trigger still fire; Undertitan goes banishment
 * → P2's hand: in P1's view is the new hand card anonymous (hand = Private) even though its identity is
 * public history, does P2's hand count rise by exactly one, and does Undertitan [Add] [2] on that move
 * (not a reveal, not from the deck)? (d) Contrasts: P2 never holds → stays banished, public,
 * indefinitely; P2 holds two battlefields in one Beginning Phase → returned once, hand +1 not +2.
 *
 * Rules: 424.1 / 424.3.a (revealing a hand applies the Revealed state to every card in it — public to
 * all seats — for the duration of the ability, 424.1.a.3); Undertitan's [Add] is conditioned on being
 * revealed FROM THE DECK; 427.1 (banish → owner's banishment); 108.6.e (banishment is Public);
 * 128.2.a (a card's privacy is its zone's); 108.7.c / 128.4 (hand is Private — only the owner reads
 * faces); 108.7.e (hand COUNT is public); Ashe ruling: the delayed return trigger is independent of
 * Ashe being on the board.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game, Observation, PickDecision } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const ASHE = "unl-169-219";
const UNDERTITAN = "sfd-175-221";
const SKULKER = "ogn-175-298"; // "X" — a vanilla 3-Might unit whose identity does not matter
const ZAP6 = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Obliterate",
  rulesText: "[Action] Deal 6 to a unit.",
  timing: "action",
} as const;

/** P1 about to play Ashe; P2's hand = {Undertitan, X}; P2 durably controls `holds` battlefields. */
function board(holds: 0 | 1 | 2 = 1) {
  const b = scenario()
    .resources(P1, { energy: 5, power: { order: 1 } }) // exactly Ashe's 5 + [order]
    .resources(P2, { energy: 1 }) // a marker: any [Add] would move it off 1 during P1's turn
    .battlefield("bf1", { controller: holds >= 1 ? P2 : null })
    .battlefield("bf2", { controller: holds >= 2 ? P2 : null })
    .hand(P2, UNDERTITAN, "titan")
    .hand(P2, SKULKER, "x")
    .hand(P1, ASHE, "ashe")
    .hand(P1, ZAP6, "zap");
  if (holds >= 1) {
    b.unit(P2, "bf1", { might: 2, name: "Holder One" }, "h1");
  }
  if (holds >= 2) {
    b.unit(P2, "bf2", { might: 2, name: "Holder Two" }, "h2");
  }
  return b;
}

/** The entries of P2's hand as `viewer` sees them ("HIDDEN" for a redacted card, else its id). */
function p2HandAsSeenBy(view: Observation): string[] {
  return (view.zones.hand ?? []).filter((c: CardView) => c.owner === P2).map((c) => (isHiddenView(c) ? "HIDDEN" : c.id));
}

function banishmentAsSeenBy(view: Observation): string[] {
  return (view.zones.banishment ?? []).map((c) => (isHiddenView(c) ? "HIDDEN" : c.id));
}

/** Play Ashe, let her trigger resolve up to the reveal-and-pick, banish Undertitan, finish resolving. */
async function playAsheBanishTitan(game: Game): Promise<void> {
  await game.p1.play("ashe", { to: "base" });
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  await game.p1.pick("titan");
  await game.settle();
}

async function killAshe(game: Game): Promise<void> {
  await game.p1.cast("zap", { targets: "ashe" });
  await game.settle();
  expect(game.zoneOf("ashe")).toBe("trash");
}

describe("Ashe, Focused × Undertitan — privacy follows the zone across reveal → banish → return-to-hand", () => {
  test("premise: before Ashe is played P2's two hand cards are anonymous in P1's view and face-up in P2's own view (108.7.c/128.4)", async () => {
    const game = await board().build();
    expect(p2HandAsSeenBy(game.p1.view())).toEqual(["HIDDEN", "HIDDEN"]);
    expect(p2HandAsSeenBy(game.p2.view()).sort()).toEqual(["titan", "x"]);
  });

  // ---- (a) the reveal ---------------------------------------------------------------------------

  test("(a) on resolution P2's WHOLE hand is Revealed (424.3.a): P1's decision lists both cards by face, and while the prompt is open both are face-up in P1's live view as well as P2's", async () => {
    const game = await board().build();
    await game.p1.play("ashe", { to: "base" });
    expect((await game.settle()).reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, semantics: "from-revealed" });
    expect(d.options.map((o) => o.card).sort()).toEqual(["titan", "x"]);
    expect(d.options.map((o) => o.label).sort()).toEqual(["Shipyard Skulker [x]", "Undertitan [titan]"]);
    expect(p2HandAsSeenBy(game.p1.view()).sort()).toEqual(["titan", "x"]);
    expect(p2HandAsSeenBy(game.p2.view()).sort()).toEqual(["titan", "x"]);
  });

  test("(a) Undertitan's 'As I'm revealed from your DECK, [Add] [2]' does NOT fire on a reveal from HAND: P2's energy is unchanged through the whole ability, and no reveal event is tallied for it", async () => {
    const game = await board().build();
    expect(game.p2.energy()).toBe(1);
    await game.p1.play("ashe", { to: "base" });
    await game.settle();
    expect(game.p2.energy()).toBe(1); // revealed now — nothing added
    await game.p1.pick("titan");
    await game.settle();
    expect(game.p2.energy()).toBe(1);
    expect(Object.keys(game.gameState.turnEventCounts ?? {}).filter((k) => k.includes("c:titan"))).toEqual([]);
    expect(game.chain()).toHaveLength(0);
  });

  test("(a) P1 picks Undertitan → it moves hand → P2's BANISHMENT (427.1: owner's zone), still owned by P2; X stays in P2's hand; nothing went to a trash", async () => {
    const game = await board().build();
    await playAsheBanishTitan(game);
    expect(game.zoneOf("titan")).toBe("banishment");
    expect(game.state("titan").owner).toBe(P2);
    expect(game.p2.banishment()).toEqual(["titan"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.hand()).toEqual(["x"]);
    expect(game.p2.trash()).toEqual([]);
  });

  // ---- (b) after the ability finishes ----------------------------------------------------------

  test("(b) once Ashe's ability has finished, X's Revealed state ends (424.1.a.3): P1's live view shows P2's hand as ONE anonymous card, while Undertitan in the public banishment (108.6.e) is face-up by id to BOTH seats", async () => {
    const game = await board().build();
    await playAsheBanishTitan(game);
    expect(p2HandAsSeenBy(game.p1.view())).toEqual(["HIDDEN"]);
    expect(p2HandAsSeenBy(game.p2.view())).toEqual(["x"]);
    expect(banishmentAsSeenBy(game.p1.view())).toEqual(["titan"]);
    expect(banishmentAsSeenBy(game.p2.view())).toEqual(["titan"]);
    const summary = game.p1.listZones({ all: true }).filter((z) => z.owner === P2);
    expect(summary).toEqual(
      expect.arrayContaining([
        { count: 1, owner: P2, visible: false, zone: "hand" },
        { count: 1, owner: P2, visible: true, zone: "banishment" },
      ]),
    );
    expect(game.gameState.visibilityGrants ?? []).toEqual([]); // no lingering "look at their hand" grant
  });

  // ---- (c) Ashe dies; P2 holds ------------------------------------------------------------------

  test("(c) Ashe is killed the same turn; on P2's Beginning Phase P2 holds bf1 → the delayed trigger still goes on the chain and resolves: Undertitan banishment → P2's HAND (P2 sees it), P2's banishment is empty", async () => {
    const game = await board().build();
    await playAsheBanishTitan(game);
    await killAshe(game);
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.p2.points()).toBe(1); // the hold happened
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ashe", controller: P1, triggered: true })]);
    expect(game.zoneOf("titan")).toBe("banishment"); // not yet — the trigger is a chain item
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("titan")).toBe("hand");
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["x", "titan"]));
    expect(game.p2.banishment()).toEqual([]);
    expect(p2HandAsSeenBy(game.p2.view())).toEqual(expect.arrayContaining(["x", "titan"]));
  });

  test("(c) in P1's view the returned card is ANONYMOUS — every entry of P2's hand is redacted (no id/defId leaks just because P1 'knows'), the public hand COUNT rose by exactly one for it (108.7.e: X + turn draw + Undertitan = 3), and the public banishment now reads empty", async () => {
    const game = await board().build();
    await playAsheBanishTitan(game);
    await killAshe(game);
    const before = p2HandAsSeenBy(game.p1.view());
    expect(before).toEqual(["HIDDEN"]); // just X
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const after = p2HandAsSeenBy(game.p1.view());
    expect(after).toEqual(["HIDDEN", "HIDDEN", "HIDDEN"]); // X, Undertitan, the Draw-step card — all faceless
    expect(after.length).toBe(before.length + 1 /* draw */ + 1 /* Undertitan */);
    const raw = (game.p1.view().zones.hand ?? []).filter((c) => c.owner === P2);
    for (const entry of raw) {
      expect(isHiddenView(entry)).toBe(true);
      expect(JSON.stringify(entry)).not.toContain("titan");
      expect(JSON.stringify(entry)).not.toContain(UNDERTITAN);
    }
    expect(banishmentAsSeenBy(game.p1.view())).toEqual([]);
    expect(game.p1.listZones({ all: true }).filter((z) => z.owner === P2 && (z.zone === "hand" || z.zone === "banishment"))).toEqual(
      expect.arrayContaining([
        { count: 3, owner: P2, visible: false, zone: "hand" },
        { count: 0, owner: P2, visible: true, zone: "banishment" },
      ]),
    );
  });

  test("(c) the banishment → hand move is neither a reveal nor from the deck: no reveal event is tallied for Undertitan on P2's turn and P2's pool shows no [Add] (0 energy entering the Main Phase); no invariant violations", async () => {
    const game = await board().build();
    await playAsheBanishTitan(game);
    await killAshe(game);
    await game.advanceTurn();
    expect(game.zoneOf("titan")).toBe("hand");
    const keys = Object.keys(game.gameState.turnEventCounts ?? {});
    expect(keys.filter((k) => k.startsWith("reveal"))).toEqual([]);
    expect(keys.filter((k) => k.includes("c:titan"))).toEqual([]);
    expect(game.p2.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) contrasts ------------------------------------------------------------------------------

  test("(d) P2 never holds (controls no battlefield): nothing ever returns it — three turns later Undertitan is still a PUBLIC banished card visible by id to both seats, and P2's hand never gained it", async () => {
    const game = await board(0).build();
    await playAsheBanishTitan(game);
    await game.advanceTurn(); // P2 — holds nothing
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("titan")).toBe("banishment");
    await game.advanceTurn(); // P1
    await game.advanceTurn(); // P2 again
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("titan")).toBe("banishment");
    expect(banishmentAsSeenBy(game.p1.view())).toEqual(["titan"]);
    expect(banishmentAsSeenBy(game.p2.view())).toEqual(["titan"]);
    expect(game.p2.hand()).not.toContain("titan");
    expect(p2HandAsSeenBy(game.p1.view()).every((e) => e === "HIDDEN")).toBe(true);
  });

  test("(d) P2 holds TWO battlefields in the same Beginning Phase: the first hold's trigger returns Undertitan; the second finds nothing in banishment → hand +1 for it in total (not +2), both hold points scored, no duplicate object, no violations", async () => {
    const game = await board(2).build();
    await playAsheBanishTitan(game);
    const handBefore = game.p2.hand().length; // 1 (X)
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(2);
    expect(game.zoneOf("titan")).toBe("hand");
    expect(game.p2.hand()).toHaveLength(handBefore + 1 /* draw */ + 1 /* Undertitan, once */);
    expect(game.p2.hand().filter((c) => c === "titan")).toHaveLength(1);
    expect(game.findAll({ defId: UNDERTITAN })).toEqual(["titan"]);
    expect(game.p2.banishment()).toEqual([]);
    expect(p2HandAsSeenBy(game.p1.view())).toEqual(["HIDDEN", "HIDDEN", "HIDDEN"]);
    expect(game.chain()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });
});
