/**
 * Interaction: Faithful Manufactor (ogn-211-298) · Unit · Order · 3 · 2 Might
 *     "When you play me, play a 1 [Might] Recruit unit token here."                       — P1 plays it to bf1 (P1's)
 *   × Wraith of Echoes (ogn-118-298) · Unit · Mind · 6 + [mind] · 5 Might
 *     "The first time a friendly unit dies each turn, draw 1."                              — P1's, in base
 *   × Cemetery Attendant (ogn-165-298) · Unit · Chaos · 3 + [chaos] · 3 Might
 *     "When you play me, return a unit from your trash to your hand."                      — in P1's hand
 *   with P2's inline "Test Bolt" (0, [Action], deal 2 to a unit) as the killing effect.
 *
 * Question. P1 (Wraith in base) plays Faithful Manufactor to bf1, creating a 1-Might Recruit token there. P2 kills the
 * Recruit with a damage effect. Track the Recruit's (owner, controller, zone, exists) at creation and after cleanup.
 *   (a) Does Wraith of Echoes trigger off the TOKEN's death (P1 draws 1)?
 *   (b) Right afterwards P1 plays Cemetery Attendant with an otherwise unit-free trash — is the Recruit a legal /
 *       available choice? What is P1's trash count?
 *   (c) Contrast: the Faithful Manufactor itself (a card) is killed instead — does the Attendant find it?
 *
 * Rules: 182 / 183 (token controller + owner = controller of the creating effect), 185 (tokens are not cards; 185.2.d a
 * token unit is a unit — enters exhausted, dies to lethal damage), 186 / 186.1 (a token put into a non-board zone ceases
 * to exist immediately after moving there), 428.1 / 428.2 (board → trash IS a kill/death; placed directly in the trash),
 * 056.2 / 052 (do as much as you can — an instruction with no legal object does nothing).
 *
 * Expected: creation — owner P1, controller P1, at bf1, exists, exhausted, 1 Might, token. Kill — it dies (goes to P1's
 * trash) and then ceases to exist: (a) YES, Wraith triggers and P1 draws 1; afterwards the Recruit is "gone"
 * (game.has = false), P1's trash does not contain it, trash count unchanged. (b) the Attendant's trigger finds no unit —
 * the Recruit is never offered, nothing returns, P1's trash stays unit-free. (c) the Manufactor card sits in P1's trash
 * (Wraith also draws) and the Attendant returns it to hand.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAITHFUL_MANUFACTOR = "ogn-211-298";
const WRAITH_OF_ECHOES = "ogn-118-298";
const CEMETERY_ATTENDANT = "ogn-165-298";

/** P2's killing effect: 0-cost [Action] "deal 2 to a unit" (2 so the contrast can kill the 2-Might Manufactor too). */
const TEST_BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
} as const;

/**
 * P1's turn 2. P1: Wraith of Echoes in base, bf1 controlled, Faithful Manufactor + Cemetery Attendant in hand, 3 energy
 * for the Manufactor now (the Attendant is paid for on turn 4 via addResources — pools empty at end of turn). P2: Test
 * Bolt in hand, a 4-Might Guard holding bf2 (never involved). P1's trash starts EMPTY.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", WRAITH_OF_ECHOES, "wraith")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .hand(P1, FAITHFUL_MANUFACTOR, "fm")
    .hand(P1, CEMETERY_ATTENDANT, "ca")
    .hand(P2, TEST_BOLT, "bolt");
}

function recruitsAt(game: Game, loc: string): string[] {
  return game.cardsAt(loc).filter((id) => {
    const s = game.state(id);
    return s.cardType === "unit" && s.isToken && s.name === "Recruit";
  });
}

/** Turn 2: P1 plays the Manufactor to bf1; its trigger plays the Recruit there. Returns the Recruit's id. */
async function manufactorToBf1(game: Game): Promise<string> {
  await game.p1.play("fm", { to: "bf1" });
  await game.settle();
  expect(game.locationOf("fm")).toBe("bf1");
  const recruits = recruitsAt(game, "bf1");
  expect(recruits).toHaveLength(1);
  return recruits[0] as string;
}

/** …then P1 ends the turn; on P2's turn 3 P2 bolts `victim` (2 damage) and everything settles. */
async function p2Kills(game: Game, victim: string): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.cast("bolt", { targets: victim });
  await game.settle();
  expect(game.zoneOf("bolt")).toBe("trash");
}

/** …then back to P1's turn 4; refill exactly the Attendant's cost and play it to base, answering its prompt with `answer` if one appears. */
async function p1PlaysAttendant(game: Game, answer?: string): Promise<{ offered: string[] | undefined }> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 3, power: { chaos: 1 } });
  await game.p1.play("ca", { to: "base" });
  let offered: string[] | undefined;
  for (let i = 0; i < 6; i++) {
    const stop = await game.settle();
    const d = game.decision();
    if (stop.reason === "unanswered" && d?.kind === "pick" && d.seat === P1) {
      offered = d.options.map((o) => o.card ?? o.key);
      if (answer !== undefined && offered.includes(answer)) {
        await game.p1.pick(answer);
      } else {
        await game.p1.decline();
      }
      continue;
    }
    break;
  }
  return { offered };
}

describe("creation (182 / 183 / 185.2.d): the Recruit is P1-owned, P1-controlled, at bf1 ('here'), exists, exhausted, a 1-Might token unit", () => {
  test("after the Manufactor's play trigger resolves exactly one Recruit token stands at bf1 with those properties; P1's trash is empty", async () => {
    const game = await board().build();
    const recruit = await manufactorToBf1(game);
    expect(game.has(recruit)).toBe(true);
    expect(game.state(recruit)).toMatchObject({
      cardType: "unit",
      controller: P1,
      isExhausted: true,
      isToken: true,
      location: "bf1",
      might: 1,
      name: "Recruit",
      owner: P1,
      zone: "battlefield-bf1",
    });
    expect(game.p1.units("bf1").sort()).toEqual(["fm", recruit].sort());
    expect(game.p1.trash()).toEqual([]);
    expect(recruitsAt(game, "base")).toEqual([]);
  });
});

describe("(a) P2 kills the Recruit TOKEN: it is a death (428) → Wraith of Echoes triggers, P1 draws 1 — then the token ceases to exist (186.1)", () => {
  test("Test Bolt (2) on the 1-Might Recruit: P1's hand grows by exactly 1 on P2's turn (the Wraith draw); the Manufactor and Wraith are untouched", async () => {
    const game = await board().build();
    const recruit = await manufactorToBf1(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const p1Hand = game.p1.hand().length; // just the Attendant
    const p1Deck = game.p1.deck().length;
    await game.p2.cast("bolt", { targets: recruit });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p1.deck()).toHaveLength(p1Deck - 1);
    expect(game.state("fm")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.state("wraith")).toMatchObject({ damage: 0, location: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("after cleanup the Recruit no longer exists anywhere: has() = false, zone 'gone', not at bf1, NOT in P1's (or P2's) trash — P1's trash count is unchanged (0)", async () => {
    const game = await board().build();
    const recruit = await manufactorToBf1(game);
    await p2Kills(game, recruit);
    expect(game.has(recruit)).toBe(false);
    expect(game.zoneOf(recruit)).toBe("gone");
    expect(game.locationOf(recruit)).toBeUndefined();
    expect(recruitsAt(game, "bf1")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["fm"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual(["bolt"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'first time each turn' bookkeeping is per turn, not per token: the vanished token's death still used up THIS turn's Wraith draw — a second friendly death the same turn draws nothing", async () => {
    const game = await board().hand(P2, TEST_BOLT, "bolt2").unit(P1, "base", { might: 1, name: "Page" }, "page").build();
    const recruit = await manufactorToBf1(game);
    await game.advanceTurn();
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: recruit });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    await game.p2.cast("bolt2", { targets: "page" });
    await game.settle();
    expect(game.zoneOf("page")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
  });
});

describe("(b) Cemetery Attendant right afterwards: the Recruit is never a choice — nothing in P1's trash is a unit, the trigger does nothing (056.2)", () => {
  test("playing the Attendant (3 + [chaos]) with the token 'gone': no pick ever offers the Recruit; nothing returns to hand; the Attendant stays in base; P1's trash still holds no unit", async () => {
    const game = await board().build();
    const recruit = await manufactorToBf1(game);
    await p2Kills(game, recruit);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3, power: { chaos: 1 } });
    const handBefore = game.p1.hand().length; // Attendant + Wraith draw + turn-4 draw
    await game.p1.play("ca", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    let offered: string[] = [];
    for (let i = 0; i < 6; i++) {
      const stop = await game.settle();
      const d = game.decision();
      if (stop.reason === "unanswered" && d?.kind === "pick" && d.seat === P1) {
        offered = [...offered, ...d.options.map((o) => o.card ?? o.key)];
        await game.p1.decline();
        continue;
      }
      break;
    }
    expect(offered).not.toContain(recruit);
    expect(offered).toEqual([]); // no unit in P1's trash at all → nothing to offer
    expect(game.zoneOf("ca")).toBe("base");
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // the Attendant left; nothing came back
    expect(game.p1.trash().filter((id) => game.state(id).cardType === "unit")).toEqual([]);
    expect(game.has(recruit)).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'cards in your trash' style counts do not see it either (185 — not a card, and it no longer exists): P1's whole trash listing is empty after the kill", async () => {
    const game = await board().build();
    const recruit = await manufactorToBf1(game);
    await p2Kills(game, recruit);
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.cardsAt("trash", P1)).not.toContain(recruit);
    expect(game.findAll({ name: "Recruit" })).toEqual([]);
  });
});

describe("(c) contrast — the Faithful Manufactor CARD is killed instead: it sits in P1's trash and the Attendant returns it", () => {
  test("Test Bolt (2) on the 2-Might Manufactor: it dies → P1's trash = [fm]; Wraith draws 1 for it too; the Recruit token is still alive at bf1", async () => {
    const game = await board().build();
    const recruit = await manufactorToBf1(game);
    await game.advanceTurn();
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("bolt", { targets: "fm" });
    await game.settle();
    expect(game.zoneOf("fm")).toBe("trash");
    expect(game.p1.trash()).toEqual(["fm"]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.has(recruit)).toBe(true);
    expect(game.state(recruit)).toMatchObject({ controller: P1, location: "bf1", owner: P1 });
  });

  test("the Attendant's play trigger finds the Manufactor (a Main Deck card in P1's trash) and returns it to P1's hand", async () => {
    const game = await board().build();
    await manufactorToBf1(game);
    await p2Kills(game, "fm");
    expect(game.p1.trash()).toEqual(["fm"]);
    const { offered } = await p1PlaysAttendant(game, "fm");
    // The lone legal unit may be bound without asking (355.4); if a prompt appeared it offered exactly the Manufactor.
    if (offered !== undefined) {
      expect(offered).toEqual(["fm"]);
    }
    expect(game.zoneOf("ca")).toBe("base");
    expect(game.zoneOf("fm")).toBe("hand");
    expect(game.p1.hand()).toContain("fm");
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
