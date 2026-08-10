/**
 * Interaction: Harnessed Dragon (ogn-234-298) · Unit · Order · 8 + [order][order] · 6 Might
 *     "When you play me, kill an enemy unit."                                              — P1 plays it
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might · "[Deathknell] — Draw 1."  — P2's, at bf1
 *   × Immortal Phoenix (ogn-037-298) · Unit · Fury · 3 · "[Assault 2] When you kill a unit with a spell, you may
 *     pay [1][fury] to play me from your trash."                                          — in P1's trash
 *   CONTRAST: Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] · "Kill a unit."
 *   Probe for 'who is responsible': Solari Shrine (ogn-072-298) · Gear · "When you kill a stunned enemy unit, you may
 *     exhaust this to draw 1." — one for each player.
 *
 * Rules: 428.1.a.1 / .a.1.a (a Kill INSTRUCTION is an Active Kill), 428.1.a.1.b + 808.1.d.2 / 808.1.d.3 (a Deathknell
 * unit killed by an instruction first PENDS its Deathknell, noting last-known info, then goes to the trash), 428.2 /
 * 428.2.a (killed = board → trash), 428.5.b (the ability containing the kill instruction is responsible), 428.5.d
 * (an ability is attributed in addition to the object that created it → [Dragon's play ability, Dragon]; P1
 * responsible), Phoenix needs a SPELL among the attributed objects.
 *
 * Question: (a) the Sentry is removed by a kill instruction, not damage — does P2 still get the Deathknell draw, and
 * when relative to the Sentry reaching the trash / the Dragon's trigger finishing? (b) killedBy / responsible?
 * (c) does P1's Phoenix ('kill a unit with a spell') trigger? (d) contrast: P1 Vengeances the Sentry instead.
 *
 * Expected: (a) yes — Deathknell is pended, the Sentry hits P2's trash while the Dragon's trigger resolves, then the
 * P2-controlled Deathknell resolves: P2 draws 1. (b) [Dragon's ability, Dragon], responsible P1 — shown by P1's
 * (not P2's) Solari Shrine triggering when the Sentry is stunned. (c) no — no spell is attributed; Phoenix silent.
 * (d) Vengeance: same Deathknell handling, killedBy = [Vengeance] (a spell), P1 responsible → Phoenix triggers, P1
 * may pay [1][fury] and it is played from the trash exhausted; P2 still draws 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARNESSED_DRAGON = "ogn-234-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const VENGEANCE = "ogn-229-298";
const SOLARI_SHRINE = "ogn-072-298";
const SKULKER = "ogn-175-298"; // vanilla — P2's known top card

/**
 * P1's turn 2. P1: Phoenix in trash, a Solari Shrine in base, Dragon + Vengeance in hand, {13 energy, 4 order, 1 fury}
 * (Dragon 8+OO or Vengeance 4+OO, plus the Phoenix's [1][fury]). P2: controls bf1 with the Watchful Sentry (stunned
 * in the Shrine probe), a vanilla Grunt (2) in base, its own Solari Shrine, and a known top card.
 */
function board(opts: { sentryStunned?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 13, power: { fury: 1, order: 4 } })
    .battlefield("bf1", { controller: P2 })
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .gear(P1, SOLARI_SHRINE, "p1Shrine")
    .gear(P2, SOLARI_SHRINE, "p2Shrine")
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry", opts.sentryStunned ? { stunned: true } : undefined)
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, HARNESSED_DRAGON, "dragon")
    .hand(P1, VENGEANCE, "vengeance")
    .deckTop(P2, SKULKER, "p2Top");
}

interface Offer {
  readonly seat: string;
  readonly source?: string;
  readonly prompt: string;
}

/** Settle repeatedly; record every "you may" offer and answer it `answer`; stop at P1's open main phase. */
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

/** P1 plays the Dragon to base and names the Sentry for its play trigger; P1 holds priority over the targeted trigger. */
async function dragonPlayedSentryChosen(opts: { sentryStunned?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.play("dragon");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "dragon" } });
  await game.p1.pick("sentry");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P1, targets: ["sentry"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** …both pass → the Dragon's trigger resolves (kill instruction on the Sentry). */
async function dragonTriggerResolved(): Promise<Game> {
  const game = await dragonPlayedSentryChosen();
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain().some((c) => c.cardId === "dragon")).toBe(false);
  return game;
}

/** P1 casts Vengeance on the Sentry and both pass → it resolves. */
async function vengeanceResolved(opts: { sentryStunned?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("vengeance", { targets: "sentry" });
  expect(game.p1.resources()).toEqual({ energy: 9, power: { fury: 1, order: 2 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("vengeance")).toBe("trash");
  return game;
}

describe("(a) Harnessed Dragon's kill INSTRUCTION on Watchful Sentry — Deathknell still pays out, after the trigger", () => {
  test("the play: 8 + [order][order] paid, the Dragon is in P1's base exhausted, and its 'When you play me' trigger offers ENEMY units only (Sentry, Grunt — not P1's Squire)", async () => {
    const game = await board().build();
    await game.p1.play("dragon");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1, order: 2 } });
    expect(game.state("dragon")).toMatchObject({ isExhausted: true, might: 6, zone: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered.sort()).toEqual(["grunt", "sentry"]);
  });

  test("when the trigger resolves the Sentry is KILLED board → its owner's (P2's) trash with no damage on it (428.2), and its Deathknell is now a P2-controlled item on the chain — pended before the move, resolving after the Dragon's trigger (428.1.a.1.b / 808.1.d.2)", async () => {
    const game = await dragonTriggerResolved();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.trash()).toEqual(["sentry"]);
    expect(game.state("sentry")).toMatchObject({ damage: 0, owner: P2, zone: "trash" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true, type: "ability" })]);
    // Not drawn yet: the Deathknell waits on the chain (P2, its controller, holds priority first).
    expect(game.p2.hand()).not.toContain("p2Top");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("both pass → the Deathknell resolves: P2 draws exactly 1 (its known top card); chain empty, back to P1's main phase; the Grunt was never touched", async () => {
    const game = await dragonTriggerResolved();
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.hand()).toContain("p2Top");
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("end-to-end via settle(): Sentry in P2's trash, P2 +1 card, Dragon on P1's board — an instruction kill 'dies' just like a damage kill", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.play("dragon");
    await game.p1.pick("sentry");
    await drainOffers(game, "no");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.units("base")).toContain("dragon");
  });
});

describe("(b)/(c) attribution: [Dragon's play ability, Dragon], P1 responsible — no spell → Immortal Phoenix stays silent", () => {
  test("(c) P1 is NEVER offered the Phoenix replay: no yes/no from the Phoenix, it stays in the trash, the [1][fury] is unspent", async () => {
    const game = await dragonPlayedSentryChosen();
    const offers = await drainOffers(game, "yes"); // accept anything that IS offered
    expect(offers.filter((o) => o.source === "phoenix" || /Immortal Phoenix/.test(o.prompt))).toEqual([]);
    expect(offers).toEqual([]); // (unstunned Sentry: no Shrine either)
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1, order: 2 } });
    expect(game.chain()).toEqual([]);
  });

  test("(b) responsible player = P1 (428.5.b/.d): with the Sentry STUNNED, P1's Solari Shrine ('when YOU kill a stunned ENEMY unit') is offered — P2's Shrine is not, and still no Phoenix", async () => {
    const game = await dragonPlayedSentryChosen({ sentryStunned: true });
    const offers = await drainOffers(game, "no");
    expect(offers.filter((o) => o.seat === P1 && (o.source === "p1Shrine" || /Solari Shrine/.test(o.prompt)))).toHaveLength(1);
    expect(offers.filter((o) => o.seat === P2)).toEqual([]);
    expect(offers.filter((o) => o.source === "phoenix" || /Immortal Phoenix/.test(o.prompt))).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("trash");
  });

  test("(b) accepting P1's Shrine: it exhausts and P1 draws 1; P2 also still gets its Deathknell card", async () => {
    const game = await dragonPlayedSentryChosen({ sentryStunned: true });
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const offers = await drainOffers(game, "yes");
    expect(offers).toHaveLength(1);
    expect(game.state("p1Shrine").isExhausted).toBe(true);
    expect(game.state("p2Shrine").isExhausted).toBe(false);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.zoneOf("phoenix")).toBe("trash");
  });
});

describe("(d) CONTRAST — Vengeance (a spell) kills the Sentry: same Deathknell handling, but now the Phoenix triggers", () => {
  test("on resolution: Sentry → P2's trash, Vengeance → P1's trash; the chain now holds P2's Deathknell AND P1's Phoenix trigger, and P1 is asked at finalization whether to pay [1][fury] (383.3.b)", async () => {
    const game = await vengeanceResolved();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.trash()).toEqual(["sentry"]);
    expect(game.p1.trash().sort()).toEqual(["phoenix", "vengeance"]);
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true }),
        expect.objectContaining({ cardId: "phoenix", controller: P1, triggered: true }),
      ]),
    );
    expect(game.p2.hand()).not.toContain("p2Top"); // Deathknell not resolved yet
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
  });

  test("YES: P1 pays exactly [1][fury]; everything resolves → the Phoenix is PLAYED from the trash into P1's base, exhausted, 3 Might; P2 drew its Deathknell card", async () => {
    const game = await vengeanceResolved();
    const p2Hand = game.p2.hand().length;
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 8, power: { fury: 0, order: 2 } });
    // A destination could be asked (base / controlled battlefield) — P1 controls none, so base; take it if asked.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1) {
        const base = d.options.find((o) => o.key === "base" || /base/i.test(o.label));
        await game.p1.pick(base ? base.key : d.options[0]!.key);
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.units("base")).toContain("phoenix");
    expect(game.state("phoenix")).toMatchObject({ damage: 0, isExhausted: true, might: 3, zone: "base" });
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.hand()).toContain("p2Top");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("NO: the Phoenix stays in the trash, nothing more is paid, and P2 still draws 1 off the Deathknell", async () => {
    const game = await vengeanceResolved();
    const p2Hand = game.p2.hand().length;
    await game.p1.no();
    await drainOffers(game, "no");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 9, power: { fury: 1, order: 2 } });
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
  });

  test("stunned Sentry + Vengeance: killedBy = [Vengeance], responsible P1 → BOTH P1's Shrine and P1's Phoenix are offered; P2's Shrine never is", async () => {
    const game = await board({ sentryStunned: true }).build();
    await game.p1.cast("vengeance", { targets: "sentry" });
    const offers = await drainOffers(game, "no");
    expect(offers.every((o) => o.seat === P1)).toBe(true);
    expect(offers.filter((o) => o.source === "p1Shrine" || /Solari Shrine/.test(o.prompt))).toHaveLength(1);
    expect(offers.filter((o) => o.source === "phoenix" || /Immortal Phoenix/.test(o.prompt))).toHaveLength(1);
    expect(game.zoneOf("sentry")).toBe("trash");
  });
});
