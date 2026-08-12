/**
 * Interaction: Frigid Touch (sfd-066-221) · Spell · Mind · 2 · [Reaction] · [Repeat] [2]
 *     "Give a unit -2 [Might] this turn."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might · "[Deflect]"   — the only interesting target
 *   × Gold (sfd-t03) · Gear token · "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   plus one inline 0-cost "Filler Pinger" whose play-trigger raises a real surcharged TARGET PROMPT
 *   (the only shape in which a [Deflect] surcharge is owed from inside an open prompt).
 *
 * Question. P1 has an empty Power pool, one ready Chaos rune and one ready Gold token.
 *   (a) P1 covers the [rainbow] with a recycle and then backs out. Where is the pip — pool or refunded?
 *       Does the rune come back ready?
 *   (b) One Rewind afterwards: does it take back exactly the Add, and leave the abandoned play abandoned
 *       (no prompt re-opens)?
 *   (c) Same with the Gold cracked instead: is the Gold's Reaction [Add] even OFFERED while a surcharged
 *       pick is open, and once cracked and the play dropped, is the Gold gone for good?
 *   (d) Can a player tell "play cancelled" from "Rewound their last action"?
 *
 * Rules: 358.5 (a cancel undoes "the actions taken in this process" — the PLAY's own steps: its chosen
 * targets and the costs it paid), 429.3 / 429.3.a (a Reaction [Add] may be activated whenever costs must be
 * paid; it finalizes and resolves immediately, on its own — it is NOT one of the play's steps), 357.1.a (the
 * Pay step credits Adds made while the payment window is open), 809.1.c / 809.1.c.1 (the [Deflect] surcharge
 * is owed as the object is CHOSEN), 164.2.b (recycling a rune makes Power; tapping makes Energy),
 * 404.1 (costs are paid as the play finalizes), 355.5 (a spell's targets are chosen as it is played).
 *
 * Answer — the engine model. For a PLAY there is no in-flight picker to cancel out of at all: a play is one
 * atomic move and its targets are priced POOL-ONLY (DESIGN.md §Paying costs — a deliberate deviation from
 * 357.1.a/429.3 for plays), so the Poro is simply ABSENT from Frigid Touch's target list until the pip
 * actually exists. Backing out therefore refunds nothing, because nothing was charged — and the Add that
 * created the pip is a separate finalized ability (429.3.a) that no cancel touches: the rune stays recycled,
 * the Power stays in the pool for the next play, and a cracked Gold is dead for good. Only Rewind — one
 * ACTION per click — takes an Add back. Where an open PROMPT does owe a surcharge (the Pinger below), rune
 * Adds are correctly offered; the Gold's identical Reaction [Add] is NOT — the one real gap here.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FRIGID_TOUCH = "sfd-066-221";
const POUTY_PORO = "ogn-013-298";
const GOLD = "sfd-t03";

const asPick = (d: Decision | null): PickDecision => d as PickDecision;

/**
 * Inline 0-cost unit · "When you play me, deal 2 to an enemy unit." — scaffolding: the only way to get a
 * [Deflect] surcharge owed from inside an OPEN PROMPT (a spell's targets are named on the play instead).
 */
const FILLER_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Pinger",
};

/**
 * P1's turn. Pool holds exactly Frigid Touch's [2] Energy and NO Power; one ready Chaos rune and one Gold
 * token are the two ways to make the [rainbow] the Poro's [Deflect] demands. P2's bf1 holds the Poro.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .rune(P1, "chaos", { alias: "rune" })
    .gear(P1, GOLD, "gold")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .hand(P1, FRIGID_TOUCH, "frigid");
}

/** The target sets Frigid Touch currently offers (null when the spell is not castable at all). */
function frigidTargets(game: Game): string[] | null {
  const field = game.p1.option("cast", "frigid")?.fields.find((f) => f.name === "targets");
  if (field === undefined) {
    return null;
  }
  return ((field.options ?? []) as (string | string[])[]).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]);
}

/** A real surcharged PROMPT: the Pinger's play-trigger choosing between the taxed Poro and an untaxed unit. */
async function surchargedPrompt(extra: { rune?: boolean; gold?: boolean } = { gold: true, rune: true }): Promise<Game> {
  let b = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 4, name: "Plain" }, "plain")
    .hand(P1, FILLER_PINGER, "pinger");
  if (extra.rune !== false) {
    b = b.rune(P1, "chaos", { alias: "rune" });
  }
  if (extra.gold !== false) {
    b = b.gear(P1, GOLD, "gold");
  }
  const game = await b.build();
  await game.p1.play("pinger");
  return game;
}

describe("build check — pick-time payability (43bb893) is in this build", () => {
  test("a surcharged pick lists the taxed candidate with its `surcharge` and a `needsAdd`, and carries the rune Adds on the decision itself; a pre-43bb893 build filtered it out at raise time and offered no prompt to pay from", async () => {
    const game = await surchargedPrompt();
    const d = asPick(game.decision());
    expect(d.kind).toBe("pick");
    const taxed = d.options.find((o) => o.card === "poro");
    expect(taxed).toBeDefined();
    expect(taxed?.surcharge).toBe(1);
    expect(taxed?.needsAdd?.reason).toContain("recycle");
    expect(d.options.find((o) => o.card === "plain")?.needsAdd).toBeUndefined();
    expect(d.actions?.some((a) => a.moveId === "recycleRune")).toBe(true);
  });
});

describe("(a) a PLAY has no surcharged picker to cancel out of — its targets are priced pool-only", () => {
  // DESIGN: DESIGN.md §Paying costs — for plays the engine offers only what the CURRENT pool covers
  // (a deliberate deviation from 357.1.a / 429.3); the pay-inside-the-prompt window exists for prompts,
  // not for plays. So there is no half-built Frigid Touch to press Esc on.
  test("with an empty Power pool the Poro is not on Frigid Touch's target list at all — the spell is simply not castable (809.1.d)", async () => {
    const game = await board().build();
    expect(frigidTargets(game)).toBe(null);
    expect(game.p1.can("cast", "frigid")).toBe(false);
    await expect(game.p1.cast("frigid", { targets: "poro" })).rejects.toThrow();
  });

  test("recycling the Chaos rune makes the [rainbow] the surcharge wants (164.2.b) and the Poro appears — the pip exists BEFORE the play, never during it", async () => {
    const game = await board().build();
    await game.p1.recycleRune("rune");
    expect(game.p1.power("chaos")).toBe(1);
    expect(frigidTargets(game)).toEqual(["poro"]);
  });

  test("backing out after the recycle refunds NOTHING, because nothing was charged: the pip stays in the pool and the rune stays recycled (429.3.a — the Add already finalized and resolved on its own)", async () => {
    const game = await board().build();
    await game.p1.recycleRune("rune");
    // …and the play is abandoned rather than sent.
    expect(game.p1.power("chaos")).toBe(1);
    expect(game.p1.runes({ ready: true })).not.toContain("rune");
    expect(game.zoneOf("rune")).toBe("runeDeck");
    expect(game.p1.hand()).toEqual(["frigid"]);
    expect(game.state("poro").might).toBe(2); // untouched
    expect(game.violations()).toEqual([]);
  });

  test("that Power is really available to the NEXT play: casting Frigid Touch afterwards spends [2] Energy and the one surcharge pip, and the Poro goes 2 → 0 Might this turn", async () => {
    const game = await board().build();
    await game.p1.recycleRune("rune");
    await game.p1.cast("frigid", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // 404.1 — charged as it finalized
    await game.settle();
    expect(game.state("poro").might).toBe(0);
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Rewind takes back exactly the Add — one ACTION per click", () => {
  test("after the recycle, one Rewind puts the rune back ready and empties the pool again", async () => {
    const game = await board().build();
    await game.p1.recycleRune("rune");
    expect(game.canUndo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.p1.runes({ ready: true })).toContain("rune");
  });

  test("…and it leaves the abandoned play abandoned: no prompt re-opens, the spell is still in hand, and the Poro drops back off the target list", async () => {
    const game = await board().build();
    await game.p1.recycleRune("rune");
    game.undo();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual(["frigid"]);
    expect(frigidTargets(game)).toBe(null);
    expect(game.violations()).toEqual([]);
  });

  test("the two levers are not the same lever: backing out keeps the pip, Rewinding removes it — from the identical position", async () => {
    const backedOut = await board().build();
    await backedOut.p1.recycleRune("rune");

    const rewound = await board().build();
    await rewound.p1.recycleRune("rune");
    rewound.undo();

    expect([backedOut.p1.power("chaos"), rewound.p1.power("chaos")]).toEqual([1, 0]);
    expect([backedOut.p1.runes({ ready: true }).length, rewound.p1.runes({ ready: true }).length]).toEqual([0, 1]);
  });
});

describe("(c) the Gold — the same pip, but a one-way door", () => {
  test("cracking the Gold pays its own cost (kill this + exhaust) and adds [rainbow]: the Poro becomes a legal Frigid Touch target", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.has("gold")).toBe(false); // a token that left the board ceases to exist (186.1)
    expect(frigidTargets(game)).toEqual(["poro"]);
  });

  test("backing out after cracking it does not un-crack it: the Gold is gone for good and the [rainbow] simply sits in the pool (429.3.a)", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    expect(game.has("gold")).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.hand()).toEqual(["frigid"]);
    expect(game.violations()).toEqual([]);
  });

  test("only Rewind brings it back — and it takes the [rainbow] with it, closing the Poro off again", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    expect(game.undo()).toBe(true);
    expect(game.zoneOf("gold")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(0);
    expect(frigidTargets(game)).toBe(null);
  });

  // rule 429.3: a Reaction [Add] ability may be activated ANY time a cost must be paid, and the Gold's
  // "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]" is exactly one.
  test("with a surcharged pick open the Gold's Reaction [Add] is not activatable — only rune Adds are counted (429.3 / 429.3.a)", async () => {
    const game = await surchargedPrompt();
    expect(asPick(game.decision()).kind).toBe("pick");
    expect(game.p1.can("activate", "gold")).toBe(true);
    const r = await game.p1.try((p) => p.activate("gold"));
    expect(r.ok).toBe(true);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.pick("poro");
    expect(game.p1.power("rainbow")).toBe(0); // 809.1.c.1 — charged as it was chosen
  });

  // The sharper form: with the Gold as the ONLY possible Add, 809.1.d ("a surcharge the chooser can never
  // cover is not a legal choice") must count it, so the taxed Poro stays on the option list.
  test("when the Gold is the only way to fund the surcharge, the taxed target stays listed (809.1.d counts every Reaction [Add], gear included)", async () => {
    const game = await surchargedPrompt({ gold: true, rune: false });
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(asPick(d).options.map((o) => o.card).sort()).toEqual(["plain", "poro"]);
  });

  test("what the prompt offers: BOTH Add kinds — the rune moves and the Gold's Reaction [Add] (429.3)", async () => {
    const game = await surchargedPrompt();
    const d = asPick(game.decision());
    expect((d.actions ?? []).map((a) => a.moveId).sort()).toEqual([
      "activateAbility",
      "concede",
      "exhaustRune",
      "recycleRune",
    ]);
    expect(game.p1.can("activate", "gold")).toBe(true);
    // …and the rune route still works from inside the prompt (429.3, as designed).
    await game.p1.recycleRune("rune");
    await game.p1.pick("poro");
    expect(game.p1.power("chaos")).toBe(0);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash"); // 2 damage on a 2-Might Poro is lethal
    expect(game.state("plain").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) telling the two levers apart is client work — the engine exposes only one of them as a move", () => {
  test("no seat ever has a 'cancel' action: the legal menu is plays/activations/rune Adds/pass, so 358.5's rollback has no engine move behind it", async () => {
    const game = await board().build();
    const verbs = [...new Set(game.p1.legal().map((o) => String(o.verb)))].sort();
    expect(verbs).toEqual(["activate", "concede", "endTurn", "recycleRune", "tapRune"]);
    expect(game.p1.legal().some((o) => /cancel/i.test(o.key))).toBe(false);
  });

  test("Rewind is the only lever, and it is bounded: with nothing done yet there is nothing to rewind", async () => {
    const game = await board().build();
    expect(game.canUndo()).toBe(false);
    expect(game.undo()).toBe(false);
    await game.p1.recycleRune("rune");
    expect(game.canUndo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.canUndo()).toBe(false); // one ACTION per click
  });
});
