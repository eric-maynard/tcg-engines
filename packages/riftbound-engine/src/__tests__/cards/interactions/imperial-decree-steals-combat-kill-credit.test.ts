/**
 * Interaction: who gets credit for a kill — the combat-damage source or the Decree that finished the job?
 *
 *   × Imperial Decree (ogn-221-298) · Spell · Order · 5 + [order][order] · Action
 *       "When any unit takes damage this turn, kill it."                                    — in P1's hand
 *   × Solari Shrine   (ogn-072-298) · Gear · Calm · 3
 *       "When you kill a stunned enemy unit, you may exhaust this to draw 1."               — P2's, in base
 *   × Rune Prison     (ogn-050-298) · Spell · Calm · 2 + [calm] · Action "Stun a unit."      — in P2's hand
 *   (+ Immortal Phoenix ogn-037-298 "When you kill a unit with a spell, you may pay [1][fury] to play me from
 *      your trash." as the probe for 'P1 killed a unit with a spell')
 *
 * Rules: 428.1.a.1 ("kill it" is a Kill instruction), 428.5.b (the ability containing the kill instruction is
 * responsible), 428.5.d (an ability is attributed in addition to the object that created it → the Decree
 * SPELL is attributed too), 428.5.c.2 / 417.6.c (only Combat-Cleanup deaths are attributed to the combat-damage
 * source), 428.2 (killed → owner's trash), 808.1.d.2, 423.1.b (a stunned unit deals no combat damage).
 *
 * Question. P2's turn. P2 controls Solari Shrine, Rune Prisons P1's 5-Might defender D at P1's bf1, then attacks
 * with a single attacker A. In the showdown P1 casts Imperial Decree.
 *  4-Might A: 4 < 5 is not lethal → the Cleanup kills nothing; D took damage → Decree's delayed trigger kills D.
 *    Responsible: Decree's ability + the Decree spell, controller P1. A / P2 are NOT attributed → P2's Shrine does
 *    NOT trigger. D → P1's trash; A survives (D dealt 0) and P2 conquers bf1. Because a P1 spell is attributed,
 *    an Immortal Phoenix in P1's trash WOULD trigger ("you kill a unit with a spell").
 *  5-Might A (contrast): 5 ≥ 5 lethal → D dies in the Combat Cleanup, killedBy = A / P2 → Shrine triggers (D was
 *    stunned + enemy): P2 may exhaust it and draw 1. Decree's trigger still fires (D took damage) but finds D gone
 *    and does nothing; the Phoenix does NOT trigger (P1 killed nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const SOLARI_SHRINE = "ogn-072-298";
const RUNE_PRISON = "ogn-050-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * P2's turn (turn 3). P1 holds bf1 with vanilla 5-Might D and has Decree + exactly 5 + [order][order]
 * (+ [1][fury] more when the Phoenix probe is in the trash). P2: Solari Shrine in base, Rune Prison in hand
 * with 2 + [calm], attacker A of `attackerMight` in base, two known cards on top of the deck.
 */
function board(attackerMight: 4 | 5, opts: { phoenix?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 5 + (opts.phoenix ? 1 : 0), power: { order: 2, ...(opts.phoenix ? { fury: 1 } : {}) } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Defender D" }, "d")
    .unit(P2, "base", { might: attackerMight, name: "Attacker A" }, "a")
    .gear(P2, SOLARI_SHRINE, "shrine")
    .hand(P2, RUNE_PRISON, "prison")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["p2d1", "p2d2"]);
  if (opts.phoenix) {
    s.trash(P1, IMMORTAL_PHOENIX, "phoenix");
  }
  return s;
}

/** P2 Rune Prisons D and lets it resolve. */
async function stunD(game: Game): Promise<void> {
  await game.p2.cast("prison", { targets: "d" });
  await game.settle();
  expect(game.state("d").isStunned).toBe(true);
  expect(game.zoneOf("prison")).toBe("trash");
}

/** A attacks bf1; P2 (attacker, Focus first) passes; P1 casts Decree; everybody passes priority until it has resolved. */
async function attackAndDecree(game: Game): Promise<void> {
  await game.p2.move("a", "bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("decree");
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.zoneOf("d")).toBe("battlefield-bf1"); // nothing has taken damage yet
}

type Offers = { shrine: boolean; phoenix: boolean };

/**
 * Drive to the open main phase. Records whether P2 was offered the Shrine (accepting it) and whether P1 was
 * offered the Phoenix (accepting it, answering a destination prompt with base if asked).
 */
async function finish(game: Game): Promise<Offers> {
  const seen: Offers = { phoenix: false, shrine: false };
  for (let i = 0; i < 20; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P2 && d.source?.cardId === "shrine") {
      seen.shrine = true;
      await game.p2.yes();
    } else if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "phoenix") {
      seen.phoenix = true;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick(d.options.find((o) => o.key.includes("base"))?.key ?? d.options[0]!.key);
    } else {
      break;
    }
  }
  return seen;
}

describe("setup: Rune Prison really stuns D; the lone attacker opens a combat showdown; Decree is cast by the NON-turn player in the showdown", () => {
  test("Rune Prison (2 + [calm]) targets D at P1's battlefield and stuns it; P2's pool is empty afterwards", async () => {
    const game = await board(4).build();
    await stunD(game);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("d")).toMatchObject({ isStunned: true, might: 5, zone: "battlefield-bf1" });
  });

  test("P1 may cast the Action-speed Decree while holding Focus on P2's turn; it resolves to the trash for 5 + [order][order] and D is still alive and undamaged", async () => {
    const game = await board(4).build();
    await stunD(game);
    await attackAndDecree(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("d").damage).toBe(0);
    expect(game.chain()).toEqual([]);
  });
});

describe("4-Might attacker: non-lethal combat damage, the Decree trigger kills D → credit goes to P1 (Decree), not P2", () => {
  test("after combat damage: D took 4 (< 5) and is STILL on bf1; A took 0 from the stunned D; exactly one Decree trigger (P1's) is on the chain", async () => {
    const game = await board(4).build();
    await stunD(game);
    await attackAndDecree(game);
    await game.p2.passFocus();
    await game.p1.passFocus(); // both pass Focus → combat damage step
    expect(game.zoneOf("d")).toBe("battlefield-bf1"); // survived the Combat Cleanup
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.state("a").damage).toBe(0); // 423.1.b
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P1, triggered: true })]);
  });

  test("the trigger resolves: D goes board → P1's trash (428.2); P2's Solari Shrine is NEVER offered, stays ready, P2 draws nothing (428.5.b/.d vs 428.5.c.2)", async () => {
    const game = await board(4).build();
    await stunD(game);
    await attackAndDecree(game);
    const seen = await finish(game);
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["d", "decree"]));
    expect(seen.shrine).toBe(false);
    expect(game.state("shrine").isExhausted).toBe(false);
    expect(game.p2.hand()).toEqual([]);
  });

  test("A survives with no defender left → P2 conquers bf1 and scores 1; back to P2's open main phase with no violations", async () => {
    const game = await board(4).build();
    await stunD(game);
    await attackAndDecree(game);
    await finish(game);
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("P1 'killed a unit with a spell' (428.5.d: the Decree spell is attributed) → an Immortal Phoenix in P1's trash IS offered; paying [1][fury] plays it", async () => {
    const game = await board(4, { phoenix: true }).build();
    await stunD(game);
    await attackAndDecree(game);
    const seen = await finish(game);
    expect(game.zoneOf("d")).toBe("trash");
    expect(seen.phoenix).toBe(true);
    expect(seen.shrine).toBe(false);
    expect(game.zoneOf("phoenix")).not.toBe("trash");
    expect(game.locationOf("phoenix")).toBeDefined();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
  });
});

describe("5-Might attacker (contrast): lethal combat damage kills D in the Combat Cleanup → credit goes to A / P2", () => {
  test("after combat damage D is ALREADY in the trash (Cleanup death) while the Decree trigger — D did take damage — still waits on the chain", async () => {
    const game = await board(5).build();
    await stunD(game);
    await attackAndDecree(game);
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("d")).toBe("trash");
    const decreeItems = game.chain().filter((c) => c.cardId === "decree");
    expect(decreeItems).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
  });

  test("P2 killed a STUNNED ENEMY unit → Solari Shrine IS offered; P2 accepts: Shrine exhausted, P2 draws exactly 1", async () => {
    const game = await board(5).build();
    await stunD(game);
    await attackAndDecree(game);
    const seen = await finish(game);
    expect(seen.shrine).toBe(true);
    expect(game.state("shrine").isExhausted).toBe(true);
    expect(game.p2.hand()).toEqual(["p2d1"]);
    expect(game.zoneOf("d")).toBe("trash");
  });

  test("the Decree trigger resolves against a D that is already gone and does nothing more; A conquers bf1 for P2; chain empty, no violations", async () => {
    const game = await board(5).build();
    await stunD(game);
    await attackAndDecree(game);
    await finish(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.state("a").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["d", "decree"]));
    expect(game.violations()).toEqual([]);
  });

  test("P1 killed nothing (A / P2 did, 417.6.c + 428.5.c.2) → the Immortal Phoenix in P1's trash is NOT offered and stays there; P1 keeps its spare [1][fury]", async () => {
    const game = await board(5, { phoenix: true }).build();
    await stunD(game);
    await attackAndDecree(game);
    const seen = await finish(game);
    expect(seen.shrine).toBe(true);
    expect(seen.phoenix).toBe(false);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  });
});

describe("control: without the Decree the 4-Might attack kills nobody", () => {
  test("no Decree cast: D takes 4, is healed in the Cleanup and holds bf1; A (took 0 from stunned D) survives but loses and is recalled to base — nobody dies, Shrine silent", async () => {
    const game = await board(4).build();
    await stunD(game);
    await game.p2.move("a", "bf1");
    const seen = await finish(game);
    expect(seen.shrine).toBe(false);
    expect(game.zoneOf("d")).toBe("battlefield-bf1");
    expect(game.state("d").damage).toBe(0);
    expect(game.zoneOf("a")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });
});
