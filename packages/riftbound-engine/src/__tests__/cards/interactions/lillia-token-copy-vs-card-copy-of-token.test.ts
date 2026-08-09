/**
 * Interaction: Lillia, Protector of Dreams (unl-058-219) × Mirror Image (unl-200-219) × Shady Spectacles (ven-137-166)
 *
 *   Lillia, Protector of Dreams — Champion Unit · Calm · 5 · 4 Might
 *     "When you play a token unit, give me +1 [Might] this turn. Your token units have [Tank]."
 *   Mirror Image — Spell · Mind/Order · 3 + [C][C] · [Action]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]."
 *   Shady Spectacles — Gear · Order · [Equip] [1][order]
 *     "As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of
 *      that unit for as long as this is attached to it."
 *   (+ Ruined Rex unl-067-219, a 6-Might card unit with [Deathknell]; Daring Poro ogn-210-298, a 2-Might
 *    card unit; a 3-Might Mech unit TOKEN as made by Production Surge; Retreat ogn-104-298 as the bounce;
 *    Soul Shepherd unl-077-219 "Your token units have +1 [Might]" as a second token-only discriminator.)
 *
 * Question: token-ness is not copyable in either direction. P1 controls Lillia and a Mech token.
 *  (a) Mirror Image on P2's Ruined Rex (a CARD): is the resulting "Ruined Rex" a token unit — does Lillia
 *      trigger and does it have Tank?
 *  (b) Spectacles on P1's Daring Poro (a CARD) copying the Mech TOKEN: is the Poro now a token unit with
 *      Tank? Did Lillia trigger? If bounced, does it cease to exist like a token?
 *  (c) For "token / non-token unit" text, which of the two counts as which?
 *
 * Expected (rules): "token" vs "card" is an intrinsic category (185.1) — tokens never stop being tokens
 * (185.1.a), cards never become tokens (185.1.b); it is not among the copyable traits (477.1.b.1.a).
 *  (a) The Reflection is created as a token and stays one: a token unit named Ruined Rex, 6 Might, with
 *      Deathknell (copied), Temporary (granted, 477.2.a) and Tank (Lillia's static). Mirror Image PLAYS a
 *      token (185.2.a) → Lillia +1 this turn.
 *  (b) The Poro takes the Mech's copyable traits (name Mech, 3 Might, no domain, cost treated as 0 —
 *      185.3.a.1) but remains a CARD: no Tank, Lillia does not trigger (Equip attaches, nothing is played —
 *      818.1.b). Bounced, it goes to hand as the printed Daring Poro and stays there (186.1 is tokens-only);
 *      the Spectacles fall off (435.1).
 *  (c) The Spectacled Poro is the non-token unit; the Reflection-Rex is the token (Soul Shepherd pumps the
 *      Reflection and the Mech, never the Poro; a bounced Reflection ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LILLIA = "unl-058-219";
const MIRROR_IMAGE = "unl-200-219";
const SHADY_SPECTACLES = "ven-137-166";
const RUINED_REX = "unl-067-219";
const DARING_PORO = "ogn-210-298";
const RETREAT = "ogn-104-298"; // 1 mind: Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.
const SOUL_SHEPHERD = "unl-077-219"; // Your token units have +1 [Might].
/** The 3-Might Mech unit token Production Surge makes (a `token-` alias is a token instance to the engine). */
const MECH_TOKEN = { cardType: "unit", might: 3, name: "Mech", tags: ["Mech"] } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1: Lillia (4), a Mech token (3), Daring Poro (2), loose Shady Spectacles, Mirror Image + Retreat in
 * hand, 5 energy + 3 mind + 1 order (Mirror 3+[C][C], Equip 1+[order], Retreat 1). P2: Ruined Rex (6) at home.
 */
function board(opts: { shepherd?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 5, power: { mind: 3, order: 1 } })
    .unit(P1, "base", LILLIA, "lillia");
  if (opts.shepherd) {
    s = s.unit(P1, "base", SOUL_SHEPHERD, "shepherd");
  }
  return s
    .unit(P1, "base", MECH_TOKEN, "token-mech")
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P2, "base", RUINED_REX, "rex")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P1, RETREAT, "retreat");
}

/** Cast Mirror Image choosing P2's Rex; returns the new Reflection's id. */
async function mirrorTheRex(game: Game): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "rex" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const token = game.p1.base().find((id) => !before.includes(id));
  expect(token).toBeDefined();
  return token as string;
}

/** Activate [Equip]: Spectacles onto the Poro, choosing the Mech token as the unit to copy. */
async function spectaclesOnPoroCopyingMech(game: Game): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
  expect(offered).toContain("token-mech"); // "another friendly unit" — a token qualifies
  expect(offered).not.toContain("poro"); // "another"
  expect(offered).not.toContain("rex"); // "friendly"
  await game.p1.pick("token-mech");
  await game.settle();
  expect(game.state("specs").attachedTo).toBe("poro");
}

describe("Lillia × Mirror Image × Shady Spectacles — token-ness is intrinsic, not copyable (185.1)", () => {
  test("premise: the Mech token is a token unit with Tank from Lillia; the Poro (a card) has no Tank; Lillia is 4 Might", async () => {
    const game = await board().build();
    expect(game.state("token-mech")).toMatchObject({ isToken: true, might: 3, name: "Mech" });
    expect(game.state("token-mech").keywords).toContain("Tank");
    expect(game.state("poro")).toMatchObject({ isToken: false, might: 2, name: "Daring Poro" });
    expect(game.state("poro").keywords).not.toContain("Tank");
    expect(game.state("lillia").might).toBe(4);
    expect(game.state("rex")).toMatchObject({ isToken: false, might: 6, controller: P2 });
  });

  // ── (a) token copy of a card ─────────────────────────────────────────────────────────────

  test("(a) Mirror Image may choose the ENEMY Ruined Rex ('Choose a unit'); it costs 3 + two pips", async () => {
    const game = await board().build();
    const offered = (game.p1.option("cast", "mirror")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(offered).toEqual(expect.arrayContaining(["rex", "poro", "token-mech", "lillia"]));
    await game.p1.cast("mirror", { targets: "rex" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1, order: 1 } });
  });

  test("(a) the Reflection that copies Rex is STILL A TOKEN (185.1.a): a ready token unit named 'Ruined Rex', 6 Might, with Rex's Deathknell, the granted Temporary — and Tank from Lillia's 'your token units'", async () => {
    const game = await board().build();
    const refl = await mirrorTheRex(game);
    const s = game.state(refl);
    expect(s).toMatchObject({ cardType: "unit", controller: P1, isReady: true, isToken: true, location: "base", might: 6, name: "Ruined Rex", owner: P1 });
    expect(s.keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary", "Tank"]));
    expect(s.grantedKeywords).toEqual(expect.arrayContaining([expect.objectContaining({ keyword: "Tank", duration: "static" })]));
    // the model is untouched and, being P2's CARD, has no Tank
    expect(game.state("rex")).toMatchObject({ controller: P2, isToken: false, might: 6 });
    expect(game.state("rex").keywords).not.toContain("Tank");
  });

  test("(a) Mirror Image PLAYS a token unit (185.2.a) → Lillia's trigger fires exactly once: 4 → 5 Might this turn, back to 4 next turn", async () => {
    const game = await board().build();
    await mirrorTheRex(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("lillia").might).toBe(5);
    expect(game.state("lillia").mightModifier).toBe(1);
    await game.advanceTurn(); // → P2's turn: "this turn" is over
    expect(game.state("lillia").might).toBe(4);
  });

  // ── (b) card copy of a token ─────────────────────────────────────────────────────────────

  test("(b) Spectacles on the Poro copying the Mech TOKEN: the Poro reads as 'Mech', 3 Might, no domain, Assault gone — but it is STILL A CARD (185.1.b): not a token, so NO Tank from Lillia", async () => {
    const game = await board().build();
    await spectaclesOnPoroCopyingMech(game);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 3, order: 0 } }); // Equip 1 + [order]
    const s = game.state("poro");
    expect(s).toMatchObject({ attachments: ["specs"], domains: [], isToken: false, might: 3, name: "Mech" });
    expect(s.keywords).not.toContain("Assault"); // rules text replaced by the (empty) Mech text
    expect(s.keywords).not.toContain("Tank"); // Lillia: "your TOKEN units"
    expect(s.grantedKeywords).toEqual([]);
    // the copied token itself is unchanged and keeps its Tank
    expect(game.state("token-mech")).toMatchObject({ isToken: true, might: 3 });
    expect(game.state("token-mech").keywords).toContain("Tank");
  });

  test("(b) the copied COST of a token is 'treated as 0 for all purposes' (185.3.a.1, 477.1.b.1.a Cost is copyable) — the Spectacled Poro's energy cost should read 0, not its printed 2", async () => {
    // Expected: while it is a copy of the Mech token the Poro's cost is the token's cost = 0.
    // Actual: name/Might/domain/rules text are copied but the printed energy cost 2 is kept.
    const game = await board().build();
    await spectaclesOnPoroCopyingMech(game);
    expect(game.state("poro").name).toBe("Mech");
    expect(game.state("poro").energyCost).toBe(0);
  });

  test("(b) Lillia did NOT trigger: Equip is an activated ability that attaches (818.1.b) — nothing was played, let alone a token; Lillia stays 4", async () => {
    const game = await board().build();
    await spectaclesOnPoroCopyingMech(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("lillia").might).toBe(4);
    expect(game.state("lillia").mightModifier).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  test("(b) bounced (Retreat), the Spectacled 'Mech' goes to its owner's HAND as the printed Daring Poro and STAYS there — 186.1 is tokens-only; the Spectacles fall off into base unattached (435.1)", async () => {
    const game = await board().build();
    await spectaclesOnPoroCopyingMech(game);
    await game.p1.cast("retreat", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.has("poro")).toBe(true);
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p1.hand()).toContain("poro");
    expect(game.state("poro")).toMatchObject({ attachments: [], energyCost: 2, isToken: false, might: 2, name: "Daring Poro" });
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs").attachedTo).toBeUndefined();
    // and it is an ordinary card in hand: replayable for its printed 2
    expect(game.p1.can("play", "poro")).toBe(true);
  });

  // ── (c) which one is the "non-token unit"? ───────────────────────────────────────────────

  test("(c) contrast: the Reflection-Rex bounced by the same Retreat CEASES TO EXIST (186.1) — it is the token of the two", async () => {
    const game = await board().build();
    const refl = await mirrorTheRex(game);
    expect(game.state(refl).isToken).toBe(true);
    await game.p1.cast("retreat", { targets: refl });
    await game.settle();
    expect(game.has(refl)).toBe(false);
    expect(game.zoneOf(refl)).toBe("gone");
    expect(game.p1.hand()).not.toContain(refl);
  });

  test("(c) a second token-only static (Soul Shepherd, 'Your token units have +1 [Might]') sorts them the same way: Mech token 4, Reflection-Rex 7, Spectacled Poro (card copy of the token) exactly 3", async () => {
    const game = await board({ shepherd: true }).build();
    expect(game.state("token-mech").might).toBe(4); // 3 + 1 (token)
    expect(game.state("poro").might).toBe(2); // card: no bonus
    const refl = await mirrorTheRex(game);
    expect(game.state(refl)).toMatchObject({ isToken: true, might: 7, name: "Ruined Rex" }); // 6 + 1 (token)
    await spectaclesOnPoroCopyingMech(game);
    expect(game.state("poro")).toMatchObject({ isToken: false, might: 3, name: "Mech" }); // copies printed 3, no token bonus
    expect(game.state("poro").keywords).not.toContain("Tank");
    expect(game.state(refl).keywords).toContain("Tank");
    expect(game.violations()).toEqual([]);
  });
});
