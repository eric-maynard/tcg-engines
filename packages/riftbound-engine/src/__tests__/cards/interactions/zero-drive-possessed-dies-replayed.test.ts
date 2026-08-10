/**
 * Interaction: Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."                — P1 resolved it earlier
 *   × The Zero Drive (sfd-090-221) · Equipment · Mind · 3 · +2 Might
 *     "[Equip] [1][mind]. [3][mind], Banish this: Play all units banished with this, ignoring their costs. (Use only if
 *      unattached.)"  Effect Text: "[Deathknell] — Banish me."                                  — P1's, Equipped to …
 *   × Vanguard Sergeant (ogn-219-298) · Unit · 4 · 4 Might (vanilla)                             — P2-OWNED, possessed by P1
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] · "Kill a unit."               — P2's hand
 *   (+ Cursed Sarcophagus unl-148-219 "When you play this, banish all units from your trash. [Exhaust]: Play a unit
 *      banished with this." in P1's hand, and P2's OWN loose Zero Drive, for the (d) no-sides.)
 *
 * Question. P1 Possessed P2's Sergeant (now in P1's base) and Equipped P1's Zero Drive to it (6). On P2's turn P2
 * Vengeances it. (a) Whose trash; does the Drive-granted Deathknell trigger, under whose control, and into whose
 * BANISHMENT does "banish me" put it? Where is the Drive, whose is it? (b) P1 later pays [3][mind] + banishes the Drive:
 * may it play a P2-owned card out of P2's banishment? Who controls/owns it on the board, in what state, and is P1's
 * control time-limited? (c) If that replayed Sergeant dies again — whose trash? (d) No-sides: would P1's Sarcophagus
 * ever pick the Sergeant up? Can P2 activate P1's Drive, or play the Sergeant off P2's own Drive?
 * (owner, controller, zone) after each step.
 *
 * Rules: 428.1.a.1.b / 808.1.d.2 / 808.1.d.3 (Deathknell pended before the kill completes, noting controller +
 * attributes), 428.2 / 056 / 056.1 / 056.2 / 108.6.a (killed → OWNER's trash; banished → OWNER's banishment — never
 * another player's non-board zone), 191.4.a / 191.4.b (ability controller = source's controller when it triggered;
 * 191.4.a.1 is for sources already off-board when they trigger), 395 / 397 / 427.3 / 427.3.a ("banished with THIS" =
 * this Drive's linked pool, wherever the card sits; other objects' pools are separate), 191.1 / 191.3 (the player who
 * plays a card controls it), 127.1 (ownership never changes), 124 / 124.1 (replayed = new object: printed 4, no
 * damage/equipment/possession), 143.4 (enters exhausted).
 *
 * Expected: (a) (P2, P1, P1.base) 6 → Vengeance: Deathknell pended under P1, Sergeant → P2's trash (P2, –, P2.trash),
 * Drive detached/unattached in P1's base, P1's; the P1-controlled trigger resolves "banish me" → P2's BANISHMENT
 * (P2, –, P2.banishment), recorded as banished-with P1's Drive. (b) YES: cost paid (Drive → P1's banishment), the
 * Sergeant is PLAYED by P1 from P2's banishment → (P2, P1, P1.base), printed 4 Might, exhausted, unequipped, undamaged;
 * P1's control comes from having played it — no expiry. (c) P2's trash again. (d) Sarcophagus banishes/plays only
 * P1's own trash (never saw the Sergeant); P2 has no activation of P1's Drive; P2's own Drive banished nothing → plays
 * nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const ZERO_DRIVE = "sfd-090-221";
const VANGUARD_SERGEANT = "ogn-219-298";
const VENGEANCE = "ogn-229-298";
const CURSED_SARCOPHAGUS = "unl-148-219";

type Triple = readonly [owner: Seat, controller: Seat, zone: string];
const triple = (game: Game, card: string): Triple => {
  const s = game.state(card);
  return [s.owner, s.controller, s.zone];
};

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn 2. bf1 (P2's): P2's Vanguard Sergeant (4) + P2's Buddy (2, keeps bf1 P2's). P1 base: Homebody (2), P1's
 * loose Zero Drive "zd". P2 base: P2's own loose Zero Drive "zdP2". P1 trash: a 2-cost Corpse (so the Sarcophagus has
 * something of P1's to banish). Hands: P1 Possession + Cursed Sarcophagus; P2 two Vengeances. P1 floats exactly
 * Possession (8 + [chaos]×3) + Equip ([1][mind]); later pools are added on the turn they are spent (317.2 empties them).
 */
function board() {
  return scenario()
    .victoryScore(15)
    .resources(P1, { energy: 9, power: { chaos: 3, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sarge")
    .unit(P2, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .gear(P1, ZERO_DRIVE, "zd")
    .gear(P2, ZERO_DRIVE, "zdP2")
    .trash(P1, { cardType: "unit", energyCost: 2, might: 2, name: "P1 Corpse" }, "corpse")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, CURSED_SARCOPHAGUS, "sarc")
    .hand(P2, VENGEANCE, "veng")
    .hand(P2, VENGEANCE, "veng2");
}

/** Premise: P1 resolves Possession on the Sergeant, then Equips the Zero Drive to it (both fully resolved). */
async function possessedAndEquipped(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "sarge" });
  expect((await game.settle()).reason).toBe("open");
  await game.p1.choose("equipCard:-", { params: { equipmentId: "zd", unitId: "sarge" } });
  expect((await game.settle()).reason).toBe("open");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 0 } });
  return game;
}

/**
 * (a) → P2's turn 3; P2 floats Vengeance's cost and casts it on the Sergeant. Walks the chain by hand (everyone passes)
 * recording the controller of any Sergeant-sourced triggered item and where the Sergeant was while it waited.
 */
async function vengeanced(): Promise<{ game: Game; deathknell: { controller: Seat; sargeZoneWhilePending: string }[] }> {
  const game = await possessedAndEquipped();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
  await game.p2.cast("veng", { targets: "sarge" });
  const deathknell: { controller: Seat; sargeZoneWhilePending: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      break;
    }
    for (const item of game.chain()) {
      if (item.cardId === "sarge" && item.triggered && !deathknell.some((k) => k.sargeZoneWhilePending === game.zoneOf("sarge") && k.controller === item.controller)) {
        deathknell.push({ controller: item.controller, sargeZoneWhilePending: game.zoneOf("sarge") });
      }
    }
    await game.seat(d.seat).pass();
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  return { deathknell, game };
}

/** (b) → P1's turn 4; P1 floats [3][mind] (+ spare) and activates the unattached Drive; everyone passes. */
async function driveReleased(): Promise<Game> {
  const { game } = await vengeanced();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 3, power: { mind: 1 } });
  expect(game.p1.can("activate", "zd")).toBe(true);
  await game.p1.activate("zd");
  expect((await game.settle()).reason).toBe("open");
  return game;
}

describe("premise: possessed Sergeant wearing P1's Zero Drive", () => {
  test("after Possession + Equip: Sergeant (owner P2, controller P1) in P1's base at 4 + 2 = 6 wearing zd; zd is P1's (owner = controller) attached to it — (P2, P1, base)", async () => {
    const game = await possessedAndEquipped();
    expect(triple(game, "sarge")).toEqual([P2, P1, "base"]);
    expect(game.state("sarge")).toMatchObject({ attachments: ["zd"], baseMight: 4, isReady: true, location: "base", might: 6 });
    expect(game.p1.units("base").sort()).toEqual(["home", "sarge"]);
    expect(game.p2.units()).toEqual(["buddy"]);
    expect(game.state("zd")).toMatchObject({ attachedTo: "sarge", controller: P1, owner: P1, zone: "base" });
    expect(game.zoneOf("poss")).toBe("trash");
  });
});

describe("(a) P2 Vengeances it: OWNER's trash, P1-controlled Deathknell, OWNER's banishment; Drive stays home with P1", () => {
  test("Vengeance ('a unit') offers the Sergeant sitting in P1's base (plus Homebody, Buddy); cast → P2 paid 4 + [order][order]", async () => {
    const game = await possessedAndEquipped();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    expect(targetsOffered(game, P2, "veng")).toEqual(["buddy", "home", "sarge"]);
    await game.p2.cast("veng", { targets: "sarge" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "veng", controller: P2, targets: ["sarge"] })]);
  });

  test("428.2 / 056.2 + 808.1.d.2 + 191.4.a: Vengeance resolves → the Sergeant is in its OWNER's (P2's) trash while its Drive-granted Deathknell waits on the chain CONTROLLED BY P1 (controller at the moment it died — not P2, the owner of the card now in P2's trash)", async () => {
    const { deathknell, game } = await vengeanced();
    expect(deathknell).toEqual([{ controller: P1, sargeZoneWhilePending: "trash" }]);
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["corpse", "poss"]); // the Sergeant never touched P1's trash
  });

  test("'Banish me' resolves under P1 but the card goes to its OWNER's banishment: (P2, –, P2.banishment) — P2's banishment holds the Sergeant, P1's is empty; off the board it reads printed 4, no attachments, control back to its owner", async () => {
    const { game } = await vengeanced();
    expect(game.zoneOf("sarge")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["sarge"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.trash()).toEqual(["veng"]);
    expect(triple(game, "sarge")).toEqual([P2, P2, "banishment"]);
    expect(game.state("sarge")).toMatchObject({ attachments: [], baseMight: 4, damage: 0, might: 4 });
  });

  test("the Zero Drive detached when its wearer left the board and sits UNATTACHED in P1's base, owner = controller = P1, never in any trash/banishment; it remembers the Sergeant as 'banished with this' (397 / 427.3) and its release ability is now usable by P1 only", async () => {
    const { game } = await vengeanced();
    expect(triple(game, "zd")).toEqual([P1, P1, "base"]);
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, location: "base" });
    expect(game.p1.gear()).toEqual(["zd"]);
    expect(game.state("zd").meta.exiledByThis).toEqual(["sarge"]);
    expect(game.state("zdP2").meta.exiledByThis ?? []).toEqual([]); // P2's own Drive banished nothing (427.3.a)
    expect(game.p2.can("activate", "zd")).toBe(false); // (d) P2 cannot use P1's Drive
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) P1 releases the Drive: the P2-owned Sergeant is played by P1 out of P2's banishment", () => {
  test("the cost is paid in full as the ability is activated: [3][mind] spent and the Drive itself BANISHED — into P1's banishment (its owner's) — before anything resolves; the ability is P1's chain item", async () => {
    const { game } = await vengeanced();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 3, power: { mind: 1 } });
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(triple(game, "zd")).toEqual([P1, P1, "banishment"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zd", controller: P1, triggered: false, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // 397 / 427.3: "Play all units banished with this" names the Drive's linked pool wherever those cards physically are;
  // 056 only decides WHICH banishment zone holds a P2-owned card, it does not shrink the pool. Engine: the play-from-
  // banishment step only searches the ACTIVATOR's own banishment (effects/play.ts getCardsInZone(pile, ctx.playerId)),
  // so the P2-owned Sergeant in P2's banishment is never found — the ability resolves, costs paid, and plays nothing.
  test("(b) 397/427.3 + 191.1/191.3 — the Drive's ability PLAYS the P2-owned Sergeant from P2's banishment: it enters P1's base under P1's control, still owned by P2 → (P2, P1, base); engine leaves it in P2's banishment", async () => {
    const game = await driveReleased();
    expect(game.zoneOf("sarge")).toBe("base");
    expect(triple(game, "sarge")).toEqual([P2, P1, "base"]);
    expect(game.p1.units("base").sort()).toEqual(["home", "sarge"]);
    expect(game.p2.banishment()).toEqual([]);
  });

  // Same root cause as above (nothing is played). 124/124.1 + 143.4 + 419.3: a card played from banishment is a NEW
  // object — printed 4 Might, no damage, no buff, no Equipment (the Drive is in banishment anyway), enters EXHAUSTED,
  // and nothing of the old "possessed" status remains: P1 controls it simply because P1 played it.
  test("(b) the replayed Sergeant arrives as a fresh object — 4 Might (no +2), 0 damage, EXHAUSTED, unequipped, controller P1 / owner P2 — while the Drive stays in P1's banishment with [3][mind] spent", async () => {
    const game = await driveReleased();
    expect(game.state("sarge")).toMatchObject({
      attachments: [],
      baseMight: 4,
      controller: P1,
      damage: 0,
      isBuffed: false,
      isExhausted: true,
      location: "base",
      might: 4,
      mightModifier: 0,
      owner: P2,
      zone: "base",
    });
    expect(triple(game, "zd")).toEqual([P1, P1, "banishment"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  // Same root cause. 191.1/191.3: control established by playing the card has no duration — unlike a "this turn"
  // control effect it does not lapse at any Ending Step.
  test("(b) P1's control of the replayed Sergeant is NOT time-limited — it is still (P2, P1, base) on P2's next turn and on P1's turn after that", async () => {
    const game = await driveReleased();
    expect(triple(game, "sarge")).toEqual([P2, P1, "base"]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(triple(game, "sarge")).toEqual([P2, P1, "base"]);
    expect(game.p2.units()).toEqual(["buddy"]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(triple(game, "sarge")).toEqual([P2, P1, "base"]);
    expect(game.state("sarge").isReady).toBe(true); // readied at P1's Awaken like any unit P1 controls
  });
});

describe("(c) the replayed Sergeant dies again → its OWNER's (P2's) trash once more", () => {
  // Depends on (b): the engine never replays the Sergeant, so P2's second Vengeance has no such target.
  test("(c) 428.2/056.2 — P2 Vengeances the replayed Sergeant on P2's turn: it goes to P2's trash (P2, –, P2.trash), never P1's; no Deathknell this time (no Drive attached) so nothing is banished", async () => {
    const game = await driveReleased();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    expect(targetsOffered(game, P2, "veng2")).toContain("sarge");
    await game.p2.cast("veng2", { targets: "sarge" });
    expect((await game.settle()).reason).toBe("open");
    expect(triple(game, "sarge")).toEqual([P2, P2, "trash"]);
    expect(game.p2.trash().sort()).toEqual(["sarge", "veng", "veng2"]);
    expect(game.p1.trash().sort()).toEqual(["corpse", "poss"]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });
});

describe("(d) no-sides: other objects' pools never contain the Sergeant", () => {
  test("P2's OWN Zero Drive did not banish it (427.3.a): P2 may activate it ([3][mind], banish it) but it plays NOTHING — the Sergeant stays in P2's banishment, P2 gains no unit", async () => {
    const { game } = await vengeanced();
    await game.p2.do("addResources", { energy: 3, power: { mind: 1 } });
    expect(game.p2.can("activate", "zdP2")).toBe(true);
    await game.p2.activate("zdP2");
    expect(triple(game, "zdP2")).toEqual([P2, P2, "banishment"]);
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("sarge")).toBe("banishment");
    expect(game.p2.banishment().sort()).toEqual(["sarge", "zdP2"]);
    expect(game.p2.units()).toEqual(["buddy"]);
    expect(game.p1.units()).toEqual(["home"]);
    expect(game.violations()).toEqual([]);
  });

  test("P1's Cursed Sarcophagus, played after all this, banishes 'all units from YOUR trash' = only P1's Corpse (the Sergeant was never in P1's trash), and its [Exhaust] offers exactly that Corpse — never the Sergeant, never anything the Drive banished", async () => {
    const { game } = await vengeanced();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 6, power: { chaos: 1 } }); // Sarcophagus 4 + [chaos], Corpse 2
    await game.p1.play("sarc");
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("sarc")).toBe("base");
    expect(game.p1.banishment()).toEqual(["corpse"]);
    expect(game.p2.banishment()).toEqual(["sarge"]);
    expect(game.state("sarc").meta.exiledByThis).toEqual(["corpse"]);
    await game.p1.activate("sarc");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["corpse"]);
    await game.p1.pick("corpse");
    expect((await game.settle()).reason).toBe("open");
    expect(triple(game, "corpse")).toEqual([P1, P1, "base"]);
    expect(game.zoneOf("sarge")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
