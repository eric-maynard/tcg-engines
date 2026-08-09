/**
 * Interaction: Bottled Constellation (ven-067-166) · Gear · Mind · 10 + [mind][mind]
 *     "At the start of your Main Phase, you may kill 3 other friendly units and/or gear to score 1 point."
 *   × Ferrous Forerunner (sfd-021-221) · Unit · Fury · 6+[fury] · 6 Might
 *     "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *   × Gold (sfd-t03) · Gear Token — "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   (P2's would-be answers) Not So Fast (sfd-045-221) "Counter an enemy spell or ability that chooses a
 *     friendly unit or gear." · Wind Wall (ogn-064-298) "Counter a spell." · Defy (ogn-045-298) "Counter a
 *     spell that costs no more than [4]…"
 *
 * Rules: 383.3.a (a leading "you may" is decided during FINALIZATION), 383.3.b + 204.3.a ("kill 3 … to score"
 * is a cost-within-instructions at the start of the effect → the trigger's BASE COST), 383.3.b.1 / 404.2 (it
 * must be paid to finalize; unpaid → the Pending item just leaves the chain, never Finalized), 402.2 (all
 * choices — here: which three — are made in step 2), 404.1 (the cost is paid as one action in step 4),
 * 406.4 (other players get to react only after finalization), 337.3 / 383.3 (a trigger raised while
 * finalizing — Forerunner's Deathknell — is itself finalized on top before anyone gets priority), 340.1
 * (LIFO resolution), 186.1 (a token in a non-board zone ceases to exist), 355.10.c.1 (cost objects are not
 * targets → nothing of P2's is "chosen"), 471.1.a / 471.1.a.1 / 471.1.b (Final-Point restriction is
 * Conquer-only), 808 (Deathknell).
 *
 * Question:
 *   (a) P1 has the Constellation, Ferrous Forerunner and exactly ONE Gold token (2 "other" permanents). May
 *       P1 kill Forerunner first, let the Deathknell make two Mechs, and count them? Is P1 prompted at all?
 *   (b) Next turn P1 has Forerunner + two Gold (3 others) and opts in: when do the three die relative to
 *       P2's first chance to react, where does the Deathknell land, and can P2 stop the point?
 *   (c) P1 is on 7 of 8 without holding every battlefield — is this the winning point?
 *   (d) May Bottled Constellation itself be one of the three?
 *
 * Expected:
 *   (a) No, and no prompt. All three cost objects are chosen in step 2 and killed together in step 4; the
 *       Mechs only exist once the Deathknell RESOLVES, long after. With 2 eligible objects the cost is
 *       unpayable → the trigger is removed un-finalized (404.2, 383.3.b.1); Forerunner and the Gold survive.
 *   (b) Step 2: P1 names Forerunner + both Gold; step 4: all three die at once during finalization; the
 *       Deathknell pends and is finalized on top of the Constellation trigger (337.3); the Gold tokens cease to
 *       exist (186.1). Only NOW does P2 get priority (406.4) — kills done and irreversible. Not So Fast needs an
 *       ability that chooses a P2 unit/gear (this chooses nothing of P2's — 355.10.c.1); Wind Wall / Defy
 *       counter spells only. LIFO: two Mechs to base first, then the Constellation scores 1.
 *   (c) Yes — 471.1.a.1: non-Conquer points ignore the Final-Point restriction → P1 wins.
 *   (d) No — "other" excludes the source; it survives and can fire again next Main Phase if fed 3 more.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOTTLED_CONSTELLATION = "ven-067-166";
const FERROUS_FORERUNNER = "sfd-021-221";
const GOLD = "sfd-t03";
const NOT_SO_FAST = "sfd-045-221";
const WIND_WALL = "ogn-064-298";
const DEFY = "ogn-045-298";

const mechsIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("token-mech"));

/**
 * P2 is about to end turn 2. P1: Constellation + Ferrous Forerunner + `golds` Gold tokens in base.
 * P2: a bystander unit, 5 calm runes (to float 3 energy + 2 calm in any priority window) and
 * Not So Fast / Wind Wall / Defy in hand.
 */
function board(golds: 1 | 2) {
  const s = scenario()
    .turn(2)
    .active(P2)
    .gear(P1, BOTTLED_CONSTELLATION, "bottle")
    .unit(P1, "base", FERROUS_FORERUNNER, "ff")
    .gear(P1, GOLD, "gold1")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "theirs")
    .runes(P2, "calm", 5)
    .hand(P2, NOT_SO_FAST, "nsf")
    .hand(P2, WIND_WALL, "ww")
    .hand(P2, DEFY, "defy");
  return golds === 2 ? s.gear(P1, GOLD, "gold2") : s;
}

interface Snapshot {
  readonly seat: string;
  readonly chain: string[];
  readonly ffZone: string;
  readonly gold1: boolean;
  readonly gold2: boolean;
  readonly points: number;
  readonly mechs: number;
}

function snap(game: Game, seat: string): Snapshot {
  return {
    chain: game.chain().map((i) => i.cardId),
    ffZone: game.zoneOf("ff"),
    gold1: game.has("gold1"),
    gold2: game.has("gold2"),
    mechs: mechsIn(game.p1.base()).length,
    points: game.p1.points(),
    seat,
  };
}

/**
 * From "P2 has just ended the turn": answer everything for the Constellation line — P1 opts in and names
 * `victims` (all at once), both seats pass every priority window — until P1's open Main Phase (or game over).
 * Records a snapshot at every priority window and every non-action prompt, in order; `onP2Priority` runs
 * the first time P2 holds priority in each distinct chain state.
 */
async function drive(
  game: Game,
  victims: readonly string[],
  onP2Priority?: (game: Game) => Promise<void>,
): Promise<{ windows: Snapshot[]; prompts: { kind: Decision["kind"]; seat: string; before: Snapshot }[] }> {
  const windows: Snapshot[] = [];
  const prompts: { kind: Decision["kind"]; seat: string; before: Snapshot }[] = [];
  const seenP2 = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "main") {
        break;
      }
      windows.push(snap(game, d.seat));
      if (d.seat === P2 && onP2Priority) {
        const key = game.chain().map((c) => c.cardId).join(",");
        if (!seenP2.has(key)) {
          seenP2.add(key);
          await onP2Priority(game);
        }
      }
      await game.seat(d.seat).passPriority();
      continue;
    }
    prompts.push({ before: snap(game, d.seat), kind: d.kind, seat: d.seat });
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const offered = d.options.map((o) => o.card ?? o.key);
      const take = victims.filter((v) => offered.includes(v)).slice(0, d.max);
      await game.p1.pick(...(take.length > 0 ? take : [offered[0]!]));
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      throw new Error(`unexpected decision ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
  return { prompts, windows };
}

describe("Bottled Constellation × Ferrous Forerunner × Gold tokens — cost timing of 'kill 3 … to score'", () => {
  // ---- (a) only two "other" friendly permanents ------------------------------------------------------------

  test("(a) Forerunner + ONE Gold = only 2 eligible cost objects: P1 can never opt in (yes() is rejected), nothing dies, no Mechs are ever made to 'count', no point (402.2, 404.1, 404.2)", async () => {
    const game = await board(1).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    // Walk whatever the engine surfaces; wherever a question appears it must not be acceptable.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        expect(d.seat).toBe(P1);
        expect(d.canAccept).toBe(false);
        expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
        await game.p1.no();
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        throw new Error(`unexpected ${d.kind} prompt for ${d.seat}`);
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("ff")).toBe("base");
    expect(game.zoneOf("gold1")).toBe("base");
    expect(game.zoneOf("bottle")).toBe("base");
    expect(mechsIn(game.p1.base())).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) with an unpayable base cost the trigger never becomes a Finalized chain item — P1 is not asked anything and P2 never holds priority against it; P1 lands straight in an open Main Phase (383.3.b.1, 404.2, 337.1.a)", async () => {
    // Expected: after P2 ends the turn the Constellation trigger pends, cannot be paid, and is removed —
    // the first decision anyone sees is P1's open main-phase menu with an empty chain.
    // Actual: the trigger is finalized for free, both players get a priority window on it, and only on
    // resolution is P1 shown a (non-acceptable) "use optional ability?" question.
    const game = await board(1).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("ff")).toBe("base");
    expect(game.p1.points()).toBe(0);
  });

  // ---- (b) three others: Forerunner + two Gold ---------------------------------------------------------------

  test("BUG: (b) the leading 'you may' and the choice of the three are made during FINALIZATION — P1 is asked before any player holds priority, with the trigger still on the chain (383.3.a, 402.1, 402.2, 337.1.a)", async () => {
    // Expected: right after the turn starts the first decision is P1's opt-in (then the pick), chain = [bottle].
    // Actual: the first decision is a priority window for P1 (then P2); the opt-in is only asked on resolution.
    const game = await board(2).build();
    await game.p2.endTurn();
    const first = game.decision();
    expect(first).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bottle"]);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    // still nobody has had priority
    const { prompts } = await drive(game, ["ff", "gold1", "gold2"]);
    expect(prompts.filter((p) => p.kind === "yes-no")).toHaveLength(0); // never asked again at resolution
  });

  test("(b)(d) the chooser is offered exactly Forerunner + the two Gold — never Bottled Constellation itself ('other') and nothing of P2's", async () => {
    const game = await board(2).build();
    await game.p2.endTurn();
    let pick: PickDecision | undefined;
    for (let i = 0; i < 10 && !pick; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        pick = d;
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        expect(d.canAccept).not.toBe(false);
        await game.p1.yes();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(pick).toBeDefined();
    expect(pick!.options.map((o) => o.card ?? o.key).sort()).toEqual(["ff", "gold1", "gold2"]);
  });

  test("BUG: (b) the cost is all-or-nothing — exactly three must be named (no 'kill 1, decline the rest, still score') (404.1, 404.2, 383.3.b.1)", async () => {
    // Expected: the pick demands exactly 3 (min 3 / max 3, not declinable); naming one Gold and stopping is
    // not a legal way to pay, so no point can result from it and Forerunner/gold2 are untouched.
    // Actual: pick is min 1 / max 3 / declinable; picking gold1 then declining kills just gold1 AND scores 1.
    const game = await board(2).build();
    await game.p2.endTurn();
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        break;
      }
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect({ allowDecline: d.allowDecline, max: d.max, min: d.min }).toEqual({ allowDecline: false, max: 3, min: 3 });
    // And behaviourally: a partial payment must never yield a point.
    await game.p1.try((p) => p.pick("gold1"));
    await game.p1.try((p) => p.decline());
    await game.settle();
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("ff")).toBe("base");
    expect(game.has("gold2")).toBe(true);
  });

  test("BUG: (b) when P2 FIRST holds priority the three are already dead — Forerunner in the trash, both Gold ceased to exist (186.1) — the Deathknell sits on top of the still-unresolved Constellation trigger, and no point has been scored yet (404.1, 337.3, 406.4)", async () => {
    // Expected at P2's first window: chain = [bottle, ff] (oldest→newest), ff in trash, gold1/gold2 gone,
    // P1 points 0, no Mechs yet.
    // Actual: P2's first window comes BEFORE the opt-in — chain = [bottle], all three still on the board;
    // later the kills + the point happen together at the pick, and only then does the Deathknell go up alone.
    const game = await board(2).build();
    await game.p2.endTurn();
    const { windows } = await drive(game, ["ff", "gold1", "gold2"]);
    const firstP2 = windows.find((w) => w.seat === P2);
    expect(firstP2).toBeDefined();
    expect(firstP2).toMatchObject({ ffZone: "trash", gold1: false, gold2: false, mechs: 0, points: 0 });
    expect(firstP2!.chain).toEqual(["bottle", "ff"]);
  });

  test("(b) P2 has no natural answer: floating 3 energy + 2 calm, Not So Fast (needs an ability that CHOOSES a P2 unit/gear — the kills are a cost, 355.10.c.1), Wind Wall and Defy (spells only) are castable in NONE of P2's priority windows", async () => {
    const game = await board(2).build();
    await game.p2.endTurn();
    let checked = 0;
    let floated = false;
    const { windows } = await drive(game, ["ff", "gold1", "gold2"], async (g) => {
      if (!floated) {
        const runes = g.p2.runes();
        await g.p2.tapRune(runes[0]);
        await g.p2.tapRune(runes[1]);
        await g.p2.tapRune(runes[2]);
        await g.p2.recycleRune(runes[3]);
        await g.p2.recycleRune(runes[4]);
        floated = true;
      }
      expect(g.p2.energy()).toBeGreaterThanOrEqual(3);
      expect(g.p2.power("calm")).toBeGreaterThanOrEqual(2);
      expect(g.p2.hand()).toEqual(expect.arrayContaining(["nsf", "ww", "defy"]));
      expect(g.chain().length).toBeGreaterThan(0);
      expect(g.p2.can("cast", "nsf")).toBe(false);
      expect(g.p2.can("cast", "ww")).toBe(false);
      expect(g.p2.can("cast", "defy")).toBe(false);
      expect(g.p2.legal().filter((o) => o.verb === "cast")).toEqual([]);
      checked++;
    });
    expect(windows.some((w) => w.seat === P2)).toBe(true);
    expect(checked).toBeGreaterThanOrEqual(1);
    // …and the point went through regardless.
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["nsf", "ww", "defy"]));
  });

  test("BUG: (b) resolution is LIFO — the Deathknell (newest) resolves BEFORE the Constellation scores: while the Deathknell is the top item the Constellation trigger is still beneath it and P1 has 0 points (340.1)", async () => {
    // Expected: every window in which "ff" is on the chain also has "bottle" beneath it and points = 0; the
    // Mechs appear before the point does.
    // Actual: the point is scored (and the Constellation item is gone) before the Deathknell is even put on
    // the chain — every "ff" window shows points = 1 and chain = [ff].
    const game = await board(2).build();
    await game.p2.endTurn();
    const { windows } = await drive(game, ["ff", "gold1", "gold2"]);
    const ffWindows = windows.filter((w) => w.chain.includes("ff"));
    expect(ffWindows.length).toBeGreaterThan(0);
    for (const w of ffWindows) {
      expect(w.chain).toEqual(["bottle", "ff"]);
      expect(w.points).toBe(0);
    }
    expect(game.p1.points()).toBe(1);
    expect(mechsIn(game.p1.base())).toHaveLength(2);
  });

  test("(b) net result once the chain empties: Forerunner in P1's trash, both Gold gone (186.1), two exhausted 3-Might Mech tokens in P1's base, Constellation still on the board, P1 on 1 point, P2's board untouched, P1's open Main Phase", async () => {
    const game = await board(2).build();
    await game.p2.endTurn();
    await drive(game, ["ff", "gold1", "gold2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ff")).toBe("trash");
    expect(game.has("gold1")).toBe(false);
    expect(game.has("gold2")).toBe(false);
    expect(game.zoneOf("gold1")).toBe("gone");
    expect(game.zoneOf("bottle")).toBe("base");
    const mechs = mechsIn(game.p1.base());
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m)).toMatchObject({ cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 3, name: "Mech" });
    }
    expect(mechsIn(game.p2.base())).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) the winning point -------------------------------------------------------------------------------

  test("(c) at 7/8 with P2 holding every battlefield the bottled point is still the WINNING point — the Final-Point restriction is Conquer-only (471.1.a.1 vs 471.1.b)", async () => {
    const game = await board(2)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Holder 1" }, "h1")
      .unit(P2, "bf2", { might: 2, name: "Holder 2" }, "h2")
      .build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(7); // nothing from battlefields — P1 holds none
    await drive(game, ["ff", "gold1", "gold2"]);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  // ---- (d) "other" + it survives to fire again ---------------------------------------------------------------

  test("(d) Bottled Constellation is not sacrificed by its own effect: it stays, and next Main Phase — fed the two Mechs + a spare unit (3 others again) — it fires again for a second point", async () => {
    const game = await board(2).unit(P1, "base", { might: 1, name: "Spare" }, "spare").build();
    await game.p2.endTurn();
    await drive(game, ["ff", "gold1", "gold2"]);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("bottle")).toBe("base");
    expect(game.zoneOf("spare")).toBe("base");
    const mechs = mechsIn(game.p1.base());
    expect(mechs).toHaveLength(2);

    await game.advanceToTurnOf(P2); // P1 ends turn 3 → P2's turn 4
    expect(game.p1.points()).toBe(1);
    await game.p2.endTurn(); // → P1's turn 5: the Constellation triggers again
    const { prompts } = await drive(game, [...mechs, "spare"]);
    const pick = prompts.find((p) => p.kind === "pick");
    expect(pick).toBeDefined();
    expect(game.p1.points()).toBe(2);
    expect(game.zoneOf("bottle")).toBe("base");
    expect(game.zoneOf("spare")).toBe("trash");
    for (const m of mechs) {
      expect(game.has(m)).toBe(false); // killed tokens cease to exist (186.1)
    }
    expect(game.p1.base()).toEqual(["bottle"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
