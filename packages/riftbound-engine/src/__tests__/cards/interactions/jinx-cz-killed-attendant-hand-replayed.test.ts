/**
 * Interaction: Jinx, Rebel (ogn-202-298) · Champion Unit (Jinx) · Chaos · 5 + [chaos] · 5 Might
 *     "When you discard one or more cards, ready me and give me +1 [Might] this turn."  — P1's Chosen Champion
 *     (legend: Loose Cannon, ogn-251-298)
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] · "Kill a unit."             — P2
 *   × Cemetery Attendant (ogn-165-298) · Unit · Chaos · 3 + [chaos] · 3 Might
 *     "When you play me, return a unit from your trash to your hand."                             — P1
 *
 * Rules: 108.3.b (the Chosen Champion starts in the Champion Zone), 108.3.c (it cannot be returned there by
 * normal means), 108.3.d / 419.1.a (played from the CZ as a normal play), 108.3.e (CZ is public), 103.2.a.3
 * (any same-named copy still counts as the Chosen Champion), 355.9.a / 355.10.a ("return a unit from your
 * trash" TARGETS a unit card in the public trash), 124 (zone change → new object), 705 (buffs/etc. stripped).
 *
 * Question — judge walk-through of the Chosen Champion's zone history:
 *   (a) before anything: P2's view of P1's CZ vs P1's hand; is "play Jinx" offered from the CZ with 5+[chaos],
 *       and is it offered on P2's turn?  (b) P1 plays Jinx CZ → base: CZ empty, no CZ action left.
 *   (c) P2's turn: Vengeance kills Jinx — trash or CZ?  (d) P1's turn: Cemetery Attendant — is Jinx a legal
 *       pick, is it a target, and does she land in hand or CZ?  (e) P1 replays Jinx: from where, for what, and
 *       does the CZ ever refill?
 * Expected: CZ → base → trash → hand → base; CZ empty at every checkpoint after (b) and never re-populated.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const JINX_REBEL = "ogn-202-298";
const LOOSE_CANNON = "ogn-251-298";
const VENGEANCE = "ogn-229-298";
const CEMETERY_ATTENDANT = "ogn-165-298";

/**
 * P1's turn 2, main, open. P1: legend Loose Cannon, Jinx, Rebel in the Champion Zone, exactly 5 energy +
 * 1 chaos, Cemetery Attendant in hand, a vanilla dead unit already in the trash (so the Attendant's pick is a
 * real two-option choice). P2: Vengeance in hand. One uncontrolled inert battlefield.
 */
function board() {
  return scenario()
    .legend(P1, LOOSE_CANNON, "cannon")
    .champion(P1, JINX_REBEL, "jinx")
    .resources(P1, { energy: 5, power: { chaos: 1 } })
    .hand(P1, CEMETERY_ATTENDANT, "attendant")
    .trash(P1, { might: 1, name: "Dead Recruit" }, "corpse")
    .hand(P2, VENGEANCE, "vengeance")
    .battlefield("bf1", { controller: null });
}

/** (b) P1 plays Jinx from the Champion Zone to base and everything settles. */
async function jinxPlayedFromCz(): Promise<Game> {
  const game = await board().build();
  await game.p1.playChampion("base");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  return game;
}

/** (c) …then P2's turn: P2 pays 4 + [order][order] and Vengeance kills Jinx. */
async function jinxKilledByVengeance(): Promise<Game> {
  const game = await jinxPlayedFromCz();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
  await game.p2.cast("vengeance", { targets: "jinx" });
  const s = await game.settle();
  expect(s.reason).toBe("open");
  return game;
}

/** (d) …then P1's turn: P1 plays Cemetery Attendant; its play trigger is now asking for a trash unit. */
async function attendantAsking(): Promise<Game> {
  const game = await jinxKilledByVengeance();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 3 + 5, power: { chaos: 1 + 1 } });
  await game.p1.play("attendant");
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  return game;
}

/** (d) …P1 picks Jinx; the trigger resolves. */
async function jinxReturnedToHand(): Promise<Game> {
  const game = await attendantAsking();
  await game.p1.pick("jinx");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  return game;
}

describe("(a) before anything is played — the Champion Zone is public, the hand is not; playing from the CZ is a normal play", () => {
  test("P2's player-view shows Jinx, Rebel by identity in P1's Champion Zone (108.3.e) while P1's hand card is redacted", async () => {
    const game = await board().build();
    const view = game.p2.view();
    const cz = (view.zones.championZone ?? []).filter((c) => c.owner === P1);
    expect(cz).toHaveLength(1);
    expect(isHiddenView(cz[0]!)).toBe(false);
    expect(cz[0]).toMatchObject({ defId: JINX_REBEL, id: "jinx", name: "Jinx, Rebel", zone: "championZone" });
    const p1Hand = (view.zones.hand ?? []).filter((c) => c.owner === P1);
    expect(p1Hand).toHaveLength(1);
    expect(isHiddenView(p1Hand[0]!)).toBe(true);
    // P1, of course, sees its own hand.
    expect(game.p1.hand()).toEqual(["attendant"]);
  });

  test("with exactly 5 energy + 1 chaos on P1's turn (Neutral Open) 'play from Champion Zone' IS offered to P1 (108.3.d / 419.1.a)", async () => {
    const game = await board().build();
    expect(game.p1.champion()).toBe("jinx");
    expect(game.p1.can("playChampion")).toBe(true);
    expect(game.p1.option("playChampion")?.fields).toEqual([
      expect.objectContaining({ name: "location", options: expect.arrayContaining(["base"]) }),
    ]);
  });

  test("…and is NOT offered when the cost is not payable (4 energy, or no chaos) — same legality as a hand play", async () => {
    const shortEnergy = await board().resources(P1, { energy: 4, power: { chaos: 1 } }).build();
    expect(shortEnergy.p1.can("playChampion")).toBe(false);
    const noChaos = await board().resources(P1, { energy: 5, power: { chaos: 0 } }).build();
    expect(noChaos.p1.can("playChampion")).toBe(false);
  });

  test("…and is NOT offered on P2's turn even with the resources (Jinx has no [Action]/[Reaction])", async () => {
    const game = await board().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 1 } });
    expect(game.p1.can("playChampion")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("playChampion");
  });
});

describe("(b) P1 plays Jinx from the Champion Zone", () => {
  test("she finalizes to P1's base EXHAUSTED for the full 5 + [chaos]; the CZ is now empty and no CZ play action remains", async () => {
    const game = await jinxPlayedFromCz();
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, might: 5, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.cardsAt("championZone", P1)).toEqual([]);
    expect(game.p1.can("playChampion")).toBe(false);
    expect(game.chain()).toEqual([]);
  });
});

describe("(c) P2's turn: Vengeance kills Jinx", () => {
  test("Vengeance offers Jinx as a target and, on resolution, Jinx goes to P1's TRASH — not back to the Champion Zone (108.3.c)", async () => {
    const game = await jinxPlayedFromCz();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    const field = game.p2.option("cast", "vengeance")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("jinx");
    await game.p2.cast("vengeance", { targets: "jinx" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vengeance", controller: P2 })]);
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("trash");
    expect(game.p1.trash()).toContain("jinx");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.cardsAt("championZone", P1)).toEqual([]);
    expect(game.zoneOf("vengeance")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("in the trash she is a fresh object: printed 5 Might, no damage, not exhausted-tracked (124)", async () => {
    const game = await jinxKilledByVengeance();
    expect(game.state("jinx")).toMatchObject({ baseMight: 5, damage: 0, isBuffed: false, might: 5, owner: P1, zone: "trash" });
  });
});

describe("(d) P1's turn: Cemetery Attendant returns a unit from the trash", () => {
  test("the play trigger TARGETS a unit card in P1's public trash (355.10.a): P1 is asked to choose, and Jinx (a champion unit) is a legal pick alongside the vanilla corpse", async () => {
    const game = await attendantAsking();
    expect(game.zoneOf("attendant")).toBe("base");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "attendant" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(new Set(offered)).toEqual(new Set(["jinx", "corpse"]));
    // Still nothing in the Champion Zone while the trigger waits.
    expect(game.p1.champion()).toBeUndefined();
  });

  test("picking Jinx moves her trash → P1's HAND (the instruction says hand; 108.3.c forbids a detour to the CZ); the corpse stays put", async () => {
    const game = await jinxReturnedToHand();
    expect(game.zoneOf("jinx")).toBe("hand");
    expect(game.p1.hand()).toContain("jinx");
    expect(game.p1.trash()).not.toContain("jinx");
    expect(game.p1.trash()).toContain("corpse");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.cardsAt("championZone", P1)).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("the returned Jinx is a new object (124): no damage, no buffs, no statuses, printed 5 Might", async () => {
    const game = await jinxReturnedToHand();
    expect(game.state("jinx")).toMatchObject({
      baseMight: 5,
      damage: 0,
      grantedKeywords: [],
      isBuffed: false,
      isStunned: false,
      might: 5,
      mightModifier: 0,
      zone: "hand",
    });
  });

  test("P2's view: Jinx is now hidden again — she is one of P1's redacted hand cards, and P1's CZ shows nothing", async () => {
    const game = await jinxReturnedToHand();
    const view = game.p2.view();
    const p1Hand = (view.zones.hand ?? []).filter((c) => c.owner === P1);
    expect(p1Hand.length).toBe(game.p1.hand().length);
    expect(p1Hand.every((c) => isHiddenView(c))).toBe(true);
    expect((view.zones.championZone ?? []).filter((c) => c.owner === P1)).toEqual([]);
  });
});

describe("(e) P1 plays Jinx again — from HAND, full cost, CZ never refills", () => {
  test("with 5 energy + 1 chaos left she is offered as an ordinary hand play (playUnit), NOT as playChampion", async () => {
    const game = await jinxReturnedToHand();
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 1 } });
    expect(game.p1.can("play", "jinx")).toBe(true);
    expect(game.p1.option("playUnit", "jinx")).toBeDefined();
    expect(game.p1.can("playChampion")).toBe(false);
  });

  test("she is NOT playable from hand with only 5 energy and no chaos (full 5 + [chaos] is due — no CZ discount or memory)", async () => {
    // Same sequence, but P1's second turn is granted one chaos fewer (only the Attendant's).
    const poorer = await board().build();
    await poorer.p1.playChampion("base");
    await poorer.settle();
    await poorer.advanceTurn();
    await poorer.p2.do("addResources", { energy: 4, power: { order: 2 } });
    await poorer.p2.cast("vengeance", { targets: "jinx" });
    await poorer.settle();
    await poorer.advanceTurn();
    await poorer.p1.do("addResources", { energy: 3 + 5, power: { chaos: 1 } });
    await poorer.p1.play("attendant");
    await poorer.settle();
    await poorer.p1.pick("jinx");
    await poorer.settle();
    expect(poorer.zoneOf("jinx")).toBe("hand");
    expect(poorer.p1.resources()).toEqual({ energy: 5, power: { chaos: 0 } });
    expect(poorer.p1.can("play", "jinx")).toBe(false);
  });

  test("playing her: hand → base, exhausted, pool drained to 0/0; the Champion Zone is STILL empty and playChampion is still absent", async () => {
    const game = await jinxReturnedToHand();
    await game.p1.play("jinx");
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx")).toMatchObject({ controller: P1, damage: 0, isBuffed: false, isExhausted: true, might: 5, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.cardsAt("championZone", P1)).toEqual([]);
    expect(game.p1.can("playChampion")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("full zone history asserted end to end: CZ → base → trash → hand → base, with the CZ empty at every checkpoint after (b)", async () => {
    const game = await board().build();
    const history: string[] = [game.zoneOf("jinx")];
    const czAt: (string | undefined)[] = [];

    await game.p1.playChampion("base");
    await game.settle();
    history.push(game.zoneOf("jinx"));
    czAt.push(game.p1.champion());

    await game.advanceTurn();
    czAt.push(game.p1.champion());
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    await game.p2.cast("vengeance", { targets: "jinx" });
    await game.settle();
    history.push(game.zoneOf("jinx"));
    czAt.push(game.p1.champion());

    await game.advanceTurn();
    czAt.push(game.p1.champion());
    await game.p1.do("addResources", { energy: 8, power: { chaos: 2 } });
    await game.p1.play("attendant");
    await game.settle();
    czAt.push(game.p1.champion());
    await game.p1.pick("jinx");
    await game.settle();
    history.push(game.zoneOf("jinx"));
    czAt.push(game.p1.champion());

    await game.p1.play("jinx");
    await game.settle();
    history.push(game.zoneOf("jinx"));
    czAt.push(game.p1.champion());

    expect(history).toEqual(["championZone", "base", "trash", "hand", "base"]);
    expect(czAt.every((c) => c === undefined)).toBe(true);
    // 103.2.a.3 — it is the same card by identity/name (still "Jinx, Rebel", P1's Chosen Champion by name),
    // but that status granted no automatic return at any point.
    expect(game.state("jinx")).toMatchObject({ defId: JINX_REBEL, name: "Jinx, Rebel", owner: P1 });
    expect(game.state("cannon")).toMatchObject({ zone: "legendZone" });
    expect(game.violations()).toEqual([]);
  });
});
