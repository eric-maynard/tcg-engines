/**
 * Interaction: Zilean, Time Mage (unl-086-219) · Champion Unit · Mind · 5 · 5 Might
 *     "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that token
 *      and an additional copy of it instead."
 *   × Production Surge (sfd-076-221) · Spell · Mind · 4 + [mind]
 *     "This costs [2] less if you control a Mech. Play a 3 [Might] Mech unit token to your base. Draw 1."
 *   × Shady Spectacles (ven-137-166) · Gear · Equipment · Order · +0 · "[Equip] [1][order] … As this is
 *     attached to a unit, choose another friendly unit. The equipped unit becomes a copy of that unit for
 *     as long as this is attached to it."
 *   (bearer: Daring Poro ogn-210-298 · Order · 2 · 2 Might · Poro · [Assault]; Mech-tag detector: P1's
 *    legend Mechanized Menace sfd-181-221 "Your Mechs have [Shield]" — a legend is not a Mech you control;
 *    Poro-tag detector for one facet: the Brush battlefield unl-t03 "+1 Might to … Poro units here".)
 *
 * Rules: 370.1.b / 371.1 (Zilean REPLACES the one play-a-token event, once each turn), 439.2 / 439.2.c
 * (created objects go where the effect says — "to your base"), 143.4 / 359.2.c (units enter EXHAUSTED
 * unless told otherwise), 375 (the additional copy inherits exactly the generating effect's stipulations),
 * 187.4 (a 3-Might Mech token: domainless unit token, 3 Might, Mech tag), 185.2.d (a unit token is a unit),
 * 185.3.a.1 (token cost treated as 0), 185.3.b (no domain), 185.1.b (a CARD can never become a token),
 * 182 / 183 (a token is owned/controlled by the player who created it), 477.1.b.1 / 477.1.b.1.a ("becomes
 * a copy" swaps the copyable traits in place: name, type, tags, cost, domain, rules text, Might — never
 * damage, ready state, location, attachments, controller).
 *
 * Board (P1's turn): Zilean at bf1 (P1's); also at bf1 P1's READY Daring Poro with 1 damage. P1 controls no
 * Mech, holds two Production Surges, an unattached Shady Spectacles and a 0-cost 2-damage test bolt; pool =
 * 4 (Surge #1) + 1 (Equip) + 2 (a discounted Surge #2) energy, mind×2, order×1.
 *
 * Question / expected:
 *   (a) Surge #1 at full 4+[mind], Zilean accepted → TWO Mech tokens CREATED in P1's BASE, both EXHAUSTED
 *       (Surge does not say "ready"; the copy inherits nothing more), Draw 1 exactly ONCE. Each token: name
 *       Mech, unit, Mech tag, domainless, cost 0, 3 Might, no printed keywords, no Temporary, token,
 *       owner+controller P1; independent objects (2 damage to #1 leaves #2 at 0).
 *   (b) Equip Spectacles onto the Poro: a TOKEN is a legal "another friendly unit" model. The Poro becomes a
 *       copy IN PLACE: name Mech, Mech tag (Poro gone), domainless, cost 0, base Might 3, no [Assault];
 *       unchanged: READY, 1 damage, at bf1, Spectacles attached (+0 → 3), controller P1, still a CARD.
 *   (c) A second Surge now costs 2 less (P1 controls a Mech); Zilean already applied this turn → exactly one
 *       more (exhausted) Mech, no offer.
 */
import { describe, expect, test } from "bun:test";
import type { CardState, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZILEAN = "unl-086-219";
const PRODUCTION_SURGE = "sfd-076-221";
const SHADY_SPECTACLES = "ven-137-166";
const DARING_PORO = "ogn-210-298";
const MECHANIZED_MENACE = "sfd-181-221";
const BRUSH = "unl-t03";

/** 0-cost action spell: deal 2 to a unit — to show the two tokens are independent objects. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

/** P1's turn. Zilean + damaged ready Poro at bf1 (inert, or the live Brush); Menace legend; two Surges, Spectacles, bolt. */
function board(bf1: "inert" | "brush" = "inert", energy = 4 + 1 + 2) {
  return scenario()
    .resources(P1, { energy, power: { mind: 2, order: 1 } })
    .legend(P1, MECHANIZED_MENACE, "menace")
    .battlefield("bf1", bf1 === "brush" ? { controller: P1, def: BRUSH, inert: false } : { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", ZILEAN, "zilean")
    .unit(P1, "bf1", DARING_PORO, "poro", { damage: 1 })
    .unit(P2, "bf2", { might: 4, name: "Wall" }, "wall")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P1, PRODUCTION_SURGE, "surge1")
    .hand(P1, PRODUCTION_SURGE, "surge2")
    .hand(P1, BOLT, "bolt");
}

/** Printed keywords = all keyword names minus the granted ones (Menace's Shield is a grant). */
function printedKeywords(s: CardState): string[] {
  const granted = new Set(s.grantedKeywords.map((g) => g.keyword));
  return s.keywords.filter((k) => !granted.has(k));
}

/** Cast `surge`, settle to Zilean's offer (if any), answer it; return the tokens that appeared in P1's base. */
async function castSurge(game: Game, surge: "surge1" | "surge2", zilean: "yes" | "no" | "not-offered"): Promise<string[]> {
  const before = game.p1.base();
  await game.p1.cast(surge);
  await game.settle();
  const d = game.decision();
  if (zilean === "not-offered") {
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
  } else {
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    await (zilean === "yes" ? game.p1.yes() : game.p1.no());
    const r = await game.settle();
    expect(r.reason).toBe("open");
  }
  expect(game.zoneOf(surge)).toBe("trash");
  return game.p1.base().filter((id) => !before.includes(id));
}

/** Surge #1 with Zilean accepted → the two Mech tokens (sorted ids). */
async function twoMechs(bf1: "inert" | "brush" = "inert"): Promise<{ game: Game; mechs: [string, string] }> {
  const game = await board(bf1).build();
  const toks = (await castSurge(game, "surge1", "yes")).sort();
  expect(toks).toHaveLength(2);
  return { game, mechs: [toks[0] as string, toks[1] as string] };
}

/** Activate Spectacles' [Equip] onto the Poro; return the model options offered, then pick `model` and settle. */
async function equipPoroCopying(game: Game, model: string): Promise<string[]> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
  const offered = (d as PickDecision).options.map((o) => o.card ?? o.key).sort();
  await game.p1.pick(model);
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.state("specs").attachedTo).toBe("poro");
  return offered;
}

describe("Zilean × Production Surge (created duplicate) vs Shady Spectacles (becoming a copy)", () => {
  // ── premise ──────────────────────────────────────────────────────────────────────────────────

  test("premise: P1 controls no Mech → Surge #1 is castable only at full price (4 + [mind]); the Poro is a READY 2-Might [Assault] Poro card with 1 damage at bf1 and no Shield", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "surge1")).toBe(true);
    await game.p1.cast("surge1");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1, order: 1 } }); // 4 + mind paid
    const poro = game.state("poro");
    expect(poro).toMatchObject({ baseMight: 2, controller: P1, damage: 1, domains: ["order"], energyCost: 2, isReady: true, isToken: false, location: "bf1", might: 2, name: "Daring Poro" });
    expect(printedKeywords(poro)).toEqual(["Assault"]);
    expect(poro.keywords).not.toContain("Shield"); // not a Mech
    // …and with only 2 energy + mind (no Mech) it would NOT be castable:
    const poor = await board("inert", 2).build();
    expect(poor.p1.resources()).toEqual({ energy: 2, power: { mind: 2, order: 1 } });
    expect(poor.p1.can("cast", "surge1")).toBe(false);
  });

  // ── (a) Zilean doubles the CREATED token ────────────────────────────────────────────────────

  test("(a) Surge #1 resolves with Zilean at a battlefield: the 'additional copy' is OFFERED (you may); accepting yields exactly TWO tokens, both in P1's BASE (439.2.c) — none at bf1 where Zilean stands", async () => {
    const game = await board().build();
    const before = game.p1.base();
    await game.p1.cast("surge1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", prompt: expect.stringMatching(/additional copy/i), seat: P1 });
    await game.p1.yes();
    await game.settle();
    const toks = game.p1.base().filter((id) => !before.includes(id));
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.locationOf(t)).toBe("base");
    }
    expect(game.p1.units("bf1").sort()).toEqual(["poro", "zilean"]);
    expect(game.p2.base()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("(a) both tokens enter EXHAUSTED — Surge does not say 'ready' (143.4 / 359.2.c) and the extra copy inherits nothing more (375)", async () => {
    const { game, mechs } = await twoMechs();
    expect(game.state(mechs[0]).isExhausted).toBe(true);
    expect(game.state(mechs[1]).isExhausted).toBe(true);
  });

  test("(a) 'Draw 1' happens exactly ONCE — only the token event was replaced, not the spell: hand −Surge +1, deck −1", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    const top = game.p1.deck()[0];
    await castSurge(game, "surge1", "yes");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.p1.hand()).toContain(top as string);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });

  test("(a) each token's sheet: name Mech, unit, Mech tag (Menace grants it Shield), domainless (185.3.b), cost 0 (185.3.a.1), 3 Might, no printed keywords, no Temporary (187.4), token, owned AND controlled by P1 (182/183)", async () => {
    const { game, mechs } = await twoMechs();
    for (const t of mechs) {
      const s = game.state(t);
      expect(s).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, damage: 0, domains: [], energyCost: 0, isToken: true, might: 3, name: "Mech", owner: P1, powerCost: [] });
      expect(printedKeywords(s)).toEqual([]);
      expect(s.keywords).not.toContain("Temporary");
      expect(s.keywords).toContain("Shield"); // "Your Mechs have [Shield]" sees it → it carries the Mech tag
    }
  });

  test("(a) they are two independent objects: 2 damage to Mech #1 leaves Mech #2 undamaged (and neither is the other's attachment/copy)", async () => {
    const { game, mechs } = await twoMechs();
    expect(mechs[0]).not.toBe(mechs[1]);
    await game.p1.cast("bolt", { targets: mechs[0] });
    await game.settle();
    expect(game.state(mechs[0]).damage).toBe(2);
    expect(game.state(mechs[1]).damage).toBe(0);
    expect(game.state(mechs[0]).attachments).toEqual([]);
    expect(game.state(mechs[1]).attachments).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) control: Zilean declined → exactly ONE exhausted Mech token, still one draw", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const toks = await castSurge(game, "surge1", "no");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0] as string)).toMatchObject({ isExhausted: true, isToken: true, might: 3, name: "Mech" });
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  // ── (b) Spectacles: the Poro BECOMES a copy of Mech #1 in place ─────────────────────────────

  test("(b) Equip Spectacles → Poro ([1][order] paid): the model prompt offers 'another friendly unit' = both Mech TOKENS and Zilean (185.2.d: a unit token is a unit) — never the Poro itself, never P2's Wall", async () => {
    const { game, mechs } = await twoMechs();
    const offered = await equipPoroCopying(game, mechs[0]);
    expect(offered).toEqual([...mechs, "zilean"].sort());
    expect(offered).not.toContain("poro");
    expect(offered).not.toContain("wall");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1, order: 0 } });
  });

  test("(b) copyable traits CHANGED (477.1.b.1.a): name 'Mech', domainless, cost 0, base Might 3, printed [Assault] gone — and it now IS a Mech (Menace's Shield reaches it)", async () => {
    const { game, mechs } = await twoMechs();
    await equipPoroCopying(game, mechs[0]);
    const s = game.state("poro");
    expect(s).toMatchObject({ baseMight: 3, domains: [], energyCost: 0, name: "Mech", powerCost: [] });
    expect(printedKeywords(s)).toEqual([]);
    expect(s.keywords).not.toContain("Assault");
    expect(s.keywords).toContain("Shield");
    expect(game.state(mechs[0]).name).toBe("Mech"); // the model is untouched
    expect(game.state(mechs[0]).attachments).toEqual([]);
  });

  test("(b) …and the Poro TAG is gone: at the live Brush ('+1 Might to Poro units here') the un-copied Poro reads 2+1 = 3, the Mech-copy reads its plain 3 (base 3, Brush bonus 0)", async () => {
    const plain = await board("brush").build();
    expect(plain.state("poro")).toMatchObject({ baseMight: 2, might: 3, staticMightBonus: 1 });
    const { game, mechs } = await twoMechs("brush");
    await equipPoroCopying(game, mechs[0]);
    expect(game.state("poro")).toMatchObject({ baseMight: 3, might: 3, name: "Mech", staticMightBonus: 0 });
  });

  test("(b) NOT changed — statuses are not copyable: still READY (did not 're-enter' exhausted like the model), still exactly 1 damage (now 1 of 3), still at bf1 (not in base where the model is), Spectacles attached (+0 → 3 Might), controller/owner P1", async () => {
    const { game, mechs } = await twoMechs();
    expect(game.state(mechs[0])).toMatchObject({ isExhausted: true, location: "base" }); // the model's statuses …
    await equipPoroCopying(game, mechs[0]);
    const s = game.state("poro");
    expect(s.isReady).toBe(true); // … are not inherited
    expect(s.damage).toBe(1);
    expect(s.location).toBe("bf1");
    expect(s.zone).toBe("battlefield-bf1");
    expect(s.attachments).toEqual(["specs"]);
    expect(game.state("specs").attachedTo).toBe("poro");
    expect(s.might).toBe(3); // 3 + 0 (Spectacles) — 1 damage is not lethal
    expect(s.controller).toBe(P1);
    expect(s.owner).toBe(P1);
    expect(game.p1.units("bf1").sort()).toEqual(["poro", "zilean"]);
    expect(game.violations()).toEqual([]);
  });

  // Expected: token-ness is not a copyable trait (477.1.b.1.a lists name/type/tags/cost/domain/text) and
  // 185.1.b is absolute: "Card Game Objects cannot become tokens by any means" — the Spectacled Poro is
  // still a CARD. Actual: the engine's copy also copies the model's token flag, so state(poro).isToken
  // reads true (it would 'cease to exist' if bounced and be seen by 'token unit' text).
  test.failing("BUG: (b) the Poro copying a Mech TOKEN must remain a CARD, not become a token (185.1.b; token-ness is not a copyable trait, 477.1.b.1.a)", async () => {
    const { game, mechs } = await twoMechs();
    await equipPoroCopying(game, mechs[0]);
    expect(game.state("poro").name).toBe("Mech"); // the copy did happen …
    expect(game.state("poro").isToken).toBe(false); // … but it is still the Daring Poro card
  });

  // ── (c) second Surge: discounted, not doubled ───────────────────────────────────────────────

  test("(c) after (a)+(b) P1 controls a Mech → Surge #2 costs [2] less: castable with exactly 2 energy + [mind] left, pool → 0/0", async () => {
    const { game, mechs } = await twoMechs();
    await equipPoroCopying(game, mechs[0]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1, order: 0 } });
    expect(game.p1.can("cast", "surge2")).toBe(true);
    await game.p1.cast("surge2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "surge2", controller: P1 })]);
  });

  test("(c) …and Zilean's replacement was already applied to an event this turn (371.1): NO offer, exactly ONE more Mech token, exhausted, in base; one more card drawn", async () => {
    const { game, mechs } = await twoMechs();
    await equipPoroCopying(game, mechs[0]);
    const hand0 = game.p1.hand().length;
    const third = await castSurge(game, "surge2", "not-offered");
    expect(third).toHaveLength(1);
    expect(game.state(third[0] as string)).toMatchObject({ isExhausted: true, isToken: true, location: "base", might: 3, name: "Mech" });
    expect(game.p1.base().filter((id) => game.state(id).name === "Mech")).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) the discount needs only a real Mech token — it applies straight after (a) without any Spectacles business (4 → only 2 of the remaining 3 energy spent)", async () => {
    const { game } = await twoMechs();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1, order: 1 } });
    await game.p1.cast("surge2");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0, order: 1 } });
  });
});
