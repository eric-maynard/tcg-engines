/**
 * Interaction: Nocturne, Horrifying (ogn-194-298)
 *     "As you look at or reveal me from the top of your deck, you may banish me.
 *      If you do, you may play me for [rainbow]."
 *   × Teemo, Strategist (ogn-121-298)
 *     "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your
 *      Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then
 *      recycle the revealed cards."
 *   × Seal of Discord (ogn-204-298) "[Exhaust]: [Reaction] — [Add] [chaos]."
 *
 * P1 attacks bf2 (P2's battlefield). P2 flips hidden Teemo as a DEFENDER; his trigger reveals
 * P2's top 5, whose 3rd card is Nocturne. Mid-resolution of Teemo's ability:
 *
 * (a) Does the 3rd card of a top-5 reveal count as "revealed from the top of your deck", and
 *     does the banish-then-play run before Teemo finishes?  (354.3, 419.3.b)
 * (b) Is the DEFENDED battlefield a legal destination for the play — and what does the
 *     attacker's mirror image look like?  (355.2.a, 323.2.a, 143.4)
 * (c) Nocturne has no [Action]/[Reaction] — what permission lets it be played inside a closed
 *     chain?  (358.4, 419.3.b)
 * (d) What does "play me for [rainbow]" do to the cost pipeline, and is the play offered with
 *     0 Power in the pool but a ready Seal of Discord on the board?  (356.1.a, 356.3, 357.1.a,
 *     429.3)
 * (e) Does the banished Nocturne count toward "deal 1 for each card with [Hidden] revealed",
 *     and is it swept up by "then recycle the revealed cards"?  (359.3.e.6, 811.5)
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const TEEMO = "ogn-121-298";
const SEAL = "ogn-204-298";
const PORO = "ogn-171-298"; // Mystic Poro — [Vision]: look at the top card of your Main Deck
const HID_SPELL = "ogn-083-298"; // spell with [Hidden]
const HID_UNIT = "ogn-097-298"; // unit with [Hidden]
const PLAIN = "ogn-175-298"; // Shipyard Skulker — no [Hidden]

/** The card ids / zone keys a `pick` decision is offering right now. */
function offered(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.key) : [];
}

/**
 * P1 attacks bf2 with a 5-Might unit. bf1 belongs to P1, bf2 to P2. P2 has Teemo hidden at
 * bf2 and a Seal of Discord in base; P2's top 5 are Hidden, Hidden, NOCTURNE, Hidden, plain.
 */
function board(opts: { power?: Record<string, number>; energy?: number; nocturneAt?: 3 | 6 } = {}) {
  const noc = opts.nocturneAt ?? 3;
  const deck = noc === 3
    ? [HID_SPELL, HID_UNIT, NOCTURNE, HID_SPELL, PLAIN, PLAIN]
    : [HID_SPELL, HID_UNIT, PLAIN, HID_SPELL, PLAIN, NOCTURNE];
  return scenario()
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1 }, "p1holder")
    .unit(P2, "bf2", { might: 1 }, "guard")
    .unit(P1, "base", { might: 5 }, "attacker")
    .facedown(P2, "bf2", TEEMO, "teemo")
    .gear(P2, SEAL, "seal")
    .resources(P2, { energy: opts.energy ?? 3, power: opts.power ?? { rainbow: 1 } })
    .deck(P2, deck, ["c1", "c2", "c3", "c4", "c5", "c6"]);
}

/**
 * Attack, flip Teemo as defender, and let his trigger start resolving — stopping at
 * Nocturne's "you may banish me" (priority is passed by hand so the showdown itself is
 * never resolved out from under the assertions).
 */
async function upToBanishOffer(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) {
  await game.p1.move("attacker", "bf2");
  await game.p1.passFocus();
  await game.p2.reveal("teemo");
  await game.p2.passPriority();
  await game.p1.passPriority();
}

describe("Nocturne off Teemo's defend-reveal, played into the ongoing showdown", () => {
  test("(a) the 3rd card of a top-5 reveal IS 'revealed from the top of your deck': the election is offered mid-resolution, before Teemo's damage and recycle", async () => {
    const game = await board().build();
    await upToBanishOffer(game);

    // rule 354.3 — the reveal happens as Teemo's ability resolves, so Nocturne's
    // "as you … reveal me" ability is offered inside that resolution.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "c3" } });
    expect(game.state("attacker").damage).toBe(0); // Teemo's "deal 1 for each" has not run yet
    expect(game.zoneOf("c1")).toBe("mainDeck"); // nor its "then recycle the revealed cards"

    await game.p2.yes();
    expect(game.zoneOf("c3")).toBe("banishment");
    expect(game.state("attacker").damage).toBe(0); // still inside the same resolution
  });

  test("(a) a Nocturne BELOW the top 5 is never revealed, so nothing is offered", async () => {
    const game = await board({ nocturneAt: 6 }).build();
    await upToBanishOffer(game);
    // Teemo resolved outright: 3 Hidden among c1..c5, all five recycled, c6 (Nocturne) untouched.
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("attacker").damage).toBe(3);
    expect(game.zoneOf("c6")).toBe("mainDeck");
    expect(game.p2.deck()[0]).toBe("c6");
    expect(game.p2.banishment()).toEqual([]);
  });

  test("(a) opting into the play makes it a PENDING chain item; Teemo's remaining instructions finish first (419.3.b)", async () => {
    const game = await board().build();
    await upToBanishOffer(game);
    await game.p2.yes(); // banish me
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes(); // play me for [rainbow]

    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "c3", controller: P2, pending: true, triggered: false }),
    ]);
    // Teemo's damage (and recycle) ran while the play sat pending.
    expect(game.state("attacker").damage).toBe(3);
    expect(game.zoneOf("c1")).toBe("mainDeck"); // recycled to the BOTTOM
    expect(game.p2.deck().slice(-4)).toEqual(["c5", "c4", "c2", "c1"]);
  });

  test("(b) the DEFENDED battlefield P2 controls is a legal destination; the attacker's battlefield is not (355.2.a)", async () => {
    const game = await board().build();
    await upToBanishOffer(game);
    await game.p2.yes();
    await game.settle();
    await game.p2.yes();

    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "c3" } });
    // base + every battlefield P2 CONTROLS. bf2 is contested but still P2's; bf1 is P1's.
    expect(offered(game).sort()).toEqual(["base", "battlefield-bf2"]);
  });

  test("(b) played to bf2 it enters exhausted and joins the showdown as a DEFENDER (323.2.a, 143.4)", async () => {
    const game = await board().build();
    await upToBanishOffer(game);
    await game.p2.yes();
    await game.settle();
    await game.p2.yes();
    await game.p2.pick("battlefield-bf2");

    expect(game.locationOf("c3")).toBe("bf2");
    expect(game.state("c3").isExhausted).toBe(true);
    expect(game.state("c3").combatRole).toBe("defender");

    // 5 Might of attacker vs guard 1 + Teemo 2 + Nocturne 4 → the attack is repelled.
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the attacker's mirror: a revealer who controls no battlefield may only play it to base", async () => {
    // Same election, reached through [Vision] instead of Teemo. The only battlefield on the
    // board is the enemy's (the contested one, from an attacker's point of view), so the
    // destination set collapses to base and no destination is even asked.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3 }, "guard")
      .hand(P1, PORO, "poro")
      .deckTop(P1, NOCTURNE, "noc")
      .build();
    await game.p1.play("poro");
    await game.settle();
    await game.p1.yes(); // banish me
    await game.settle();
    await game.p1.yes(); // play me for [rainbow]
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.locationOf("noc")).toBe("base");
  });

  test("(c) no [Action]/[Reaction] is needed — the instruction is the permission (358.4, 419.3.b)", async () => {
    const game = await board().hand(P2, NOCTURNE, "handNoc").build();
    await upToBanishOffer(game);

    // Nocturne carries only [Ganking]; a second copy in hand cannot be played into the
    // closed chain even with the resources for it — the effect-instructed play can.
    expect(game.state("c3").keywords).toEqual(["Ganking"]);
    expect(game.p2.can("play", "handNoc")).toBe(false);

    await game.p2.yes();
    await game.settle();
    await game.p2.yes();
    await game.p2.pick("battlefield-bf2");
    expect(game.locationOf("c3")).toBe("bf2");
  });

  test("(d) 'for [rainbow]' REPLACES the base cost: 1 Power of any domain, the 4 energy and the [chaos] pip are gone (356.1.a)", async () => {
    const game = await board({ energy: 3, power: { rainbow: 1 } }).build();
    await upToBanishOffer(game);
    await game.p2.yes();
    await game.settle();
    await game.p2.yes();
    await game.p2.pick("battlefield-bf2");

    expect(game.p2.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
  });

  test("(d) with 0 Power the play is NOT offered, even with a ready Seal of Discord on the board", async () => {
    // DESIGN (DESIGN.md §Paying costs) — paying is MANUAL, a deliberate deviation from
    // 357.1.a / 429.3: an untapped rune or an uncracked Seal is never credited toward a
    // cost and never auto-activated, so the [rainbow] is simply unpayable here.
    const game = await board({ energy: 3, power: {} }).build();
    await upToBanishOffer(game);

    expect(game.state("seal").isReady).toBe(true);
    // The Seal is not offered alongside the prompt either — nothing credits it mid-payment.
    expect(game.p2.legal()).toEqual([]);

    await game.p2.yes(); // banish me — the banish itself is free and still happens
    expect(game.zoneOf("c3")).toBe("banishment");

    // No "play me for [rainbow]" opt-in follows; Teemo simply finishes resolving.
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("attacker").damage).toBe(3);
    expect(game.p2.banishment()).toEqual(["c3"]);
  });

  test("(d) cracking the Seal FIRST puts [chaos] in the pool, and then the play is offered and pays it", async () => {
    const game = await board({ energy: 3, power: {} }).build();
    await game.p1.move("attacker", "bf2");
    await game.p1.passFocus();
    await game.p2.activate("seal"); // [Reaction] — [Add] [chaos], during the showdown
    expect(game.p2.resources()).toEqual({ energy: 3, power: { chaos: 1 } });

    await game.p2.reveal("teemo");
    await game.settle();
    await game.p2.yes(); // banish me
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 }); // now offered
    await game.p2.yes();
    await game.p2.pick("battlefield-bf2");

    expect(game.locationOf("c3")).toBe("bf2");
    // [rainbow] is one Power of ANY domain — the [chaos] pays it, energy is untouched.
    expect(game.p2.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
  });

  test("(e) Nocturne has no [Hidden], so the damage is 3 either way, and the banished card is NOT recycled", async () => {
    const played = await board().build();
    await upToBanishOffer(played);
    await played.p2.yes();
    await played.settle();
    await played.p2.yes();
    await played.p2.pick("battlefield-bf2");

    expect(played.state("attacker").damage).toBe(3); // c1, c2, c4 — Nocturne never counted
    // It left for the banishment zone before "then recycle the revealed cards" ran, so only
    // the other four go to the bottom (359.3.e.6).
    expect(played.p2.deck().slice(-4)).toEqual(["c5", "c4", "c2", "c1"]);
    expect(played.p2.deck()).not.toContain("c3");

    // Control: decline the banish and all five revealed cards are recycled, damage unchanged.
    const declined = await board().build();
    await upToBanishOffer(declined);
    await declined.p2.no();
    expect(declined.state("attacker").damage).toBe(3);
    expect(declined.zoneOf("c3")).toBe("mainDeck");
    expect(declined.p2.deck().slice(-5).sort()).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });
});
