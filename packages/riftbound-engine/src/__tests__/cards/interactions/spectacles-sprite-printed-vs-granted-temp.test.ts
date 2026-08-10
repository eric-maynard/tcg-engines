/**
 * Interaction: Shady Spectacles (ven-137-166) · Gear · Order · 4 · [Equip] [1][order]
 *     "As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of that
 *      unit for as long as this is attached to it."
 *   × Sprite Call (ogn-094-298) · Spell · Mind · 3 · "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *     (token definition 187.2: domainless, 3 Might, Fae tag, Temporary keyword — its 'printed' sheet)     → S
 *   × Mirror Image (unl-200-219) · Spell · Mind/Order · 3 + [C][C]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]."                                             → R, copying P2's vanilla 4-Might Brute
 *   (+ Daring Poro ogn-210-298 · Unit · Order · 2 · 2 Might · Poro · [Assault] — the card on the other side.)
 *
 * Rules: 477.1.b / 477.1.b.1.a (layer-1 copy: name, type, tags, cost, domain, rules text — incl. printed keywords —
 * REPLACE the holder's), 477.1.b.1.b (copyable = printed, or, for a copy, the traits it currently copies), 477.2.a
 * (a GRANTED keyword lives in layer 2 on top of whatever the object is — neither erased by a copy onto its bearer nor
 * conferred on something copying the bearer), 187.2 / 187.6 (token definitions), 185.1.a / 185.1.b (token-ness is
 * intrinsic: tokens stay tokens, cards never become tokens), 186.1 (a token off the board ceases to exist), 816.1.b
 * (Temporary: "At the start of this permanent's controller's Beginning Phase, before scoring, kill this"), 124 (a
 * killed card is its printed self in the trash), 435.1.c (Equipment on a unit that leaves the board falls off).
 *
 * Question: P1 controls S (Sprite token, printed Temporary), R (Reflection = copy of P2's Brute, GIVEN Temporary) and
 * Daring Poro; P1 owns two Shady Spectacles. Case 1: Spectacles on S choosing the Poro. Case 2: on R choosing the
 * Poro. Case 3: on the Poro choosing S. Case 4: on the Poro choosing R. For each: the equipped unit's sheet, whether
 * it has Temporary, token/card, and whether it is killed at the start of P1's next Beginning Phase.
 *
 * Expected: 1 — S = Daring Poro 2/Poro/2/Order/[Assault], its printed Temporary OVERWRITTEN → survives; still a token.
 * 2 — R = Daring Poro … but the granted Temporary stays → killed, ceases to exist, Spectacles fall off. 3 — the Poro =
 * Sprite 3/Fae/0/no domain/[Temporary] (printed on the model → copied), Assault gone, still a CARD → killed, to the
 * trash as printed Daring Poro, Spectacles stay in base. 4 — the Poro = Brute 4/Brute's cost+domain/no text; R's
 * granted Temporary is NOT copyable → no Temporary, survives; still a card.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

const SHADY_SPECTACLES = "ven-137-166";
const SPRITE_CALL = "ogn-094-298";
const MIRROR_IMAGE = "unl-200-219";
const DARING_PORO = "ogn-210-298";

/** P2's vanilla model for the Reflection: a 4-Might, 4-cost Fury "Brute" with no text. */
const BRUTE = { domain: "fury", energyCost: 4, might: 4, name: "Brute" } as const;

const tagsOf = (card: string): readonly string[] => getGlobalCardRegistry().get(card)?.tags ?? [];

/**
 * P1's turn 2. P1: Daring Poro + two loose Shady Spectacles in base, Sprite Call + Mirror Image in hand,
 * 8 energy + 2 mind + 2 order (Sprite Call 3, Mirror Image 3+[C][C], two Equips at 1+[order] each). P2: Brute at home.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 2, order: 2 } })
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P2, "base", BRUTE, "brute")
    .gear(P1, SHADY_SPECTACLES, "specs1")
    .gear(P1, SHADY_SPECTACLES, "specs2")
    .hand(P1, SPRITE_CALL, "call")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Cast Sprite Call (→ S) then Mirror Image on P2's Brute (→ R); returns the two token ids. */
async function withTokens(): Promise<{ game: Game; s: string; r: string }> {
  const game = await board().build();
  const before = game.p1.units();
  await game.p1.cast("call");
  await game.settle();
  const s = game.p1.units().find((id) => !before.includes(id));
  expect(s).toBeDefined();
  const before2 = game.p1.units();
  await game.p1.cast("mirror", { targets: "brute" });
  await game.settle();
  const r = game.p1.units().find((id) => !before2.includes(id));
  expect(r).toBeDefined();
  expect(game.chain()).toEqual([]);
  return { game, r: r as string, s: s as string };
}

/** Activate [Equip]: `gear` onto `holder`; answer "choose another friendly unit" with `model`. Returns the ids offered. */
async function equip(game: Game, gear: string, holder: string, model: string): Promise<string[]> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: gear, unitId: holder } });
  let offered: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      offered = d.options.map((o) => o.card ?? o.key).sort();
      await game.p1.pick(model);
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
  }
  expect(game.state(gear).attachedTo).toBe(holder);
  return offered;
}

/** P1 ends turn 2, P2 plays turn 3 out, P1's turn 4 begins: the Temporary kills resolve in its Beginning Phase; stops in P1's main phase. */
async function toP1NextTurn(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
}

describe("premise — the three sheets before any Spectacles", () => {
  test("S (from Sprite Call) is a ready TOKEN: name Sprite, 3 Might, cost 0, no domain, and its [Temporary] is part of its own definition (keywords has it, grantedKeywords is EMPTY)", async () => {
    const { game, s } = await withTokens();
    expect(game.state(s)).toMatchObject({ baseMight: 3, controller: P1, domains: [], energyCost: 0, grantedKeywords: [], isReady: true, isToken: true, might: 3, name: "Sprite", zone: "base" });
    expect(game.state(s).keywords).toContain("Temporary");
  });

  // Expected (187.2): "a domainless unit token with 3 Might, the FAE tag, and the Temporary keyword".
  // Actual: the minted Sprite token definition carries the tag "Sprite" instead of "Fae".
  test.failing("BUG: the Sprite token has the Fae tag (187.2)", async () => {
    const { s } = await withTokens();
    expect(tagsOf(s)).toContain("Fae");
  });

  test("R (from Mirror Image on P2's Brute) is a ready TOKEN reading Brute: 4 Might, cost 4, Fury — and its [Temporary] is GRANTED (grantedKeywords: permanent Temporary, 477.2.a); the real Brute is untouched and has none", async () => {
    const { game, r } = await withTokens();
    expect(game.state(r)).toMatchObject({ baseMight: 4, controller: P1, domains: ["fury"], energyCost: 4, isReady: true, isToken: true, might: 4, name: "Brute", owner: P1, zone: "base" });
    expect(game.state(r).keywords).toContain("Temporary");
    expect(game.state(r).grantedKeywords).toEqual([expect.objectContaining({ duration: "permanent", keyword: "Temporary" })]);
    expect(game.state("brute")).toMatchObject({ controller: P2, isToken: false, might: 4 });
    expect(game.state("brute").keywords).not.toContain("Temporary");
  });

  test("Daring Poro is a CARD: 2 Might, Poro, cost 2, Order, [Assault], no Temporary; P1 has 2 energy + 2 pips left for the two Equips", async () => {
    const { game } = await withTokens();
    expect(game.state("poro")).toMatchObject({ domains: ["order"], energyCost: 2, grantedKeywords: [], isToken: false, might: 2, name: "Daring Poro" });
    expect(game.state("poro").keywords).toEqual(["Assault"]);
    expect(tagsOf("poro")).toEqual(["Poro"]);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power()).toBe(2); // Mirror Image's [C][C] took two of the four pips
  });

  test("'choose ANOTHER FRIENDLY unit': equipping S offers exactly {Poro, R} — never S itself, never P2's Brute", async () => {
    const { game, s, r } = await withTokens();
    const offered = await equip(game, "specs1", s, "poro");
    expect(offered).toEqual(["poro", r].sort());
    expect(offered).not.toContain(s);
    expect(offered).not.toContain("brute");
    expect(game.p1.energy()).toBe(1); // Equip: [1][order]
    expect(game.p1.power()).toBe(1);
  });
});

describe("Case 1 — Spectacles on S (printed Temporary) choosing Daring Poro", () => {
  test("S's sheet becomes Daring Poro's: name, 2 Might, Poro tag (Sprite's gone), cost 2, Order, [Assault] — and NO Temporary: its own definition's keyword was overwritten by the layer-1 copy; still a TOKEN (185.1.a)", async () => {
    const { game, s } = await withTokens();
    await equip(game, "specs1", s, "poro");
    expect(game.state(s)).toMatchObject({ attachments: ["specs1"], baseMight: 2, domains: ["order"], energyCost: 2, isToken: true, might: 2, name: "Daring Poro" });
    expect(game.state(s).keywords).toEqual(["Assault"]);
    expect(game.state(s).keywords).not.toContain("Temporary");
    expect(game.state(s).grantedKeywords).toEqual([]);
    expect(tagsOf(s)).toEqual(["Poro"]);
    expect(game.state("poro")).toMatchObject({ might: 2, name: "Daring Poro" }); // the model is untouched
  });

  test("it SURVIVES the start of P1's next Beginning Phase (nothing to trigger) — still 'Daring Poro' wearing the Spectacles on turn 4 — while R, whose Temporary was granted, is killed and ceases to exist", async () => {
    const { game, s, r } = await withTokens();
    await equip(game, "specs1", s, "poro");
    await toP1NextTurn(game);
    expect(game.has(s)).toBe(true);
    expect(game.state(s)).toMatchObject({ attachments: ["specs1"], isReady: true, might: 2, name: "Daring Poro", zone: "base" });
    expect(game.state("specs1").attachedTo).toBe(s);
    expect(game.has(r)).toBe(false);
    expect(game.zoneOf(r)).toBe("gone");
    expect(game.violations()).toEqual([]);
  });
});

describe("Case 2 — Spectacles on R (granted Temporary) choosing Daring Poro", () => {
  test("R's sheet becomes Daring Poro's (2, Poro, cost 2, Order, Assault — Brute's copied values replaced) but the GRANTED Temporary is still there on top (477.2.a); still a token", async () => {
    const { game, r } = await withTokens();
    await equip(game, "specs1", r, "poro");
    expect(game.state(r)).toMatchObject({ attachments: ["specs1"], baseMight: 2, domains: ["order"], energyCost: 2, isToken: true, might: 2, name: "Daring Poro" });
    expect(game.state(r).keywords).toEqual(expect.arrayContaining(["Assault", "Temporary"]));
    expect(game.state(r).grantedKeywords).toEqual([expect.objectContaining({ duration: "permanent", keyword: "Temporary" })]);
    expect(tagsOf(r)).toEqual(["Poro"]);
  });

  test("→ killed at the start of P1's next Beginning Phase (816.1.b): the token ceases to exist off-board (186.1), the Spectacles fall off into P1's base unattached; the real Poro is untouched; no points from any of it", async () => {
    const { game, r } = await withTokens();
    await equip(game, "specs1", r, "poro");
    await toP1NextTurn(game);
    expect(game.has(r)).toBe(false);
    expect(game.zoneOf(r)).toBe("gone");
    expect(game.p1.trash()).not.toContain(r);
    expect(game.zoneOf("specs1")).toBe("base");
    expect(game.state("specs1").attachedTo).toBeUndefined();
    expect(game.state("poro")).toMatchObject({ isToken: false, might: 2, name: "Daring Poro", zone: "base" });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("Case 3 (flip) — Spectacles on Daring Poro choosing S", () => {
  test("the Poro copies the Sprite token DEFINITION: name Sprite, 3 Might, the token's tag, no domain, cost 0 (185.3.a.1), [Temporary] (printed on the model → copyable) — and loses [Assault] / Poro", async () => {
    const { game, s } = await withTokens();
    const offered = await equip(game, "specs1", "poro", s);
    expect(offered).toContain(s);
    expect(offered).not.toContain("poro");
    expect(game.state("poro")).toMatchObject({ attachments: ["specs1"], baseMight: 3, domains: [], energyCost: 0, might: 3, name: "Sprite" });
    expect(game.state("poro").keywords).toContain("Temporary");
    expect(game.state("poro").keywords).not.toContain("Assault");
    expect(tagsOf("poro")).toEqual(tagsOf(s));
    expect(tagsOf("poro")).not.toContain("Poro");
  });

  // Expected (185.1.b): "Card Game Objects cannot become tokens by any means" — token-ness is not a copyable trait
  // (477.1.b.1.a). Actual: copying an effect-minted token copies its `isToken` marker onto the Poro's sheet.
  test("the Spectacled Poro is still a CARD, not a token (185.1.b)", async () => {
    const { game, s } = await withTokens();
    await equip(game, "specs1", "poro", s);
    expect(game.state("poro").name).toBe("Sprite");
    expect(game.state("poro").isToken).toBe(false);
  });

  test("it now HAS Temporary → at the start of P1's next Beginning Phase the trigger kills it: the Poro is no longer on the board, the Spectacles stay on the board unattached in P1's base; S (printed Temporary, unequipped) dies too", async () => {
    const { game, s } = await withTokens();
    await equip(game, "specs1", "poro", s);
    await toP1NextTurn(game);
    expect(game.p1.units()).not.toContain("poro");
    expect(["base", "battlefield-bf1"]).not.toContain(game.zoneOf("poro"));
    expect(game.zoneOf("specs1")).toBe("base");
    expect(game.state("specs1")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.has(s)).toBe(false);
  });

  // Expected (124, 185.1.b, 435.1.c): the killed Poro is a CARD — it goes to P1's TRASH, where (Spectacles detached,
  // off-board = new object) it is the printed Daring Poro again: 2 Might, cost 2, [Assault].
  // Actual: the engine treats the copied-token Poro as a token and makes it cease to exist ("gone"); the trash never gets it.
  test("the killed Spectacled Poro goes to P1's trash as the printed 'Daring Poro' (a card never ceases to exist — 186.1 is tokens-only)", async () => {
    const { game, s } = await withTokens();
    await equip(game, "specs1", "poro", s);
    await toP1NextTurn(game);
    expect(game.has("poro")).toBe(true);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.trash()).toContain("poro");
    expect(game.state("poro")).toMatchObject({ energyCost: 2, isToken: false, might: 2, name: "Daring Poro" });
    expect(game.state("poro").keywords).toEqual(["Assault"]);
  });
});

describe("Case 4 — Spectacles on Daring Poro choosing R (a copy of Brute with a GRANTED Temporary)", () => {
  test("the Poro copies R's CURRENT copyable traits (477.1.b.1.b) = Brute's: name Brute, 4 Might, Fury, no [Assault], no Poro tag; the Spectacles are on it", async () => {
    const { game, r } = await withTokens();
    await equip(game, "specs1", "poro", r);
    expect(game.state("poro")).toMatchObject({ attachments: ["specs1"], baseMight: 4, domains: ["fury"], might: 4, name: "Brute" });
    expect(game.state("poro").keywords).not.toContain("Assault");
    expect(tagsOf("poro")).not.toContain("Poro");
    expect(game.state(r)).toMatchObject({ might: 4, name: "Brute" }); // R untouched
  });

  // Expected (477.1.b.1.b): R's copyable cost is the one it currently copies — Brute's 4 (R itself reads cost 4).
  // Actual: because the MODEL is a token the engine prices the copy at 0 (185.3.a.1 applied to a copy-of-a-card).
  test.failing("BUG: the Poro's cost is Brute's 4 — R's current copyable cost — not a bare token's 0 (477.1.b.1.b)", async () => {
    const { game, r } = await withTokens();
    await equip(game, "specs1", "poro", r);
    expect(game.state(r).energyCost).toBe(4);
    expect(game.state("poro").energyCost).toBe(4);
  });

  // Expected (477.2.a vs 477.1.b.1.a): R's Temporary was GRANTED by Mirror Image (layer 2) — not a copyable trait — so
  // the Poro copying R gets NO Temporary (keywords empty, like Brute's). Actual: the Reflection's minted definition
  // bakes Temporary into its keyword list, so the copy confers it (keywords: ["Temporary"], nothing granted).
  test.failing("BUG: a granted Temporary is not conferred on a copier — the Poro-as-Brute has NO Temporary", async () => {
    const { game, r } = await withTokens();
    await equip(game, "specs1", "poro", r);
    expect(game.state("poro").name).toBe("Brute");
    expect(game.state("poro").grantedKeywords).toEqual([]);
    expect(game.state("poro").keywords).not.toContain("Temporary");
  });

  // Expected: no Temporary → nothing triggers for the Poro at P1's next Beginning Phase; it is still a 4-Might 'Brute'
  // CARD in base wearing the Spectacles, while R (granted Temporary) and S (printed Temporary) both die.
  // Actual: the conferred Temporary kills the Poro too (and, flagged as a token, it even ceases to exist).
  test.failing("BUG: the Poro-as-Brute SURVIVES P1's next Beginning Phase (still on the board, still a card, Spectacles still on) while R and S are killed", async () => {
    const { game, r, s } = await withTokens();
    await equip(game, "specs1", "poro", r);
    await toP1NextTurn(game);
    expect(game.has(r)).toBe(false);
    expect(game.has(s)).toBe(false);
    expect(game.has("poro")).toBe(true);
    expect(game.state("poro")).toMatchObject({ attachments: ["specs1"], isToken: false, might: 4, name: "Brute", zone: "base" });
    expect(game.state("specs1").attachedTo).toBe("poro");
  });

  test("what the engine does agree on: R itself (granted Temporary) and S (printed Temporary) are both killed at that Beginning Phase and cease to exist; the second, unused Spectacles never left the base", async () => {
    const { game, r, s } = await withTokens();
    await equip(game, "specs1", "poro", r);
    await toP1NextTurn(game);
    expect(game.zoneOf(r)).toBe("gone");
    expect(game.zoneOf(s)).toBe("gone");
    expect(game.state("specs2")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });
});
