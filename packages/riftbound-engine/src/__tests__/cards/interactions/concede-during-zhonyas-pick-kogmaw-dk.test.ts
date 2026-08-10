/**
 * Interaction: Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Kog'Maw, Caustic (ogn-190-298) · Champion Unit · Chaos · 1 Might
 *     "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × two Kai'Sa, Survivor (ogn-039-298) · Champion Unit · Fury · 4 Might (the attackers)
 *   × Concede.
 *
 * Rules: 466.1 (Combat Cleanup) → 323.4 / 323.5 (Kog'Maw's Deathknell is noted, then it dies), 466.2 (that
 * chain item resolves before the Resolution Step) → 319.5 Cleanup: both Kai'Sas carry lethal damage at once;
 * 373 (simultaneous events + ONE single-use replacement → its controller P1 must choose which death it
 * applies to — a legitimate mid-Cleanup decision); 650 (a player may concede at any time), 651.1 / 196 (the
 * remaining player wins; the game ends).
 *
 * Question: P1 (Zhonya's face-up in base) attacks P2's lone Kog'Maw with two Kai'Sas. Kog'Maw dies in the
 * Combat Cleanup, its Deathknell deals 4 to both Kai'Sas, and P1 is asked which death Zhonya's replaces.
 *   (a) P2 — the seat NOT being asked — concedes while that pick is pending.
 *   (b) P1 concedes while its own pick is pending.
 * Final state in each case: is either Kai'Sa killed/recalled, is Zhonya's killed, does the Cleanup finish,
 * does P1 conquer?
 *
 * Expected: the set-up yields a real P1 decision (pick one of the two Kai'Sas, replacement semantics) with
 * Kog'Maw already in P2's trash and both Kai'Sas at bf1 on 4 damage. (a) P2 may concede right then; P1 wins
 * immediately; the pending decision is discarded; the Cleanup is NOT completed — neither Kai'Sa moves to the
 * trash or to base, neither is healed, Zhonya's stays in base, no control change at bf1, P1 scores nothing;
 * status finished, no open decision for anyone, further answers rejected. (b) Symmetric with P2 the winner;
 * Kog'Maw stays in P2's trash; the snapshot still shows both damaged Kai'Sas at bf1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const KOGMAW = "ogn-190-298";
const KAISA = "ogn-039-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn. P2's lone Kog'Maw holds bf1; P1 has two ready Kai'Sas and a face-up Zhonya's in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P1, "base", KAISA, "k1")
    .unit(P1, "base", KAISA, "k2")
    .gear(P1, ZHONYAS, "zh");
}

/** Attack with both Kai'Sas and let combat + the Deathknell play out up to the Zhonya's pick. */
async function upToThePick(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["k1", "k2"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  const r = await game.settle(); // both pass focus → combat damage → Combat Cleanup → Deathknell resolves → Cleanup
  expect(r.reason).toBe("unanswered");
  return game;
}

/** The mid-Cleanup snapshot that a concede must freeze in place. */
function expectFrozenBoard(game: Game): void {
  expect(game.zoneOf("kog")).toBe("trash"); // it died before anyone conceded
  expect(game.p2.trash()).toEqual(["kog"]);
  for (const k of ["k1", "k2"]) {
    expect(game.state(k)).toMatchObject({ controller: P1, damage: 4, zone: "battlefield-bf1" }); // not trashed, not recalled, not healed
  }
  expect(game.p1.trash()).toEqual([]);
  expect(game.p1.units("base")).toEqual([]);
  expect(game.zoneOf("zh")).toBe("base"); // the Hourglass was never "killed instead"
  expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // no control established
  expect(game.p1.points()).toBe(0); // no conquer
  expect(game.chain()).toEqual([]);
}

describe("Concede while a Zhonya's 'which death?' pick is pending mid-Cleanup (Kog'Maw Deathknell on two Kai'Sas)", () => {
  // ── set-up: the decision really exists ───────────────────────────────────────────────────

  test("set-up: Kog'Maw dies in the Combat Cleanup (P2's trash), its Deathknell has resolved (chain empty) marking 4 on BOTH Kai'Sas still at bf1, and P1 — Zhonya's controller — holds a replacement-assign PICK naming exactly k1 | k2 (373); nothing has been replaced or killed yet, no conquer yet", async () => {
    const game = await upToThePick();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, semantics: "replacement-assign", source: { cardId: "zh" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["k1", "k2"]);
    expect(game.isOver()).toBe(false);
    expectFrozenBoard(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("set-up: the engine itself lists `concede` as a valid move for BOTH seats at this moment (650 — 'at any time', even while the other seat is being asked)", async () => {
    const game = await upToThePick();
    for (const seat of [P1, P2]) {
      const rows = game.engine.enumerateMoves(seat as never, { moveIds: ["concede"], validOnly: false } as never) as { isValid: boolean; moveId: string }[];
      expect(rows).toEqual([expect.objectContaining({ isValid: true, moveId: "concede" })]);
    }
  });

  // BUG — expected (650): conceding is legal "at any time", so the seat NOT being asked (P2) should still see
  // `concede` on its harness menu while P1's replacement pick is open (the engine's own enumerateMoves reports
  // it valid — see the previous test). Actual: the decision surface gives P2 no menu at all during P1's pick
  // (`p2.legal()` is empty, `p2.can("concede")` false); only the raw move `p2.do("concede")` goes through.
  test("(a) P2's menu should offer `concede` while P1's Zhonya's pick is pending (650)", async () => {
    const game = await upToThePick();
    expect(game.p2.can("concede")).toBe(true);
  });

  // ── (a) P2 concedes during P1's pick ─────────────────────────────────────────────────────

  test("(a) P2 concedes while P1's pick is pending: accepted; the game is finished at once with P1 the single winner (651.1 / 196)", async () => {
    const game = await upToThePick();
    await game.p2.do("concede");
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P1);
  });

  test("(a) …the pending Zhonya's decision is discarded and never re-surfaced: no decision for either seat, empty menus, and a late answer from P1 is rejected", async () => {
    const game = await upToThePick();
    await game.p2.do("concede");
    expect(game.decision()).toBeNull();
    expect(game.p1.decision()).toBeNull();
    expect(game.p2.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
    const late = await game.p1.try((p) => p.pick("k1"));
    expect(late.ok).toBe(false);
    expect((await game.settle()).reason).toBe("game-over");
  });

  test("(a) …and the Cleanup is NOT completed: neither Kai'Sa is trashed, healed or recalled (both still at bf1 on 4 damage), Zhonya's is still in base, Kog'Maw stays in P2's trash, bf1 is not P1's and P1 scored nothing", async () => {
    const game = await upToThePick();
    await game.p2.do("concede");
    expectFrozenBoard(game);
    expect(game.p2.points()).toBe(0);
  });

  // ── (b) P1 concedes during its own pick ──────────────────────────────────────────────────

  test("(b) P1 concedes while its OWN pick is pending: accepted; game finished, P2 the single winner; P1's decision vanishes (no decision anywhere, late pick rejected)", async () => {
    const game = await upToThePick();
    await game.p1.do("concede");
    expect(game.isOver()).toBe(true);
    expect(game.gameState.status).toBe("finished");
    expect(game.winner()).toBe(P2);
    expect(game.decision()).toBeNull();
    expect(game.p1.decision()).toBeNull();
    expect(game.p2.decision()).toBeNull();
    expect((await game.p1.try((p) => p.pick("k2"))).ok).toBe(false);
    expect((await game.p2.try((p) => p.endTurn())).ok).toBe(false);
  });

  test("(b) …no replacement applied, no deaths processed: both damaged Kai'Sas still on bf1, Zhonya's in base, Kog'Maw in P2's trash, points unchanged on both sides", async () => {
    const game = await upToThePick();
    await game.p1.do("concede");
    expectFrozenBoard(game);
    expect(game.p2.points()).toBe(0); // winning by concession awards no points
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
