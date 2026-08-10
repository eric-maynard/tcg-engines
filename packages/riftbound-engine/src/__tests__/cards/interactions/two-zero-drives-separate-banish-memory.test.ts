/**
 * Interaction: The Zero Drive (sfd-090-221) ×2 × Vengeance (ogn-229-298) × Viktor, Leader (ogn-246-298)
 *
 *   The Zero Drive — Equipment · Mind · 3 · +2 Might
 *     "[Equip] [1][mind]. [3][mind], Banish this: Play all units banished with this, ignoring their costs. (Use only
 *      if unattached.)"   Effect Text: "[Deathknell] — Banish me."
 *   Vengeance — Spell · Order · 4 + [order][order] · "Kill a unit."
 *   Viktor, Leader — Champion Unit · Order · 4 · "When another non-Recruit unit you control dies, play a 1 [Might]
 *     Recruit unit token into your base."   (the death witness)
 *   (+ attribution witnesses in one variant: Immortal Phoenix ogn-037-298 "When you kill a unit with a spell, you may
 *    pay [1][fury] to play me from your trash." and Solari Shrine ogn-072-298 "When you kill a stunned enemy unit, you
 *    may exhaust this to draw 1.")
 *
 * Rules: 428.1.a.1.b / 808.1.d.2 (a unit with a Deathknell that is killed by a Kill INSTRUCTION or by a Cleanup has the
 * trigger pended BEFORE it moves), 428.1.a.2 (passive kill = lethal damage), 428.2 (killed = board → trash directly),
 * 428.5.b (the spell with the kill instruction — and its controller — is responsible), 428.5.c.2 / 417.6.c (combat
 * cleanup kills are attributed to the opposing combatants and their controller), 427.2 / 427.2.a (Banish is its own
 * action, not a Kill), 427.3 / 427.3.a (cards refer to cards banished by the SAME object; separate instances of a
 * same-named object keep separate references), 393 / 397 (Linked Abilities — 397's example IS The Zero Drive),
 * 390.5.c.1 (the linked follow-up finds the object in the zone it was moved to), 435.4.a / 457.1 (Equipment left
 * loose at a battlefield is recalled to base at the next Cleanup).
 *
 * Question: P1 has Viktor, Leader in base, Drive#1 on unit A (3 Might with the Drive) at bfX, Drive#2 on unit B (3) at
 * bfY. (1) P2 resolves Vengeance on A. (2) B dies to combat damage when P2's 5-Might Bruiser attacks bfY. (3) On P1's
 * next turn P1 pays [3][mind] + banishes Drive#2. For A and B: a death (Viktor Recruit)? who killed it? Deathknell
 * collected even for the kill-instruction death? Does A pass through the trash? Does Drive#2 play only B or also A?
 * Is banishing Drive#2 as a cost a kill? What does Drive#1 then play?
 *
 * Expected: (1) Deathknell pended, A board→trash (real death: Viktor Recruit #1; killer = P2 via a spell), Drive#1 falls
 * off and is recalled to P1's base; the Deathknell then banishes A from the trash — A is "banished with" Drive#1.
 * (2) B takes 5 ≥ 3 → killed in the Combat Cleanup (killer = P2 via combat), Deathknell pended the same way → Viktor
 * Recruit #2 → B banished, linked to Drive#2; Drive#2 recalled to base; Bruiser survives on 3, P2 conquers bfY.
 * (3) "Banish this" is a cost, not a kill; the effect plays ONLY B (free, base, exhausted); A stays banished. Drive#1
 * activated the same way plays ONLY A. Neither activation cross-wires to the other copy's unit.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const VENGEANCE = "ogn-229-298";
const VIKTOR = "ogn-246-298";
const PHOENIX = "ogn-037-298";
const SHRINE = "ogn-072-298";

/** 1-Might printed bodies: with the Drive's +2 each wearer is the question's "3-Might unit". */
const A_DEF = { cardType: "unit", energyCost: 3, might: 1, name: "Wearer A" } as const;
const B_DEF = { cardType: "unit", energyCost: 2, might: 1, name: "Wearer B" } as const;

/**
 * P2's turn 2 (Vengeance has no timing keyword, and P2 is the attacker). P1: Viktor in base; A+Drive#1 at bfx and
 * B+Drive#2 at bfy, both battlefields P1's. P2: the 5-Might Bruiser in base, Vengeance in hand, 4+[order][order] to
 * pay for it. `witnesses` adds the kill-attribution probes: an Immortal Phoenix in EACH trash (spell kills), P2's Solari
 * Shrine + a stunned B (combat kills of a stunned enemy), and 1 energy + [fury] spare so P2 could accept the Phoenix.
 */
function board(opts: { witnesses?: boolean } = {}) {
  const s = scenario()
    .active(P2)
    .resources(P2, opts.witnesses ? { energy: 5, power: { fury: 1, order: 2 } } : { energy: 4, power: { order: 2 } })
    .battlefield("bfx", { controller: P1 })
    .battlefield("bfy", { controller: P1 })
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "bfx", A_DEF, "a", { equippedWith: ["zd1"] })
    .card("zd1", { def: ZERO_DRIVE, meta: { attachedTo: "a" }, owner: P1, zone: "bfx" })
    .unit(P1, "bfy", B_DEF, "b", { equippedWith: ["zd2"], stunned: opts.witnesses === true })
    .card("zd2", { def: ZERO_DRIVE, meta: { attachedTo: "b" }, owner: P1, zone: "bfy" })
    .unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P2, VENGEANCE, "veng");
  if (opts.witnesses) {
    s.trash(P1, PHOENIX, "p1phoenix").trash(P2, PHOENIX, "p2phoenix").gear(P2, SHRINE, "shrine");
  }
  return s;
}

const recruitsOf = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.locationOf(id) !== undefined);

/** Step 1: P2 casts Vengeance on A and everything (spell, Deathknell, Viktor) resolves back to P2's open main phase. */
async function step1(game: Game): Promise<void> {
  await game.p2.cast("veng", { targets: "a" });
  const r = await game.settle();
  expect(r.reason).toBe("open");
}

/** Step 2: the Bruiser attacks bfy; both pass focus; combat, its Cleanup and the resulting triggers all resolve. */
async function step2(game: Game): Promise<void> {
  await game.p2.move("bruiser", "bfy");
  const r = await game.settle();
  expect(r.reason).toBe("open");
}

/** Step 3 set-up: over to P1's turn 3 with [3][mind] ×2 in the pool (enough for both Drives). */
async function toP1Turn(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 6, power: { mind: 2 } });
}

async function afterSteps1and2(): Promise<Game> {
  const game = await board().build();
  await step1(game);
  await step2(game);
  return game;
}

describe("Two Zero Drives — each remembers only the unit banished with IT", () => {
  test("set-up sanity: A and B are 3 Might each (1 printed + the Drive's 2), each Drive attached at its wearer's battlefield; no '[3][mind], Banish this' offered while attached", async () => {
    const game = await board().build();
    expect(game.state("a")).toMatchObject({ attachments: ["zd1"], might: 3, zone: "battlefield-bfx" });
    expect(game.state("b")).toMatchObject({ attachments: ["zd2"], might: 3, zone: "battlefield-bfy" });
    expect(game.state("zd1")).toMatchObject({ attachedTo: "a", zone: "battlefield-bfx" });
    expect(game.state("zd2")).toMatchObject({ attachedTo: "b", zone: "battlefield-bfy" });
    expect(game.p1.can("activate", "zd1")).toBe(false);
    expect(game.p1.can("activate", "zd2")).toBe(false);
  });

  // ── (1) Vengeance on A: kill instruction ──────────────────────────────────────────────────────────

  test("(1) when Vengeance resolves A goes board → TRASH first (428.2) with its Drive-granted Deathknell AND Viktor's trigger pending as P1's simultaneous triggers (808.1.d.2); Drive#1 has already fallen off", async () => {
    const game = await board().build();
    await game.p2.cast("veng", { targets: "a" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "veng", controller: P2, targets: ["a"] })]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Vengeance resolves
    expect(game.zoneOf("veng")).toBe("trash");
    expect(game.zoneOf("a")).toBe("trash"); // passes THROUGH the trash — not straight to banishment
    expect(game.state("zd1").attachedTo).toBeUndefined();
    expect(game.state("a").attachments).toEqual([]);
    // Both P1 triggers were collected by the kill instruction; P1 is offered their relative order (soft offer).
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    await game.acceptTriggerOrder();
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "a", controller: P1, triggered: true }), // the Deathknell lives on the wearer
        expect.objectContaining({ cardId: "viktor", controller: P1, triggered: true }),
      ]),
    );
    expect(recruitsOf(game)).toEqual([]); // nothing has resolved yet
  });

  test("(1) fully resolved: A is in P1's BANISHMENT (Deathknell found it in the trash, 390.5.c.1), Viktor made Recruit #1 in base (a real death), Drive#1 sits unattached in P1's base (435.4.a / 457.1 recall; not activatable yet — it is P2's turn)", async () => {
    const game = await board().build();
    await step1(game);
    expect(game.zoneOf("a")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]); // A did not stay there; Vengeance is P2's card
    expect(game.p2.trash()).toEqual(["veng"]);
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 1, zone: "base" });
    expect(game.state("zd1")).toMatchObject({ attachedTo: undefined, controller: P1, zone: "base" });
    expect(game.p1.gear()).toEqual(["zd1"]);
    expect(game.p1.can("activate", "zd1")).toBe(false); // activated abilities: controller's own turn only
    // B / Drive#2 untouched.
    expect(game.state("b")).toMatchObject({ attachments: ["zd2"], might: 3, zone: "battlefield-bfy" });
    expect(game.violations()).toEqual([]);
  });

  test("(1) attribution: the kill is P2's, by a SPELL (428.5.b) — P2's Immortal Phoenix ('when YOU kill a unit with a spell') asks P2, P1's identical Phoenix stays silent", async () => {
    const game = await board({ witnesses: true }).build();
    await game.p2.cast("veng", { targets: "a" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("p2phoenix");
    await game.p2.no();
    // What remains are only P1's two triggers — no P1 Phoenix prompt ever appears.
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("p1phoenix")).toBe("trash");
    expect(game.zoneOf("p2phoenix")).toBe("trash");
    expect(game.zoneOf("a")).toBe("banishment");
  });

  // ── (2) B dies in combat: passive kill via the Combat Cleanup ─────────────────────────────────────

  test("(2) Bruiser (5) attacks bfy: B (3) takes lethal combat damage → killed in the Combat Cleanup; its Deathknell was pended too (808.1.d.2 covers Cleanups) → B ends in BANISHMENT, Viktor makes Recruit #2, Drive#2 recalled to base; Bruiser survives (3 < 5, healed) and P2 conquers bfy", async () => {
    const game = await board().build();
    await step1(game);
    await step2(game);
    expect(game.zoneOf("b")).toBe("banishment");
    expect(game.p1.banishment().sort()).toEqual(["a", "b"]);
    expect(game.p1.trash()).toEqual([]);
    expect(recruitsOf(game)).toHaveLength(2);
    expect(game.state("zd2")).toMatchObject({ attachedTo: undefined, controller: P1, zone: "base" });
    expect(game.p1.gear().sort()).toEqual(["zd1", "zd2"]);
    expect(game.state("bruiser")).toMatchObject({ damage: 0, zone: "battlefield-bfy" });
    expect(game.gameState.battlefields.bfy?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(2) attribution: the combat kill is P2's, by COMBAT (428.5.c.2 / 417.6.c) — with B stunned, P2's Solari Shrine ('when YOU kill a stunned enemy unit') asks P2; P2's Immortal Phoenix (spell kills only) does NOT", async () => {
    const game = await board({ witnesses: true }).build();
    // step 1 with the Phoenix declined
    await game.p2.cast("veng", { targets: "a" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.no();
    await game.settle();
    // step 2
    await game.p2.move("bruiser", "bfy");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("shrine");
    const hand0 = game.p2.hand().length;
    await game.p2.yes();
    const r2 = await game.settle();
    expect(r2.reason).toBe("open"); // no Phoenix prompt followed — a combat kill is not "with a spell"
    expect(game.p2.hand()).toHaveLength(hand0 + 1);
    expect(game.state("shrine").isExhausted).toBe(true);
    expect(game.zoneOf("p2phoenix")).toBe("trash");
    expect(game.zoneOf("b")).toBe("banishment");
    expect(recruitsOf(game)).toHaveLength(2); // both deaths counted for Viktor all the same
  });

  // ── (3) P1's next turn: releasing the Drives ──────────────────────────────────────────────────────

  test("(3) on P1's turn both loose Drives offer '[3][mind], Banish this'; activating Drive#2 pays 3+[mind] and BANISHES Drive#2 as a cost — not a kill: no Viktor Recruit, nothing goes to the trash, only the ability sits on the chain", async () => {
    const game = await afterSteps1and2();
    await toP1Turn(game);
    expect(game.p1.can("activate", "zd1")).toBe(true);
    expect(game.p1.can("activate", "zd2")).toBe(true);
    const recruitsBefore = recruitsOf(game).length;
    await game.p1.activate("zd2");
    expect(game.zoneOf("zd2")).toBe("banishment");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zd2", controller: P1, triggered: false })]);
    expect(game.p1.trash()).toEqual([]);
    expect(recruitsOf(game)).toHaveLength(recruitsBefore);
    expect(game.zoneOf("b")).toBe("banishment"); // nothing is played before resolution
  });

  test("(3) Drive#2 resolves: it plays ONLY B — free, into P1's base, exhausted, at its printed 1 Might — while A (banished by Drive#1's Deathknell) stays in banishment (397 / 427.3.a)", async () => {
    const game = await afterSteps1and2();
    await toP1Turn(game);
    await game.p1.activate("zd2");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ attachments: [], controller: P1, isExhausted: true, might: 1 });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } }); // B's 2 was never charged
    expect(game.zoneOf("a")).toBe("banishment");
    expect(game.p1.banishment().sort()).toEqual(["a", "zd2"]);
    expect(game.violations()).toEqual([]);
  });

  test("(3) …then Drive#1 the same way plays ONLY A (free, base, exhausted); B is not touched again; both Drives end in banishment and P1 is at exactly 0", async () => {
    const game = await afterSteps1and2();
    await toP1Turn(game);
    await game.p1.activate("zd2");
    await game.settle();
    await game.p1.activate("zd1");
    expect(game.zoneOf("zd1")).toBe("banishment");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("a")).toBe("base");
    expect(game.state("a")).toMatchObject({ attachments: [], controller: P1, isExhausted: true, might: 1 });
    expect(game.state("b")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.banishment().sort()).toEqual(["zd1", "zd2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p1.units("base").sort()).toEqual(["a", "b", ...recruitsOf(game), "viktor"].sort());
    expect(game.violations()).toEqual([]);
  });

  test("(3) the other order: Drive#1 first plays ONLY A (B stays banished), then Drive#2 plays ONLY B — no cross-wiring in either direction", async () => {
    const game = await afterSteps1and2();
    await toP1Turn(game);
    await game.p1.activate("zd1");
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("b")).toBe("banishment");
    await game.p1.activate("zd2");
    await game.settle();
    expect(game.zoneOf("b")).toBe("base");
    expect(game.p1.banishment().sort()).toEqual(["zd1", "zd2"]);
  });

  test("(3) a Drive whose wearer never died remembers nobody: if only step 1 happened, Drive#1 plays A while Drive#2 (still worn by B) is not even activatable", async () => {
    const game = await board().build();
    await step1(game);
    await toP1Turn(game);
    expect(game.p1.can("activate", "zd2")).toBe(false); // "Use only if unattached"
    await game.p1.activate("zd1");
    const r = await game.settle();
    // P1 still holds bfy here, so the free play asks base-or-bfy (a play, 419.3): choose base.
    if (r.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("a")).toBe("base");
    expect(game.state("b")).toMatchObject({ attachments: ["zd2"], might: 3, zone: "battlefield-bfy" });
  });
});
