/**
 * Interaction: Heedless Resurrection (unl-142-219) · Spell · Chaos · 2+[chaos] · Reaction
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that
 *      costs no more Energy and no more Power than the killed unit, ignoring its cost."
 *   × Mirror Image (unl-200-219) · Spell · Mind/Order · 3+[mind][order] · Action
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that
 *      unit. Give it [Temporary]."
 *   × Ferrous Forerunner (sfd-021-221) · Unit · Fury · 6+[fury] · 6 Might   (P2's — the copy source)
 *     "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *   (+ a plain 3-Might Sprite token unl-t07 with [Temporary]; inline trash units of known cost)
 *
 * Question: earlier this turn P1 Mirror-Imaged P2's Ferrous Forerunner, so P1 has a Reflection
 * "Ferrous Forerunner" token. P1 also has a plain Sprite token and, in trash, a 6-cost/1-power unit
 * and a 2-cost/0-power unit (plus over-budget decoys). P1 plays Heedless Resurrection.
 *   (a) Killing the Reflection as the cost: is its cost 0 (a token) or 6 + 1 power (copied) — which
 *       trash units are legal?
 *   (b) Does killing it AS A COST still fire the copied Deathknell (two Mechs)? Does the token go to
 *       the trash?
 *   (c) NO side: killing the Sprite instead — which trash units are legal?
 *
 * Rules: 477.1.b.1.a (Cost is copyable), 185.3.a.2 (a copy appends a cost to a token), 206 / 356.1.c
 * (cost checks read the printed OR COPIED cost — the Atakhan-kills-a-Reflection example), 185.3.a /
 * 185.3.a.1 (a plain token's cost is 0 for all purposes), 808.1.d.2 / 808.1.d.3 (Deathknell is queued
 * and its facts noted BEFORE the permanent leaves), 186.1 (a token off the board ceases to exist),
 * 182 (token controller = P1 → "your base" = P1's), cost-time triggers land above the spell and
 * resolve first, 356.1.b.1 (ignoring cost), 143.4 (enters exhausted), 055 (do as much as you can).
 *
 * Expected: (a) 6 Energy / 1 Power → the 6/1 unit and the 2/0 unit are legal; a 7-cost or a
 * 6-cost/2-power unit is not. (b) Yes: Deathknell goes on the chain above Heedless, P1 gets two
 * exhausted 3-Might Mechs in P1's base before Heedless resolves; the Reflection is simply gone (no
 * trash). (c) only a 0-Energy/0-Power unit; with none in trash P1 gets nothing out of it.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const MIRROR_IMAGE = "unl-200-219";
const FERROUS_FORERUNNER = "sfd-021-221";
const SPRITE_TOKEN = "unl-t07";

const BIG_6_1 = { cardType: "unit", energyCost: 6, powerCost: ["fury"], might: 5, name: "Big Six-One" } as const;
const SMALL_2_0 = { cardType: "unit", energyCost: 2, might: 2, name: "Small Two-Zero" } as const;
const SEVEN_0 = { cardType: "unit", energyCost: 7, might: 7, name: "Decoy Seven" } as const;
const SIX_2 = { cardType: "unit", energyCost: 6, powerCost: ["fury", "fury"], might: 6, name: "Decoy Six-Two" } as const;
const ZERO_0 = { cardType: "unit", energyCost: 0, might: 1, name: "Zero" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly Mirror Image (3+[mind][order]) + Heedless (2+[chaos]). P2: Ferrous Forerunner
 * in base. P1: a plain Sprite token in base; trash = Big (6/[fury]), Small (2/–), and two decoys that
 * exceed the Reflection's budget on one axis each (7/– and 6/[fury][fury]). `withZero` adds a 0-cost unit.
 */
function board(opts: { withZero?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 5, power: { mind: 1, order: 1, chaos: 1 } })
    .unit(P2, "base", FERROUS_FORERUNNER, "ff")
    .unit(P1, "base", SPRITE_TOKEN, "sprite")
    .trash(P1, BIG_6_1, "big")
    .trash(P1, SMALL_2_0, "small")
    .trash(P1, SEVEN_0, "seven")
    .trash(P1, SIX_2, "sixtwo")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P1, HEEDLESS, "hr");
  return opts.withZero ? s.trash(P1, ZERO_0, "zero") : s;
}

/** "Earlier this turn": Mirror Image resolved on P2's Forerunner. Returns the game and the Reflection's id. */
async function withReflection(opts: { withZero?: boolean } = {}): Promise<{ game: Game; refl: string }> {
  const game = await board(opts).build();
  await game.p1.cast("mirror", { targets: "ff" });
  await game.settle();
  const fresh = game.p1.base().filter((id) => id !== "sprite");
  expect(fresh).toHaveLength(1);
  expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0, order: 0, chaos: 1 } }); // exactly Heedless left
  return { game, refl: fresh[0] as string };
}

function p1Mechs(game: Game): string[] {
  return game.cardsAt("base", P1).filter((id) => game.state(id).name === "Mech" && game.state(id).isToken);
}

/** The trash units Heedless offers to play once it resolves (the engine asks on resolution). */
function resurrectOffer(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

describe("Heedless Resurrection killing a Reflection — the COPIED cost sets the budget", () => {
  test("premise: the Reflection is a P1 TOKEN named Ferrous Forerunner with the COPIED cost 6 + [fury], 6 Might, Deathknell and Temporary; the Sprite is a plain 0-cost token (477.1.b.1.a, 185.3.a.2, 185.3.a.1)", async () => {
    const { game, refl } = await withReflection();
    expect(game.state(refl)).toMatchObject({
      name: "Ferrous Forerunner",
      isToken: true,
      owner: P1,
      controller: P1,
      energyCost: 6,
      powerCost: ["fury"],
      might: 6,
      zone: "base",
    });
    expect(game.state(refl).keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    expect(game.state("sprite")).toMatchObject({ name: "Sprite", isToken: true, energyCost: 0, powerCost: [], might: 3 });
    expect(game.state("ff")).toMatchObject({ controller: P2, zone: "base" }); // the original is untouched
  });

  // ── (a) kill the Reflection: budget = 6 Energy / 1 Power ────────────────────────────────────

  test("(a) the Reflection is a legal Heedless sacrifice; killing it pays the cost at play time (it leaves the board immediately) and P1 pays exactly 2 + [chaos]", async () => {
    const { game, refl } = await withReflection();
    const sac = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.required).toBe(true);
    expect(sac?.options ?? []).toContain(refl);
    await game.p1.cast("hr", { sacrifice: refl, targets: "big" });
    expect(game.p1.base()).not.toContain(refl);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0, chaos: 0 } });
    expect(game.chain().some((c) => c.cardId === "hr" && c.controller === P1 && !c.triggered)).toBe(true);
  });

  // rule 355.5 / 355.10.a — the trash is public, so the unit to resurrect is named as Heedless is PLAYED.
  test("(a) budget = the COPIED cost (206): P1 is offered exactly the 6/[fury] unit and the 2/– unit — NOT the 7-cost decoy, NOT the 6/[fury][fury] decoy", async () => {
    const { game, refl } = await withReflection();
    const offers = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    const flat = [...new Set((offers as unknown[]).flat() as string[])].sort();
    expect(flat).toEqual(expect.arrayContaining(["big", "small"]));
    expect(flat).not.toContain("seven");
    expect(flat).not.toContain("sixtwo");
    await expect(game.p1.cast("hr", { sacrifice: refl, targets: "seven" })).rejects.toThrow();
  });

  test("(a) picking the 6-cost/1-power unit plays it from the trash to P1's base, exhausted, for free — P1's pool was already empty (356.1.b.1, 143.4)", async () => {
    const { game, refl } = await withReflection();
    await game.p1.cast("hr", { sacrifice: refl, targets: "big" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.state("big")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0, chaos: 0 } });
    expect(game.chain()).toEqual([]);
  });

  // ── (b) the cost-kill still fires the copied Deathknell ──────────────────────────────────────

  test("(b) killing it AS A COST is still a death: the copied Deathknell is queued as P1's trigger ABOVE Heedless on the chain, while the token itself has ceased to exist — in no trash, not 'has' at all (808.1.d.2/.3, 186.1)", async () => {
    const { game, refl } = await withReflection();
    await game.p1.cast("hr", { sacrifice: refl, targets: "big" });
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["hr", P1, false],
      [refl, P1, true], // newest item = resolves first
    ]);
    expect(game.zoneOf(refl)).toBe("gone");
    expect(game.p1.trash()).not.toContain(refl);
    expect(game.p2.trash()).not.toContain(refl);
    expect(game.p1.trash().sort()).toEqual(["big", "mirror", "seven", "sixtwo", "small"].sort());
  });

  test("(b) the Deathknell resolves FIRST: two exhausted 3-Might Mech tokens appear in P1's base (182 — not P2's) while Heedless is still waiting on the chain", async () => {
    const { game, refl } = await withReflection();
    await game.p1.cast("hr", { sacrifice: refl, targets: "big" });
    expect(p1Mechs(game)).toEqual([]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Deathknell resolves
    const mechs = p1Mechs(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m)).toMatchObject({ might: 3, isToken: true, controller: P1, owner: P1, isExhausted: true, zone: "base" });
    }
    expect(game.cardsAt("base", P2).filter((id) => game.state(id).name === "Mech")).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr"]); // Heedless not yet resolved
    expect(game.zoneOf("big")).toBe("trash");
  });

  test("(b) end state of the whole line: Sprite + two Mechs + the resurrected Big in P1's base; P2's real Forerunner never died and made no Mechs", async () => {
    const { game, refl } = await withReflection();
    await game.p1.cast("hr", { sacrifice: refl, targets: "big" });
    await game.settle();
    expect(p1Mechs(game)).toHaveLength(2);
    expect(game.p1.units("base").sort()).toEqual(["big", "sprite", ...p1Mechs(game)].sort());
    expect(game.state("ff")).toMatchObject({ zone: "base", controller: P2, damage: 0 });
    expect(game.p2.units()).toEqual(["ff"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) NO side: kill the plain Sprite instead — budget = 0 / 0 ─────────────────────────────

  test("(c) killing the plain Sprite (cost 0 for all purposes, nothing appended): with a 0-cost unit in trash ONLY that unit is offered — neither the 2/– nor the 6/[fury] unit (185.3.a.1)", async () => {
    const { game, refl } = await withReflection({ withZero: true });
    const sac = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice");
    expect([...(sac?.options ?? [])].sort()).toEqual([refl, "sprite"].sort());
    await game.p1.cast("hr", { sacrifice: "sprite", targets: "zero" });
    expect(game.zoneOf("sprite")).toBe("gone"); // a token: ceased to exist, no Deathknell, no Mechs
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr"]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      expect(resurrectOffer(game)).toEqual(["zero"]);
      await expect(game.p1.pick("small")).rejects.toThrow();
      await expect(game.p1.pick("big")).rejects.toThrow();
      await game.p1.pick("zero");
      await game.settle();
    }
    expect(game.zoneOf("zero")).toBe("base"); // forced either way: the only legal card
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(p1Mechs(game)).toEqual([]);
    expect(game.zoneOf(refl)).toBe("base"); // the Reflection was not touched
  });

  // 055 / 355.8 — whether the engine lets P1 throw the Sprite away for nothing (cost paid, play
  // instruction impossible → ignored) or refuses the variant outright for want of a legal trash unit,
  // the practical answer is the same: killing the Sprite can never bring back the 2/– or 6/[fury] unit.
  test("(c) with NO 0-cost unit in trash, sacrificing the Sprite yields nothing: Big and Small stay in the trash whatever happens to the Sprite/Heedless", async () => {
    const { game, refl } = await withReflection();
    const attempt = await game.p1.try((p) => p.cast("hr", { sacrifice: "sprite" }));
    await game.settle();
    if (game.decision()?.kind === "pick") {
      // If a prompt were shown it may offer nothing playable from the over-budget trash.
      expect(resurrectOffer(game).filter((c) => ["big", "small", "seven", "sixtwo"].includes(c))).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.p1.units("base")).not.toContain("big");
    expect(p1Mechs(game)).toEqual([]);
    expect(game.zoneOf(refl)).toBe("base");
    if (attempt.ok) {
      // 055 reading: cost paid, spell resolved doing nothing.
      expect(game.zoneOf("sprite")).toBe("gone");
      expect(game.zoneOf("hr")).toBe("trash");
      expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0, chaos: 0 } });
    } else {
      // 355.8 reading: no legal trash unit for that cost choice → the play is not allowed at all.
      expect(game.zoneOf("sprite")).toBe("base");
      expect(game.zoneOf("hr")).toBe("hand");
      expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0, order: 0, chaos: 1 } });
    }
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });
});
