/**
 * Interaction: Shady Spectacles' copy is FIXED when it attaches — killing the model later changes nothing;
 * detaching ends it at once.
 *   Shady Spectacles (ven-137-166) · Gear · Order · [Equip] [1][order]
 *     "As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of that
 *      unit for as long as this is attached to it."
 *   × Ruined Rex (unl-067-219) · Unit · Mind · 6+[mind] · 6 Might · "[Deathknell] Deal 4 to an enemy unit."
 *   × Daring Poro (ogn-210-298) · Unit · Order · 2 · 2 Might · Poro · "[Assault]"
 *   (+ Vengeance ogn-229-298 "Kill a unit." and Angle Shot sfd-011-221 "…detach that Equipment… Draw 1." as probes)
 *
 * Question. P1's Daring Poro sits EXHAUSTED at bf1 with 1 damage and a +1 buff; Ruined Rex is in P1's base.
 * P1 pays [1][order] to Equip the Spectacles onto the Poro and chooses Rex as the model.
 *   (a) the equipped object's characteristics next to Rex's;
 *   (b) P2 resolves Vengeance on the REAL Rex — does the Poro stay "Ruined Rex"?
 *   (c) contrast: P2 Angle-Shots the Spectacles OFF the Poro — what is it now?
 *   (d) could P1 have chosen an ENEMY unit, or the Poro itself, as the model?
 *
 * Rules: 477.1.b / 477.1.b.1 / .1.a / .1.b (layer-1 copy of the PRINTED copyable traits; values updated when
 * the copy is made), 370.1.b.1 ("as" replacement timing), 704 (a buff is a counter — not a trait), 185.1.b
 * (a card stays a card), 808.1.d.2 / 808.1.d.3 (Deathknell noted before the unit leaves), 124 (zone change =
 * new object — irrelevant to an already-made copy), 435.1.c / 435.1.d (detach ends "as long as attached"),
 * 457.1 (loose equipment ends in base).
 *
 * Expected: (a) Poro = "Ruined Rex", unit, Mind, cost 6+[mind], base 6, Deathknell, NO Assault, no Poro tag;
 * keeps 1 damage, +1 buff (current 7), exhausted, at bf1, equipped, P1's, a card. Rex unchanged (6, base, clean).
 * (b) Rex → trash, its Deathknell deals 4 to an enemy; the Poro REMAINS Ruined Rex 6(+1)=7 with Deathknell.
 * (c) reverts to Daring Poro (Order, 2, base 2, Poro, Assault, no Deathknell), keeps buff (3), exhausted, bf1;
 * Spectacles loose in base. (d) NO and NO — only "another friendly unit" is offered.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

const SPECTACLES = "ven-137-166";
const RUINED_REX = "unl-067-219";
const DARING_PORO = "ogn-210-298";
const VENGEANCE = "ogn-229-298"; // 4 + [order][order] · Action · "Kill a unit."
const ANGLE_SHOT = "sfd-011-221"; // 2 · Reaction · attach-or-detach + draw 1

/**
 * P1's turn. bf1 is P1's, held by the Daring Poro (exhausted, 1 damage, buffed). P1's base: Ruined Rex, a vanilla
 * Buddy, loose Shady Spectacles; pool = exactly [1][order] for the Equip. P2: one 5-Might Brute in base (the only
 * enemy unit), Vengeance + Angle Shot in hand (paid for on P2's turn via addResources — pools empty at turn end).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DARING_PORO, "poro", { buffed: true, damage: 1, exhausted: true })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "base", { might: 5, name: "Enemy Brute" }, "brute")
    .gear(P1, SPECTACLES, "specs")
    .hand(P2, VENGEANCE, "vengeance")
    .hand(P2, ANGLE_SHOT, "angle");
}

/** Registry-side copyable traits the CardState does not surface (tags). */
function tagsOf(card: string): readonly string[] {
  return getGlobalCardRegistry().get(card)?.tags ?? [];
}

/** Equip the Spectacles onto the Poro; the ability resolves and asks for the model. */
async function equipOntoPoroAskModel(): Promise<Game> {
  const game = await board().build();
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

/** …and choose Ruined Rex as the model. */
async function poroCopiesRex(): Promise<Game> {
  const game = await equipOntoPoroAskModel();
  await game.p1.pick("rex");
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** …then pass the turn to P2 and refill P2's pool for its probe spell. */
async function p2Turn(): Promise<Game> {
  const game = await poroCopiesRex();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
  return game;
}

describe("(d) choosing the model — 'another FRIENDLY unit' only", () => {
  test("the model prompt offers exactly Rex and Buddy: never the enemy Brute, never the equipped Poro itself", async () => {
    const game = await equipOntoPoroAskModel();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["buddy", "rex"]);
    expect(offered).not.toContain("brute");
    expect(offered).not.toContain("poro");
  });

  test("naming the enemy Brute or the Poro itself is rejected", async () => {
    const game = await equipOntoPoroAskModel();
    expect((await game.p1.try((p) => p.pick("brute"))).ok).toBe(false);
    const self = await equipOntoPoroAskModel();
    expect((await self.p1.try((p) => p.pick("poro"))).ok).toBe(false);
    expect(self.state("poro").name).toBe("Daring Poro"); // nothing copied
  });

  test("the Equip cost [1][order] is paid and the Spectacles are attached to the Poro AT bf1 (434.4)", async () => {
    const game = await poroCopiesRex();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("specs")).toMatchObject({ attachedTo: "poro", location: "bf1" });
    expect(game.state("poro").attachments).toEqual(["specs"]);
  });
});

describe("(a) the equipped Poro's characteristics vs Rex's", () => {
  test("COPIED (layer 1, printed traits of Rex): name Ruined Rex, unit, domain Mind, cost 6 + [mind], base Might 6, [Deathknell] and NO [Assault], no Poro tag (477.1.b.1.a/.b)", async () => {
    const game = await poroCopiesRex();
    expect(game.state("poro")).toMatchObject({
      baseMight: 6,
      cardType: "unit",
      domains: ["mind"],
      energyCost: 6,
      name: "Ruined Rex",
      powerCost: ["mind"],
    });
    expect(game.state("poro").keywords).toContain("Deathknell");
    expect(game.state("poro").keywords).not.toContain("Assault");
    expect(tagsOf("poro")).not.toContain("Poro");
    expect(game.findAll({ name: "Ruined Rex" }).sort()).toEqual(["poro", "rex"]);
  });

  test("NOT copied (state, not traits): still 1 damage, still buffed (704) → current Might 6+1 = 7, still EXHAUSTED, still at bf1, IS equipped, controller/owner P1, still a card (185.1.b)", async () => {
    const game = await poroCopiesRex();
    expect(game.state("poro")).toMatchObject({
      attachments: ["specs"],
      controller: P1,
      damage: 1,
      isBuffed: true,
      isExhausted: true,
      isToken: false,
      location: "bf1",
      might: 7,
      owner: P1,
      zone: "battlefield-bf1",
    });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Rex itself is untouched: Ruined Rex, 6 Might, undamaged, unbuffed, ready, in base, not equipped", async () => {
    const game = await poroCopiesRex();
    expect(game.state("rex")).toMatchObject({
      attachments: [],
      baseMight: 6,
      damage: 0,
      isBuffed: false,
      isExhausted: false,
      location: "base",
      might: 6,
      name: "Ruined Rex",
    });
    expect(game.state("rex").keywords).toContain("Deathknell");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) P2 kills the REAL Rex with Vengeance — the copy does not track its model", () => {
  test("Vengeance resolves: Rex's own Deathknell (noted before it leaves, 808.1.d.2/.3) deals 4 to the enemy Brute; the Rex card is in P1's trash", async () => {
    const game = await p2Turn();
    await game.p2.cast("vengeance", { targets: "rex" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.acting().pick("brute");
      await game.settle();
    }
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.p1.trash()).toContain("rex");
    expect(game.state("brute").damage).toBe(4);
    expect(game.zoneOf("vengeance")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("the Poro REMAINS 'Ruined Rex': base 6, buffed → 7, [Deathknell], Mind, cost 6+[mind], still exhausted at bf1 with the Spectacles attached (477.1.b.1.b — values fixed when the copy was made; 124 irrelevant)", async () => {
    const game = await p2Turn();
    await game.p2.cast("vengeance", { targets: "rex" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.acting().pick("brute");
      await game.settle();
    }
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.state("poro")).toMatchObject({
      attachments: ["specs"],
      baseMight: 6,
      domains: ["mind"],
      energyCost: 6,
      isBuffed: true,
      isExhausted: true, // P2's Awaken readied only P2's permanents
      location: "bf1",
      might: 7,
      name: "Ruined Rex",
      powerCost: ["mind"],
    });
    // rule 317.2 — the 1 damage was healed in P1's Ending Step; the copy is unrelated to that
    expect(game.state("poro").damage).toBe(0);
    expect(game.state("poro").keywords).toContain("Deathknell");
    expect(game.state("poro").keywords).not.toContain("Assault");
    expect(tagsOf("poro")).not.toContain("Poro");
    expect(game.state("specs")).toMatchObject({ attachedTo: "poro", location: "bf1" });
    expect(game.findAll({ name: "Ruined Rex", zone: "bf1" })).toEqual(["poro"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — Angle Shot detaches the Spectacles: the copy ends immediately", () => {
  test("P2 may name P1's pair [Poro, Spectacles] ('same controller'); on resolution the Spectacles come off and sit loose in P1's base, P2 draws 1 (435.1.c/.d, 457.1)", async () => {
    const game = await p2Turn();
    const pairs = game.p2.option("cast", "angle")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toContainEqual(["poro", "specs"]);
    const hand = game.p2.hand().length;
    await game.p2.cast("angle", { targets: ["poro", "specs"] });
    await game.settle();
    expect(game.zoneOf("angle")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1);
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, location: "base", owner: P1 });
    expect(game.state("poro").attachments).toEqual([]);
  });

  test("the Poro is Daring Poro again — Order, cost 2, base 2, tag Poro, [Assault], no [Deathknell] — and STILL keeps its buff (current 3), its exhausted state and its bf1 location", async () => {
    const game = await p2Turn();
    await game.p2.cast("angle", { targets: ["poro", "specs"] });
    await game.settle();
    expect(game.state("poro")).toMatchObject({
      baseMight: 2,
      domains: ["order"],
      energyCost: 2,
      isBuffed: true,
      isExhausted: true,
      location: "bf1",
      might: 3,
      name: "Daring Poro",
      powerCost: [],
    });
    expect(game.state("poro").keywords).toContain("Assault");
    expect(game.state("poro").keywords).not.toContain("Deathknell");
    expect(tagsOf("poro")).toEqual(["Poro"]);
    expect(game.findAll({ name: "Ruined Rex" })).toEqual(["rex"]); // only the real one is left
    expect(game.state("rex")).toMatchObject({ location: "base", might: 6, name: "Ruined Rex" });
    expect(game.violations()).toEqual([]);
  });
});
