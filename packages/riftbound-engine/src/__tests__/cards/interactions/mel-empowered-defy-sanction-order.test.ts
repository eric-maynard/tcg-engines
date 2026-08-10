/**
 * Interaction: Mel, Newly Awakened (ven-069-166) — "[Empowered][>] Your spells and abilities can't be
 *   countered. If a spell or ability you control would give -[Might] to a unit it chooses, it gives an
 *   additional -1 [Might]."
 *   × Defy (ogn-045-298) — "[Reaction] Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Sanction (ven-035-166) — "[Reaction] Choose one — • Empower a unit. Disempower it at end of turn.
 *     • Disempower a unit that's [Empowered]. Empower it at end of turn."
 *   with Hextech Ray (ogn-009-298, 1+[fury]) — "Deal 3 to a unit at a battlefield." as the spell at stake.
 *
 * Question: P1 (Mel Empowered in base) casts Hextech Ray at P2's 3-Might unit U. P2 holds Defy and
 * Sanction. In which ORDER must P2 chain them so that Defy actually counters Ray, and when exactly
 * does Mel's status-dependent passive stop / resume applying?
 *
 * Rules: 828.1.b.1 ([Empowered][>] = "while I have the Empowered status, I have [Text]"), 828.1.c,
 * 727.1.c.2 (passive applies exactly while the dependent status is true — no chain lag), 442.1
 * (Disempower), 441.2, 425.1.a/b/c (countered → does nothing, to trash, not "played", no refund),
 * 358.3.a ("can't be countered" is not "can't be chosen" — Defy may still target Ray), 359.3.e.6 /
 * 359.3.e.10 (an impossible instruction is skipped, the card still resolves and is trashed), 340.1
 * (LIFO), 340.4 (after a resolution the controller of the newest remaining item gets priority),
 * 337.4, 480.2 (re-empower at end of turn = the text is Active again).
 *
 * Map of Mel's Empowered text at the instant Defy's "counter" executes:
 *   (a) Ray–Defy            → ACTIVE   → counter does nothing, Ray resolves, U dies.
 *   (b) Ray–Sanction–Defy   → ACTIVE   → Defy resolves FIRST, wasted; then Mel disempowered; Ray kills U.
 *   (c) Ray–Defy–Sanction   → INACTIVE → Sanction resolves first, then Defy counters Ray; U lives.
 *   (d) Ray–Sanction ⟶ resolves, THEN Defy → INACTIVE → Ray countered; U lives.
 *   after end of turn       → ACTIVE again (Sanction's delayed re-empower).
 * Mel's second clause (extra −1 Might) is irrelevant: Ray deals damage, it gives no −Might.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MEL = "ven-069-166";
const SANCTION = "ven-035-166";
const DEFY = "ogn-045-298";
const RAY = "ogn-009-298";
const DISEMPOWER_MODE = 1; // Sanction's second printed bullet

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of a seat's cast option into the set of ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. P1: Empowered Mel in base, Hextech Ray in hand, exactly 1+[fury].
 * P2: 3-Might vanilla U at bf1, Defy (1+[calm]) and Sanction (3+[calm]) in hand, exactly 4+[calm][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MEL, "mel", { empowered: true })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "u")
    .hand(P1, RAY, "ray")
    .hand(P2, DEFY, "defy")
    .hand(P2, SANCTION, "sanction");
}

/** P1 casts Ray at U and passes priority to P2. */
async function rayAtU(game: Game): Promise<void> {
  expect(game.state("mel").isEmpowered).toBe(true);
  await game.p1.cast("ray", { targets: "u" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

function expectRayResolved(game: Game): void {
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("ray")).toBe("trash");
  expect(game.zoneOf("u")).toBe("trash"); // 3 damage on a 3-Might unit → dies at cleanup
}

function expectRayCountered(game: Game): void {
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("ray")).toBe("trash"); // 425.1.a.1 — countered card goes to (its owner's) trash
  expect(game.state("ray").owner).toBe(P1);
  expect(game.zoneOf("u")).toBe("battlefield-bf1");
  expect(game.state("u").damage).toBe(0);
}

describe("Mel (Empowered: can't be countered) × Defy × Sanction — chain order decides whether the counter lands", () => {
  // ---------------------------------------------------------------- (a) Defy alone
  test("(a) Defy is LEGAL to play targeting Ray while Mel is Empowered — 'can't be countered' ≠ 'can't be chosen' (358.3.a)", async () => {
    const game = await board().build();
    await rayAtU(game);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "p2", "defy")).toEqual(["ray"]);
  });

  test("(a) Ray–Defy: on resolution Defy does nothing (Mel's passive ACTIVE), goes to P2's trash, its 1+[calm] is not refunded; Ray then kills U", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 1 } }); // paid 1 + [calm]
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("defy").owner).toBe(P2);
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 1 } }); // 425.1.c — no refund
    expectRayResolved(game);
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (b) Ray–Sanction–Defy (wrong order)
  test("(b)/(e) merely PLAYING Sanction (mode 2 on Mel) changes nothing: with Sanction unresolved on the chain Mel is still Empowered", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "sanction"]);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "sanction", mode: DISEMPOWER_MODE, targets: ["mel"] });
    expect(game.state("mel").isEmpowered).toBe(true); // status only changes when Sanction RESOLVES
    // 337.4 / 338.1.a.5 — P2 (controller of the newest item) holds priority and may stack Defy on top.
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
  });

  test("(b) Ray–Sanction–Defy resolves Defy FIRST while Mel is still Empowered → counter wasted; then Mel is disempowered (pointlessly); then Ray kills U", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "sanction", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });

    // Step the LIFO resolution one item at a time (340.1 / 340.4).
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Defy resolves: Mel Empowered → nothing happens
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "sanction"]);
    expect(game.chain()[0]?.countered).toBe(false);
    expect(game.state("mel").isEmpowered).toBe(true);

    expect(game.actingSeat()).toBe(P2); // 340.4 — controller of the newest remaining item (Sanction)
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Sanction resolves: Mel disempowered NOW
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("mel").isEmpowered).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);

    expect(game.actingSeat()).toBe(P1); // 340.4 — Ray is P1's
    await game.settle(); // → Ray resolves: too late for P2, Defy is already gone
    expectRayResolved(game);
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (c) Ray–Defy–Sanction (right order)
  test("(c) Ray–Defy–Sanction: the chain builds in that order and Sanction resolves FIRST → Mel is Disempowered before Defy resolves (442.1; text Inactive from that instant, 828.1.b.1)", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.actingSeat()).toBe(P2); // 337.4 — P2 keeps priority after finalizing Defy and stacks Sanction on top
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "defy", "sanction"]);
    expect(game.state("mel").isEmpowered).toBe(true); // nothing has resolved yet

    await game.p2.passPriority();
    await game.p1.passPriority(); // → Sanction resolves
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("mel").isEmpowered).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "defy"]);
    expect(game.actingSeat()).toBe(P2); // 340.4 — Defy (newest remaining item) is P2's
  });

  // BUG — expected (727.1.c.2 / 828.1.b.1): "can't be countered" applies only WHILE Mel has the
  // Empowered status, evaluated when the counter instruction executes; Mel is unempowered by then, so
  // Defy counters Ray and U is untouched. Actual: the engine stamps `uncounterable` on Ray's chain item
  // when Ray is PLAYED (Mel Empowered at that moment) and never re-evaluates — Ray resolves, U dies.
  test("(c) Ray–Defy–Sanction — once Sanction has disempowered Mel, Defy resolves and Ray IS countered (425.1.a): Ray to P1's trash, U untouched", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("defy", { targets: "ray" });
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Sanction resolves, Mel unempowered
    expect(game.state("mel").isEmpowered).toBe(false);
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Defy resolves: nothing forbids the counter now
    expect(game.zoneOf("defy")).toBe("trash");
    await game.settle(); // a countered Ray is cleared from the chain (425.1.a) — nothing left to resolve
    expectRayCountered(game);
    expect(game.violations()).toEqual([]);
  });

  // BUG — same root cause as above (play-time `uncounterable` stamp instead of a live check).
  test("(c) settle() shortcut gives the same answer: Ray–Defy–Sanction ⇒ U survives with 0 damage, all three spells in their owners' trash", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("defy", { targets: "ray" });
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "defy", "sanction"]);
    await game.settle();
    expectRayCountered(game);
    expect(game.p1.trash()).toEqual(["ray"]);
    expect([...game.p2.trash()].sort()).toEqual(["defy", "sanction"]);
    expect(game.state("mel").isEmpowered).toBe(false);
  });

  // ---------------------------------------------------------------- (d) Sanction resolves alone, then Defy
  test("(d) P2 plays only Sanction; all pass so it resolves; the chain still holds Ray → P1 (Ray's controller) gets priority (340.4), not P2; after P1 passes, P2 may NOW play Defy targeting Ray", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Sanction resolves
    expect(game.state("mel").isEmpowered).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 340.4
    // P2 may not act while P1 holds priority.
    expect(game.p2.can("cast", "defy")).toBe(false);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "p2", "defy")).toEqual(["ray"]);
    await game.p2.cast("defy", { targets: "ray" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "defy"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // BUG — expected: Mel is already unempowered when Defy is even played here, so nothing stops the
  // counter: Ray is countered, U lives (equivalent to line (c)). Actual: Ray's chain item still carries
  // the play-time `uncounterable` stamp from when Mel WAS Empowered → Defy does nothing, U dies.
  test("(d) …and that Defy (played and resolved with Mel unempowered) counters Ray — U survives untouched", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Sanction resolves
    expect(game.state("mel").isEmpowered).toBe(false);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "ray" });
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expectRayCountered(game);
    expect(game.violations()).toEqual([]);
  });

  // Mirror of the same timing rule in the other direction (727.1.c.2: the passive BEGINS applying the
  // instant the status becomes true). BUG — expected: Ray is played while Mel is NOT Empowered; P2
  // answers with Defy; P1 stacks his own Sanction (mode 1: Empower Mel) on top. Sanction resolves first
  // → Mel Empowered → Defy's counter is now forbidden → Ray resolves and kills U. Actual: no play-time
  // stamp on Ray (Mel was unempowered then) → Defy counters Ray, U lives.
  test("mirror — Mel unempowered when Ray is played, but Empowered (P1's own Sanction, mode 1) before Defy resolves → the counter fails and U dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1, calm: 1 } })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", MEL, "mel") // NOT empowered
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "u")
      .hand(P1, RAY, "ray")
      .hand(P1, SANCTION, "mySanction")
      .hand(P2, DEFY, "defy")
      .build();
    expect(game.state("mel").isEmpowered).toBe(false);
    await game.p1.cast("ray", { targets: "u" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "ray" });
    await game.p2.passPriority();
    await game.p1.cast("mySanction", { mode: 0, targets: "mel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "defy", "mySanction"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // → Sanction resolves: Mel Empowered from this instant
    expect(game.state("mel").isEmpowered).toBe(true);
    await game.settle(); // → Defy resolves (blocked), then Ray resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expectRayResolved(game);
  });

  // ---------------------------------------------------------------- (e) end of turn
  test("(e) end of turn after line (c): Sanction's delayed 'Empower it' re-empowers Mel (text Active again, 480.2) and the re-empower is permanent; the countered/resolved Ray stays in the trash", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("defy", { targets: "ray" });
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("mel").isEmpowered).toBe(false); // for the rest of P1's turn
    await game.advanceTurn(); // P1's Ending Step → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.zoneOf("ray")).toBe("trash"); // nothing comes back
    // and the re-empower has no duration: still Empowered on P1's next turn
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mel").isEmpowered).toBe(true);
  });

  test("(e) in the wasted-Defy line (b) Mel also ends the turn Empowered again — the disempower was pointless AND temporary", async () => {
    const game = await board().build();
    await rayAtU(game);
    await game.p2.cast("sanction", { mode: DISEMPOWER_MODE, targets: "mel" });
    await game.p2.cast("defy", { targets: "ray" });
    await game.settle();
    expectRayResolved(game);
    expect(game.state("mel").isEmpowered).toBe(false);
    await game.advanceTurn();
    expect(game.state("mel").isEmpowered).toBe(true);
  });

  test("Mel's second clause is irrelevant here: Ray deals exactly 3 damage (no −Might is involved), a 4-Might U survives with 3 damage", async () => {
    const game = await board().unit(P2, "bf1", { might: 4, name: "Big Victim" }, "big").build();
    await game.p1.cast("ray", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.state("big")).toMatchObject({ damage: 3, might: 4 });
  });
});
