/**
 * Interaction: Challenge (ogn-128-298) · Spell · Body · 2+[body] · Action
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Immortal Phoenix (ogn-037-298) "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   × Solari Shrine (ogn-072-298) · Gear "When you kill a stunned enemy unit, you may exhaust this to draw 1."
 *   (+ contrast: Falling Comet ogn-085-298 "Deal 6 to a unit at a battlefield.")
 *
 * Question: P1 has Immortal Phoenix in trash and a Solari Shrine in base; P2 also controls a Solari Shrine.
 *   (a) P1's 4-Might F vs P2's STUNNED 3-Might E. P1 casts Challenge; E takes 4 and dies in the Cleanup. Is E
 *       "killed by a spell" (Phoenix) and/or "killed by P1" (P1's Shrine)?
 *   (b) Reverse: P1's STUNNED 3-Might F vs P2's 4-Might E; P1 casts Challenge and P1's own F dies. P1 cast the
 *       spell — who is credited with the kill, and does P2's Shrine trigger (on P1's turn)?
 *   (c) Contrast: P1's Falling Comet kills stunned E instead — Phoenix and Shrine?
 *
 * Rules: 417.6.b.3 (a spell naming units as the source: the damage is dealt by those units, NOT by the spell —
 * Challenge is the rule's own example), 417.6.b.4 (the controller of the source unit is responsible for the deal,
 * even the enemy unit's controller under Challenge), 428.1.a.2 / 428.4 (lethal damage kills at the Cleanup),
 * 428.5.c / 428.5.c.1 (a Cleanup kill is attributed to what dealt the damage; the player responsible for the deal
 * is responsible for the kill), 428.2, 417.6.a (no named source → the spell itself is the source).
 *
 * Expected:
 *   (a) killedBy = F (a unit) / responsible = P1. P1 killed a stunned enemy unit → P1's Shrine offers its draw.
 *       No spell in the attribution → Phoenix does NOT trigger. E → P2's trash; stunned E still deals its 3 back
 *       (stun only blocks combat damage) → F survives with 3 damage. P2's Shrine: silent.
 *   (b) F takes 4 and dies; source = E, responsible = P2 (417.6.b.4) although P1 cast Challenge. F was stunned and
 *       enemy to P2 → P2's Shrine triggers (on P1's turn). P1's Shrine and P1's Phoenix: silent.
 *   (c) Falling Comet is the source (417.6.a): killedBy = the spell, responsible = P1 → BOTH P1's Shrine and the
 *       Phoenix trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const SOLARI_SHRINE = "ogn-072-298";
const FALLING_COMET = "ogn-085-298";

interface Sides {
  readonly f: { might: number; stunned?: boolean };
  readonly e: { might: number; stunned?: boolean };
}

/**
 * P1's turn. P1: Phoenix in trash, Shrine in base, Challenge + Falling Comet in hand, 8 energy + 1 body + 1 fury
 * (Challenge 2+[body] or Comet 5, plus the Phoenix's [1][fury]). P2: its own Shrine in base. bf1 is P2's; E stands
 * there (so the Comet contrast can reach it); F is in P1's base (Challenge has no location requirement).
 */
function board(s: Sides) {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .gear(P1, SOLARI_SHRINE, "p1Shrine")
    .gear(P2, SOLARI_SHRINE, "p2Shrine")
    .unit(P1, "base", { might: s.f.might, name: "Friendly F" }, "F", s.f.stunned ? { stunned: true } : undefined)
    .unit(P2, "bf1", { might: s.e.might, name: "Enemy E" }, "E", s.e.stunned ? { stunned: true } : undefined)
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, FALLING_COMET, "comet")
    .deckTop(P2, "ogn-175-298", "p2Top");
}

const A: Sides = { e: { might: 3, stunned: true }, f: { might: 4 } };
const B: Sides = { e: { might: 4 }, f: { might: 3, stunned: true } };

interface Offer {
  readonly seat: string;
  readonly source?: string;
  readonly prompt: string;
}

/** Settle; record every "you may" offer (seat + source) and answer it `answer`; stop at the open main phase. */
async function drainOffers(game: Game, answer: "yes" | "no" = "no"): Promise<Offer[]> {
  const offers: Offer[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
      break;
    }
    offers.push({ prompt: d.prompt, seat: d.seat, source: d.source?.cardId });
    await (answer === "yes" ? game.seat(d.seat).yes() : game.seat(d.seat).no());
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return offers;
}

function isFrom(o: Offer, card: string, name: RegExp): boolean {
  return o.source === card || (o.source === undefined && name.test(o.prompt));
}

describe("Challenge × Immortal Phoenix / Solari Shrine — kill credit goes to the units, not the spell", () => {
  // ── (a) P1's 4-Might F vs P2's stunned 3-Might E ───────────────────────────────────────────────

  test("(a) resolution: E takes 4 and dies to P2's trash; stunned E still deals its 3 back — F survives in base with 3 damage; Challenge → trash", async () => {
    const game = await board(A).build();
    await game.p1.cast("challenge", { targets: ["F", "E"] });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { body: 0, fury: 1 } });
    await drainOffers(game, "no");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p2.trash()).toContain("E");
    expect(game.zoneOf("F")).toBe("base");
    expect(game.state("F").damage).toBe(3);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) P1 killed a stunned enemy unit (F dealt it, P1 responsible — 417.6.b.4 / 428.5.c.1): P1's Solari Shrine offers its draw; P2's Shrine does not", async () => {
    const game = await board(A).build();
    await game.p1.cast("challenge", { targets: ["F", "E"] });
    const offers = await drainOffers(game, "no");
    const p1Shrine = offers.filter((o) => o.seat === P1 && isFrom(o, "p1Shrine", /Solari Shrine/));
    expect(p1Shrine).toHaveLength(1);
    expect(offers.filter((o) => o.seat === P2)).toEqual([]);
  });

  test("(a) accepting P1's Shrine: it exhausts and P1 draws exactly 1", async () => {
    const game = await board(A).build();
    await game.p1.cast("challenge", { targets: ["F", "E"] });
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await drainOffers(game, "no");
    expect(game.state("p1Shrine").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("(a) NOT 'killed with a spell' (417.6.b.3): Immortal Phoenix is never offered and stays in the trash; the [1][fury] is unspent", async () => {
    const game = await board(A).build();
    await game.p1.cast("challenge", { targets: ["F", "E"] });
    const offers = await drainOffers(game, "yes"); // say yes to everything that IS offered
    expect(offers.filter((o) => isFrom(o, "phoenix", /Immortal Phoenix/))).toEqual([]);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.energy()).toBe(6);
  });

  // ── (b) P1's stunned 3-Might F vs P2's 4-Might E ───────────────────────────────────────────────

  test("(b) resolution: P1's own F takes 4 and dies to P1's trash; E survives at bf1 with 3 damage", async () => {
    const game = await board(B).build();
    await game.p1.cast("challenge", { targets: ["F", "E"] });
    await drainOffers(game, "no");
    expect(game.zoneOf("F")).toBe("trash");
    expect(game.p1.trash()).toContain("F");
    expect(game.zoneOf("E")).toBe("battlefield-bf1");
    expect(game.state("E").damage).toBe(3);
  });

  test("(b) the kill is credited to E / P2 (417.6.b.4) even though P1 cast Challenge: P2's Solari Shrine triggers on P1's turn — P2 may exhaust it and draw 1", async () => {
    const game = await board(B).build();
    await game.p1.cast("challenge", { targets: ["F", "E"] });
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    const rest = await drainOffers(game, "no");
    expect(rest).toEqual([]);
    expect(game.state("p2Shrine").isExhausted).toBe(true);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.hand()).toContain("p2Top");
  });

  test("(b) P1 gets nothing: neither P1's Shrine (not P1's kill, not an enemy unit) nor the Phoenix (P1 didn't kill; no spell credited) is offered", async () => {
    const game = await board(B).build();
    await game.p1.cast("challenge", { targets: ["F", "E"] });
    const offers = await drainOffers(game, "no");
    expect(offers.filter((o) => o.seat === P1)).toEqual([]);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ seat: P2 });
    expect(isFrom(offers[0] as Offer, "p2Shrine", /Solari Shrine/)).toBe(true);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.state("p1Shrine").isReady).toBe(true);
  });

  // ── (c) contrast: Falling Comet on stunned E ───────────────────────────────────────────────────

  test("(c) Falling Comet has no named source → the spell dealt it (417.6.a): stunned E dies and P1 is offered BOTH the Shrine draw and the Phoenix replay", async () => {
    const game = await board(A).build();
    await game.p1.cast("comet", { targets: "E" });
    expect(game.p1.energy()).toBe(3);
    const offers = await drainOffers(game, "no");
    expect(game.zoneOf("E")).toBe("trash");
    expect(offers.every((o) => o.seat === P1)).toBe(true);
    expect(offers.filter((o) => isFrom(o, "p1Shrine", /Solari Shrine/))).toHaveLength(1);
    expect(offers.filter((o) => isFrom(o, "phoenix", /Immortal Phoenix/))).toHaveLength(1);
  });

  test("(c) accepting both: Shrine exhausted + 1 card drawn, Phoenix played from trash for [1][fury]", async () => {
    const game = await board(A).build();
    await game.p1.cast("comet", { targets: "E" });
    const hand = game.p1.hand().length;
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered") {
        break;
      }
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
        continue;
      }
      // The Phoenix's play may ask base vs battlefield — take base.
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("base");
        continue;
      }
      break;
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("p1Shrine").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1, fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
