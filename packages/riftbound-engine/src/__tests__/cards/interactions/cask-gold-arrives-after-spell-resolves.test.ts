/**
 * Interaction: Chemtech Cask's Gold arrives too late to pay for the spell that triggered it.
 *   Chemtech Cask (sfd-063-221) · Gear · Mind · 1 —
 *     "When you play a spell on an opponent's turn, you may exhaust me to play a Gold gear token exhausted."
 *   Gold (unl-t05) · Gear token — "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]."
 *   Defy (ogn-045-298) · Spell · Calm · 1 + [calm] · [Reaction] — "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   Wind Wall (ogn-064-298) · Spell · Calm · 3 + [calm] · [Reaction] — "Counter a spell." (P2's answer)
 *   Discipline (ogn-058-298) · Spell · 1 + [calm] — "Give a unit +2 [Might] this turn. Draw 1." (the spell being answered)
 *
 * Question: on P2's turn P1 answers P2's spell with Defy while one [calm]/rainbow short, holding a
 * ready Cask and a ready Gold token.
 *   (a) May P1 crack the ready Gold while paying for Defy, and does P2 get a window on that Add?
 *   (b) Does the CASK's Gold arrive in time to pay for Defy?
 *   (c) If P2 counters Defy with Wind Wall, does the Cask trigger — and does Defy still count as a
 *       card P1 played this turn?
 *   (d) Same spell on P1's OWN turn — does the Cask trigger?
 *   (e) Where is the "you may exhaust me" decision made, and does P2 get a window on the token?
 *
 * Rules: 419.4.a / 419.4.a.1 (a "when you play" trigger fires only when the play is COMPLETED by the
 * card resolving — a countered card completes nothing), 419.4.b (a Finalized card counts as played
 * even when countered), 357.1.a / 429.3 / 429.3.a (the Pay Costs step: only the card's controller may
 * activate Reaction [Add] abilities there), 337.1.a (nobody receives priority between beginning to
 * play a card and Finalizing it), 337.2 (a Gear resolves immediately when it is played — it is never a
 * chain item), 383.3.a / 383.3.b / 383.3.b.1 (a trigger's "you may [cost] to …" is its base cost,
 * decided and paid at FINALIZATION), 383.3.a.2 (declining removes the item as though it never
 * triggered), 383.2.a.1 ("on an opponent's turn" is part of the Trigger Condition), 425.1.a / 425.1.c
 * (a countered card does nothing, goes to its owner's trash, and nothing is refunded), 414.1.b (an
 * exhausted permanent cannot pay an [Exhaust] cost), 406.4 (priority before a chain item resolves).
 *
 * DESIGN (adjudicated): this engine implements paying MANUALLY — the "Add during payment" sub-step of
 * 357.1.a / 429.3 is deliberately not modelled (`.claude/skills/riftbound-rules/DESIGN.md` §Paying
 * costs). A play is OFFERED only when the current pool already covers it, so P1 cracks the Gold FIRST
 * and Defy then appears. The rules answer to (a) — that the Add is the controller's alone, resolves
 * at once, is never a chain item and hands P2 no window — is what this file asserts; only the ORDER
 * (crack-then-offer instead of offer-then-pay) is the documented deviation.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CASK = "sfd-063-221";
const GOLD = "unl-t05";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P2's turn 2. P1 holds Defy and a ready Chemtech Cask; P1's pool is 5 Energy and NO Power, so Defy's
 * [calm] pip is exactly the shortfall. `gold: true` also gives P1 an already-played ready Gold token;
 * `wind: true` arms P2 with Wind Wall.
 */
function board(opts: { gold?: boolean; wind?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 9, power: { calm: 5, fury: 5 } })
    .gear(P1, CASK, "cask")
    .hand(P1, DEFY, "defy")
    .hand(P2, DISCIPLINE, "discipline")
    .unit(P2, "base", { might: 2, name: "P2 Grunt" }, "grunt");
  if (opts.gold === true) {
    b.gear(P1, GOLD, "goldTok");
  }
  if (opts.wind === true) {
    b.hand(P2, WIND_WALL, "windWall");
  }
  return b;
}

/** P2 casts Discipline on its own grunt and passes, leaving P1 holding priority over a live chain. */
async function p2CastsAndPasses(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  await game.p2.cast("discipline", { targets: "grunt" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "discipline", controller: P2 })]);
}

describe("Chemtech Cask: the Gold it plays arrives after the spell that triggered it has already resolved", () => {
  // ---- (a) cracking the ready Gold to fund Defy -------------------------------------------------

  test("(a) the ready Gold's [Add] is the controller's own Reaction ability: it resolves at once, never becomes a chain item, and P2 gets no window — P1 keeps priority throughout (357.1.a, 429.3.a, 337.1.a)", async () => {
    const game = await board({ gold: true }).build();
    await p2CastsAndPasses(game);

    // DESIGN (DESIGN.md §Paying costs, deviation from 357.1.a/429.3): payment is manual, so Defy is
    // not on the menu while the [calm] pip is unpaid — the Gold is cracked first.
    expect(game.p1.can("cast", "defy")).toBe(false);
    expect(game.p1.legal().map((o) => o.key)).toContain("activateAbility:goldTok#0");

    await game.p1.activate("goldTok", 0, { sacrifice: "goldTok" });
    expect(game.chain()).toHaveLength(1); // the Add is not a chain item (429.3.a)
    expect(game.chain()[0]?.cardId).toBe("discipline");
    expect(game.actingSeat()).toBe(P1); // P2 never got priority for the Add
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.zoneOf("goldTok")).toBe("gone"); // a token that left the board ceases to exist (186.1)

    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "discipline" });
    expect(game.actingSeat()).toBe(P1); // 337.1.a — nothing between beginning the play and Finalizing it
    expect(game.chain().map((i) => i.cardId)).toEqual(["discipline", "defy"]);
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) the Cask's own Gold is too late, and enters exhausted --------------------------------

  test("(b) without the pre-played Gold the [calm] pip cannot be paid at all: Defy is never castable, so the Cask's Gold demonstrably cannot have funded it (419.4.a)", async () => {
    const game = await board().build();
    await p2CastsAndPasses(game);
    expect(game.p1.power("calm")).toBe(0);
    expect(game.p1.gear()).toEqual(["cask"]); // no Gold exists yet — the Cask has not triggered
    expect(game.p1.can("cast", "defy")).toBe(false);
    await expect(game.p1.cast("defy", { targets: "discipline" })).rejects.toThrow();
  });

  test("(b) the Cask trigger only appears AFTER Defy has resolved and left for the trash — its Gold could never have paid for Defy, and the token enters EXHAUSTED so it cannot [Exhaust] this turn either (419.4.a, 414.1.b)", async () => {
    const game = await board({ gold: true }).build();
    await p2CastsAndPasses(game);
    await game.p1.activate("goldTok", 0, { sacrifice: "goldTok" });
    await game.p1.cast("defy", { targets: "discipline" });
    expect(game.chain().map((i) => i.name)).toEqual(["Discipline", "Defy"]);
    expect(game.chain().some((i) => i.cardId === "cask")).toBe(false); // not yet — Defy has not resolved

    await game.settle();
    // Defy has resolved (Discipline countered) and only NOW is the Cask on the chain.
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("grunt").might).toBe(2); // Discipline countered: no +2
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cask", controller: P1, triggered: true })]);

    await game.p1.yes(); // pay the trigger's [Exhaust] base cost
    await game.settle();
    const token = game.p1.gear().find((g) => g !== "cask");
    expect(token).toBeDefined();
    expect(game.state(token as string).name).toBe("Gold");
    expect(game.state(token as string).isToken).toBe(true);
    expect(game.state(token as string).isExhausted).toBe(true); // "play a Gold gear token exhausted"
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) countered: no trigger, but still "played" --------------------------------------------

  test("(c) P2 counters Defy with Wind Wall: the Cask never triggers, both spells go to their OWNERS' trash and nothing is refunded (419.4.a.1, 425.1.a, 425.1.c)", async () => {
    const game = await board({ wind: true }).build();
    await p2CastsAndPasses(game);
    await game.p1.do("addResources", { energy: 0, power: { calm: 1 } }); // fund the pip without a Gold
    await game.p1.cast("defy", { targets: "discipline" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("windWall", { targets: "defy" });
    await game.settle();

    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("windWall")).toBe("trash");
    expect(game.p1.trash()).toContain("defy"); // owner's trash
    expect(game.p2.trash()).toContain("windWall");
    // Defy was countered ⇒ it did nothing, so Discipline resolved: +2 Might.
    expect(game.state("grunt").might).toBe(4);
    // Nothing refunded: P1 paid 1 Energy + the [calm] pip out of 5 / 1.
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.power("calm")).toBe(0);
    // No Cask trigger ever reached the chain, the Cask is untouched and no Gold exists.
    expect(game.state("cask").isExhausted).toBe(false);
    expect(game.p1.gear()).toEqual(["cask"]);
    expect(game.decision()?.seat).toBe(P2); // back to P2's open main phase, nothing pending for P1
  });

  test("(c) the countered Defy WAS Finalized, so it still counts among the cards P1 played this turn (419.4.b)", async () => {
    const game = await board({ wind: true }).build();
    const before = (game.gameState as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn?.[P1] ?? 0;
    await p2CastsAndPasses(game);
    await game.p1.do("addResources", { energy: 0, power: { calm: 1 } });
    await game.p1.cast("defy", { targets: "discipline" });
    await game.p1.passPriority();
    await game.p2.cast("windWall", { targets: "defy" });
    await game.settle();
    expect((game.gameState as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn?.[P1]).toBe(before + 1);
  });

  // ---- (d) "on an opponent's turn" is part of the Trigger Condition ------------------------------

  test("(d) the very same spell played on P1's OWN turn does not trigger the Cask at all — the restriction is part of the Trigger Condition, so nothing goes on the chain (383.2.a.1)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .resources(P1, { energy: 5, power: { calm: 3 } })
      .gear(P1, CASK, "cask")
      .hand(P1, DISCIPLINE, "mySpell")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .build();
    await game.p1.cast("mySpell", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("mySpell")).toBe("trash");
    expect(game.state("ally").might).toBe(4); // it really did resolve
    expect(game.chain()).toEqual([]);
    expect(game.state("cask").isExhausted).toBe(false);
    expect(game.p1.gear()).toEqual(["cask"]);
    expect(game.decision()?.kind).toBe("action"); // no "you may exhaust me" was ever asked
  });

  // ---- (e) the "you may exhaust me" cost is paid at FINALIZATION ---------------------------------

  test("(e) 'you may exhaust me' is the trigger's base cost, asked and PAID at finalization: saying yes exhausts the Cask while the item is still an unresolved chain item (383.3.a, 383.3.b.1)", async () => {
    const game = await board({ gold: true }).build();
    await p2CastsAndPasses(game);
    await game.p1.activate("goldTok", 0, { sacrifice: "goldTok" });
    await game.p1.cast("defy", { targets: "discipline" });
    await game.settle();

    const decision = game.decision();
    expect(decision?.kind).toBe("yes-no");
    expect(decision?.seat).toBe(P1);
    expect(decision?.timing).toBe("FIN"); // finalization, not resolution
    expect(game.state("cask").isExhausted).toBe(false); // not paid until the answer

    await game.p1.yes();
    expect(game.state("cask").isExhausted).toBe(true); // cost paid at finalization…
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cask", triggered: true })]); // …item still unresolved
    expect(game.p1.gear()).toEqual(["cask"]); // no token yet
  });

  test("(e) P2 gets a priority window on the CASK TRIGGER before it resolves, but never on the Gold token: the Gear resolves immediately when played and is never a chain item (406.4, 337.2)", async () => {
    const game = await board({ gold: true }).build();
    await p2CastsAndPasses(game);
    await game.p1.activate("goldTok", 0, { sacrifice: "goldTok" });
    await game.p1.cast("defy", { targets: "discipline" });
    await game.settle();
    await game.p1.yes();

    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // 406.4 — P2 may answer the trigger
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cask" })]);

    await game.p2.passPriority();
    // The trigger resolved; the Gold it played never appeared on the chain and nobody was offered a
    // window on it — P2 is simply back in its own main phase.
    expect(game.chain()).toEqual([]);
    expect(game.p1.gear()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "main", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(e) declining removes the item as though it never triggered: no Gold, Cask stays ready, chain empty (383.3.a.2)", async () => {
    const game = await board({ gold: true }).build();
    await p2CastsAndPasses(game);
    await game.p1.activate("goldTok", 0, { sacrifice: "goldTok" });
    await game.p1.cast("defy", { targets: "discipline" });
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");

    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("cask").isExhausted).toBe(false);
    expect(game.p1.gear()).toEqual(["cask"]);
    expect(game.violations()).toEqual([]);
  });
});
