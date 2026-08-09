/**
 * Interaction: Dazzling Aurora (ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top
 *     of your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle
 *     the rest."                                                            — P1's
 *   × Vex, Apathetic (unl-150-219) · Champion unit · "[Deflect] When an opponent plays a unit while I'm
 *     at a battlefield, [Stun] it. They can't move it this turn."          — P2's, at bf1
 *   × Monch (unl-035-219) · Unit · 6 · "If an opponent controls a stunned unit, I cost [2] less and
 *     enter ready."                                                         — in P2's hand
 *   (+ Eclipse Herald ogn-059-298 "When you stun an enemy unit, ready me and give me +1 [Might] this
 *    turn." as an OBSERVATION PROBE only: its trigger holds the Ending Step open right after Vex's stun
 *    lands, so the test can see the stun before the Expiration Step wipes it.)
 *
 * Rules: 317.1.a (Ending Step: end-of-turn effects — Aurora), 317.2.b–d (Expiration Step inserts 3c heal,
 * 3d "all 'this turn' effects expire simultaneously", 3e pools empty), 423.1.a.2 ("Stunned Units lose the
 * Stunned status during step 3d of the end of turn cleanup"), 423.1.b (a stunned unit deals no combat
 * damage), 317.2.f (FEPR loop back to the start of the Expiration Step), 317.3 (next player's turn).
 *
 * Question: at the end of P1's turn Aurora plays a unit for P1; Vex stuns it and forbids moving it "this
 * turn" — during the Ending Step of that same turn. Is the unit still stunned on P2's following turn
 * (Monch −2 and ready; no combat damage if it defends), or do both the stun and the rider drop at 3d of
 * THIS turn's Expiration Step? Contrast: Vex stuns a unit P1 plays during P2's turn — that stun lasts
 * through P2's turn until P2's own 3d.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const VEX = "unl-150-219";
const MONCH = "unl-035-219";
const ECLIPSE_HERALD = "ogn-059-298"; // probe: "When you stun an enemy unit, ready me and give me +1 [Might] this turn."
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-might unit (the card Aurora finds)
const DISCIPLINE = "ogn-058-298"; // calm · 2 · "Give a unit +2 [Might] this turn. Draw 1." — only opens a chain on P2's turn
/** rule 813.1 — an inline [Reaction] unit P1 can play while holding priority on P2's turn (contrast line). */
const FLASH_RECRUIT = { energyCost: 2, keywords: ["Reaction"], might: 3, name: "Flash Recruit" };

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2, P1 active and about to end the turn. P1: Dazzling Aurora in base, Main Deck top = Shipyard
 * Skulker "found", controls the empty bf2, 1 floating energy (to watch 3e empty it). P2: Vex at bf1
 * (P2's), a 3-might Raider in base, Monch in hand; with `probe`, an exhausted Eclipse Herald in base.
 * Aurora's destination prompt for the found unit is pre-answered with `dest`.
 */
function board(opts: { dest?: "base" | "bf2"; probe?: boolean } = {}) {
  let b = scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 1 })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .deck(P1, [SKULKER], ["found"])
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", VEX, "vex")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, MONCH, "monch")
    .script(P1, [opts.dest === "bf2" ? "battlefield-bf2" : "base"]);
  if (opts.probe) {
    b = b.unit(P2, "base", ECLIPSE_HERALD, "herald", { exhausted: true });
  }
  return b;
}

/** Both players pass priority once (top chain item resolves). */
async function bothPass(game: Game): Promise<void> {
  await game.acting().pass();
  await game.acting().pass();
}

/** Contrast board: P2's turn 3; P1 holds a [Reaction] unit and 2 energy, P2 has Discipline to open a chain, Monch, 8 energy. */
function contrastBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 8 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VEX, "vex")
    .hand(P2, MONCH, "monch")
    .hand(P2, DISCIPLINE, "discipline")
    .hand(P1, FLASH_RECRUIT, "flash");
}

/** P2 casts Discipline on Vex; with priority P1 flashes in the Reaction unit; everything resolves into P2's open Main Phase. */
async function stunOnP2Turn(): Promise<Game> {
  const game = await contrastBoard().build();
  await game.p2.cast("discipline", { targets: "vex" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  expect(game.p1.can("play", "flash")).toBe(true);
  await game.p1.play("flash");
  expect(game.chain().map((c) => c.cardId)).toContain("vex"); // Vex's trigger is on the chain
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  return game;
}

describe("Dazzling Aurora end-of-turn play × Vex stun — Stunned and 'can't move this turn' both expire at 3d of the same turn", () => {
  // ── Ending Step: Aurora → play → Vex triggers ──────────────────────────────────────────────

  test("Ending Step 317.1: Aurora's trigger goes on the chain when P1 ends the turn; it resolves into playing 'found' (ignoring cost) — and THAT play, by Vex's opponent while Vex is at a battlefield, puts Vex's trigger on the chain, all still inside P1's Ending Phase", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    await bothPass(game); // Aurora resolves: found revealed, banished as a way-station, then played
    expect(game.chain().map((c) => c.cardId)).toEqual(["found"]);
    // rule 355.2 — the instructed play asks its performer for a destination at
    // finalization, before anyone gets priority; the scripted answer lands it in base.
    if (game.decision()?.kind === "pick") {
      await game.settle({ maxSteps: 1 });
    }
    expect(game.zoneOf("found")).toBe("base");
    expect(game.p1.energy()).toBe(1); // ignoring its cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.state("found").isStunned).toBe(false); // not yet — the trigger is only pending
  });

  test("(probe) Vex's trigger resolves during the Ending Step: 'found' IS Stunned and carries the turn-scoped NoMove rider right now — observed while Eclipse Herald's follow-up trigger holds the chain, still on P1's turn (317.2.f loop)", async () => {
    const game = await board({ probe: true }).build();
    await game.p1.endTurn();
    // Drain until Herald's trigger is the pending item.
    for (let i = 0; i < 12 && !game.chain().some((c) => c.cardId === "herald"); i++) {
      const d = game.decision();
      if (d?.kind === "action") {
        await game.acting().pass();
      } else {
        await game.settle({ maxSteps: 1 });
      }
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["herald"]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    expect(game.zoneOf("found")).toBe("base");
    expect(game.state("found").isStunned).toBe(true);
    expect(game.state("found").grantedKeywords).toEqual([{ duration: "turn", keyword: "NoMove", value: undefined }]);
  });

  // ── Expiration Step 3d of the SAME turn wipes both ─────────────────────────────────────────

  test("Expiration Step of that same turn: by the time P2's turn opens, 'found' is NOT stunned and the NoMove rider is gone (423.1.a.2 + 317.2.c: both drop at 3d), P1's floating energy was emptied at 3e, and P1 controls no stunned unit", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("found")).toBe("base");
    expect(game.state("found").isStunned).toBe(false);
    expect(game.state("found").grantedKeywords).toEqual([]);
    expect(game.state("found").damage).toBe(0);
    expect(game.p1.energy()).toBe(0); // 3e
    expect(game.p1.units().some((u) => game.state(u).isStunned)).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(probe) same with the Herald line: on P2's turn 'found' is un-stunned, and Herald's '+1 [Might] this turn' has expired too (7 Might) — every 'this turn' effect of P1's turn ended together at 3d", async () => {
    const game = await board({ probe: true }).build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("found").isStunned).toBe(false);
    expect(game.state("found").grantedKeywords).toEqual([]);
    expect(game.state("herald").might).toBe(7);
  });

  test("so on P2's turn Monch gets NO discount and does NOT enter ready: with exactly 6 energy it costs all 6 and arrives exhausted", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 6 });
    const before = game.p2.energy();
    await game.p2.play("monch", { to: "base" });
    expect(game.p2.energy()).toBe(before - 6);
    await game.settle();
    expect(game.zoneOf("monch")).toBe("base");
    expect(game.state("monch").isExhausted).toBe(true);
    expect(game.state("monch").isReady).toBe(false);
  });

  test("and if combat occurs on P2's turn the Aurora unit deals its combat damage normally: 'found' (3) placed at bf2, P2's 3-might Raider attacks → BOTH die (a still-stunned defender would have dealt 0 and the Raider would survive, 423.1.b)", async () => {
    const game = await board({ dest: "bf2" }).build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("found")).toBe("battlefield-bf2");
    expect(game.state("found").isStunned).toBe(false);
    await game.p2.move("raider", "bf2");
    await game.settle(); // showdown: both pass focus, combat resolves
    expect(game.zoneOf("found")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash"); // took 3 from the (un-stunned) defender
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P2); // no survivors → no conquer
  });

  // ── Contrast: a stun applied DURING P2's turn lasts through P2's turn ──────────────────────

  test("contrast — P1 flashes in a [Reaction] unit while holding priority on P2's turn: Vex stuns it, and that stun (plus NoMove) is live in P2's Main Phase", async () => {
    const game = await stunOnP2Turn();
    expect(game.zoneOf("flash")).toBe("base");
    expect(game.state("flash").isStunned).toBe(true);
    expect(game.state("flash").grantedKeywords).toEqual([{ duration: "turn", keyword: "NoMove", value: undefined }]);
    expect(game.p1.energy()).toBe(0); // paid 2 for the flash play
  });

  test("contrast — with P1's stunned unit on the board, Monch played later that same turn DOES cost [2] less (8 → 2 after Discipline's 2 and Monch's 4) and enters READY", async () => {
    const game = await stunOnP2Turn();
    expect(game.p2.energy()).toBe(6); // 8 − Discipline
    await game.p2.play("monch", { to: "base" });
    expect(game.p2.energy()).toBe(2); // 6 − (6 − 2)
    await game.settle();
    expect(game.zoneOf("monch")).toBe("base");
    expect(game.state("monch").isReady).toBe(true);
  });

  test("contrast — that stun persists for the rest of P2's turn and only drops at 3d of P2's own Expiration Step: after P2 ends the turn, on P1's turn the unit is un-stunned and free of NoMove", async () => {
    const game = await stunOnP2Turn();
    expect(game.state("flash").isStunned).toBe(true);
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("flash").isStunned).toBe(false);
    expect(game.state("flash").grantedKeywords).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
