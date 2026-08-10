/**
 * Interaction: Guards! (sfd-154-221, Spell · Order · 3) "Play a 2 [Might] Sand Soldier unit token. You may pay [order] to ready it."
 *   × Sacred Shears (sfd-172-221, Equipment · Order · +1) "[Equip] [order] … [Deathknell] — Draw 1."
 *   × Keeper's Verdict (unl-204-219, Spell · Body/Order · Action) "Choose an enemy unit at a battlefield. Its owner places it
 *     on the top or bottom of their Main Deck."
 *   × an inline "Bolt" (deal 3 to a unit) for the kill contrast.
 *
 * Question: P1 resolves Guards!, placing the Sand Soldier at bf1 (P1 controls bf1; P2 controls bf2).
 *   (a) 184.1/184.2: where may the token be played, and what is its ready state with vs. without the extra [order]?
 *       P1 then Equips Sacred Shears to it (3 Might). P1's deck has N cards with known top card T.
 *   (b) P2 resolves Keeper's Verdict on it: who chooses top/bottom; the Soldier's (owner, controller, zone, exists) after;
 *       is P1's deck N+1 / next draw the Soldier or T; does the Shears Deathknell draw fire; where does Sacred Shears end up?
 *   (c) Contrast: P2 deals it 3 damage (kill) — does P1 draw off the Deathknell, is the token in P1's trash, where is Shears?
 *
 * Rules: 185.2.a/349 (a played token goes to base or a controlled battlefield), 185.2.d (units enter exhausted), 184.1
 * (the creating effect may specify ready), 183 (owner = caster), 186.1 (a token in a non-board zone ceases to exist),
 * 428.1/428.2.a (kill = board → trash only), 428.1.a.1.b + 719.1 (Deathknell conferred by Equipment fires on death),
 * 719.5/435.4.b (top-most unit leaves the board → attachments detach at its last location), 149.3/435.4.a (loose gear at a
 * battlefield is recalled to base at the next Cleanup).
 *
 * Expected: (a) offered base | bf1 (never bf2); exhausted unless the [order] is paid. (b) P1 (owner) chooses; the token
 * ceases to exist (owner P1 / no zone); P1's deck stays N with T on top; NO Deathknell draw; Shears detached, unattached,
 * back in P1's base after cleanup — not in deck or trash. (c) killed → Deathknell resolves, P1 draws T; the token is not in
 * P1's trash (ceased to exist); Shears again unattached in P1's base, re-equippable.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUARDS = "sfd-154-221";
const SACRED_SHEARS = "sfd-172-221";
const KEEPERS_VERDICT = "unl-204-219";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt",
  timing: "action",
} as const;

/** P1's turn: 3 energy + 2 order (one for the ready rider, one for [Equip]); Shears in base; deck top = "topT"; P2 holds Verdict + Bolt. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, SACRED_SHEARS, "shears")
    .deck(P1, [{ cardType: "unit", might: 1, name: "Known Top" }], ["topT"])
    .hand(P1, GUARDS, "guards")
    .hand(P2, KEEPERS_VERDICT, "kv")
    .hand(P2, BOLT, "bolt");
}

const soldierOf = (game: Game): string => {
  const [id] = game.findAll({ name: "Sand Soldier", owner: P1 });
  if (!id) {
    throw new Error("no Sand Soldier was created");
  }
  return id;
};

/** Cast Guards!, put the token at bf1, answer the pay-[order] opt-in with `pay` if it is asked. Returns whether it was asked. */
async function guardsToBf1(game: Game, pay: boolean): Promise<boolean> {
  await game.p1.cast("guards");
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-bf1");
  let asked = false;
  const q = game.decision();
  if (q?.kind === "yes-no" && q.seat === P1) {
    asked = true;
    await (pay ? game.p1.yes() : game.p1.no());
  }
  await game.settle();
  return asked;
}

/** Guards! → bf1 (unpaid), then [Equip] the Shears to the Soldier; hand the turn to P2 and float Verdict's cost for P2. */
async function equippedSoldierOnP2Turn(): Promise<{ game: Game; soldier: string; deckN: number }> {
  const game = await board().build();
  await guardsToBf1(game, false);
  const soldier = soldierOf(game);
  await game.p1.choose("equipCard:-", { params: { equipmentId: "shears", unitId: soldier } });
  await game.settle();
  expect(game.state(soldier)).toMatchObject({ attachments: ["shears"], might: 3, zone: "battlefield-bf1" });
  expect(game.state("shears")).toMatchObject({ attachedTo: soldier, zone: "battlefield-bf1" });
  const deckN = game.p1.deck().length;
  expect(game.p1.deck()[0]).toBe("topT");
  await game.advanceTurn(); // → P2 (P2 draws; P1's deck is untouched)
  expect(game.turnPlayer()).toBe(P2);
  expect(game.p1.deck()).toHaveLength(deckN);
  await game.p2.do("addResources", { energy: 2, power: { rainbow: 2 } });
  return { deckN, game, soldier };
}

describe("(a) Guards! — where the Sand Soldier may be played and its ready state (184.1/184.2, 185.2.a/d)", () => {
  test("destination: P1's base or bf1 (controlled) are offered — never P2's bf2", async () => {
    const game = await board().build();
    await game.p1.cast("guards");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await expect(game.p1.pick("battlefield-bf2")).rejects.toThrow();
  });

  test("unpaid: the token lands at bf1 EXHAUSTED, owner P1 / controller P1 / exists, 2 Might; [order] untouched", async () => {
    const game = await board().build();
    await guardsToBf1(game, false);
    const soldier = soldierOf(game);
    expect(game.has(soldier)).toBe(true);
    expect(game.state(soldier)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 2, owner: P1, zone: "battlefield-bf1" });
    expect(game.p1.power("order")).toBe(2);
    expect(game.zoneOf("guards")).toBe("trash");
  });

  test("paid — after the token lands at a CHOSEN battlefield the 'pay [order] to ready it' opt-in must still be offered; yes → order 2→1 and the Soldier is READY (184.1)", async () => {
    // Expected: destination pick, THEN the pay-[order] yes/no; accepting readies the fresh token.
    // Actual: when a destination prompt intervenes the rider is dropped — no opt-in, token stays exhausted, pool untouched
    // (with no battlefield declared, i.e. no destination prompt, the opt-in IS asked — see sfd-154-221.test.ts).
    const game = await board().build();
    const asked = await guardsToBf1(game, true);
    expect(asked).toBe(true);
    const soldier = soldierOf(game);
    expect(game.state(soldier)).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
  });

  test("Equip Sacred Shears to the Soldier: attached at bf1, Soldier is 3 Might, second [order] spent", async () => {
    const game = await board().build();
    await guardsToBf1(game, false);
    const soldier = soldierOf(game);
    expect(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options).toEqual([soldier]);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "shears", unitId: soldier } });
    await game.settle();
    expect(game.state(soldier)).toMatchObject({ attachments: ["shears"], baseMight: 2, might: 3 });
    expect(game.state("shears")).toMatchObject({ attachedTo: soldier, zone: "battlefield-bf1" });
    expect(game.p1.power("order")).toBe(1);
  });
});

describe("(b) Keeper's Verdict on the equipped Sand Soldier — deck, not death", () => {
  test("the Soldier is the (only) legal Verdict target; on resolution its OWNER P1 — not caster P2 — is asked top/bottom (183)", async () => {
    const { game, soldier } = await equippedSoldierOnP2Turn();
    expect(game.p2.option("cast", "kv")?.fields.find((f) => f.name === "targets")?.options).toEqual([[soldier]]);
    await game.p2.cast("kv", { targets: soldier });
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["mainDeck-bottom", "mainDeck-top"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.zoneOf(soldier)).toBe("battlefield-bf1"); // nothing moves before the owner answers
  });

  test("'top': the token ceases to exist (186.1) — exists=false, owner still P1, no zone; P1's deck stays N with T on top; NO Deathknell draw (428.2.a)", async () => {
    const { deckN, game, soldier } = await equippedSoldierOnP2Turn();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("kv", { targets: soldier });
    await game.settle();
    await game.p1.answer("mainDeck-top");
    await game.settle();
    expect(game.has(soldier)).toBe(false);
    expect(game.zoneOf(soldier)).toBe("gone");
    expect(game.locationOf(soldier)).toBeUndefined();
    expect(game.p1.deck()).toHaveLength(deckN); // not N+1
    expect(game.p1.deck()[0]).toBe("topT"); // choosing "top" does not make the Soldier drawable
    expect(game.p1.deck()).not.toContain(soldier);
    expect(game.p1.hand()).toHaveLength(handBefore); // Deathknell did not fire
    expect(game.p1.trash()).not.toContain(soldier);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("kv")).toBe("trash");
    expect(game.violations()).toEqual([]);
    // …and P1's next draw is T.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toContain("topT");
  });

  test("Sacred Shears is not carried into the deck: it detaches (719.5/435.4.b) and, after cleanup, sits UNATTACHED in P1's base — owner/controller P1, not in deck or trash (149.3)", async () => {
    const { game, soldier } = await equippedSoldierOnP2Turn();
    await game.p2.cast("kv", { targets: soldier });
    await game.settle();
    await game.p1.answer("mainDeck-bottom");
    await game.settle();
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1, zone: "base" });
    expect(game.p1.deck()).not.toContain("shears");
    expect(game.p1.trash()).not.toContain("shears");
    expect(game.p1.gear()).toContain("shears");
  });
});

describe("(c) contrast — 3 damage kills the equipped Sand Soldier", () => {
  test("lethal damage is a kill: the Shears-conferred Deathknell fires and P1 draws T; the token is NOT in P1's trash (186.1); Shears back unattached in P1's base", async () => {
    const { deckN, game, soldier } = await equippedSoldierOnP2Turn();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: soldier });
    await game.settle();
    expect(game.has(soldier)).toBe(false);
    expect(game.zoneOf(soldier)).toBe("gone");
    expect(game.p1.trash()).not.toContain(soldier);
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // Deathknell — Draw 1
    expect(game.p1.hand()).toContain("topT");
    expect(game.p1.deck()).toHaveLength(deckN - 1);
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the recalled Shears are ready to be re-equipped on P1's next turn for another [order]", async () => {
    const withHeir = await board().unit(P1, "base", { might: 1, name: "Heir" }, "heir").build();
    await guardsToBf1(withHeir, false);
    const s2 = soldierOf(withHeir);
    await withHeir.p1.choose("equipCard:-", { params: { equipmentId: "shears", unitId: s2 } });
    await withHeir.settle();
    await withHeir.advanceTurn();
    await withHeir.p2.cast("bolt", { targets: s2 });
    await withHeir.settle();
    expect(withHeir.state("shears")).toMatchObject({ attachedTo: undefined, zone: "base" });
    await withHeir.advanceTurn();
    expect(withHeir.turnPlayer()).toBe(P1);
    await withHeir.p1.do("addResources", { power: { order: 1 } });
    await withHeir.p1.choose("equipCard:-", { params: { equipmentId: "shears", unitId: "heir" } });
    await withHeir.settle();
    expect(withHeir.state("heir")).toMatchObject({ attachments: ["shears"], might: 2 });
  });
});
