/**
 * Ruling 3793a0f372aca389 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · [Action] — "Move a friendly unit and ready it."
 *
 * Q: On the opponent's turn I controlled a battlefield, lost control, then regained it later that same turn — do I score
 *    for conquering it?
 * A: Yes. What matters is whether YOU already scored at that battlefield this turn, not whether you controlled it before.
 *    Sequence: opponent attacks Reaver's Row, you use its trigger to pull your unit to base and lose the Row when that
 *    combat resolves (opponent scores); later you Ride the Wind a unit back in; when that new showdown resolves in your
 *    favour you gain control and score a conquer point.
 * Rules: 441–444 (conquer = gaining control; each player scores a given battlefield at most once per turn), 464–467
 *        (combat resolution, control change), 383.4.f (defend trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const RIDE_THE_WIND = "ogn-173-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P2's turn 3. P1 controls Reaver's Row (live text) with Small (2); Bruiser (6) waits in P1's base; P1 holds Ride the
 * Wind with exactly 2+[chaos]. P2 has Raider (3) and Scout (1) in base; bf2 is uncontrolled and empty.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Step 1 — Raider attacks the Row; P1 uses the Row's trigger to pull Small home; the combat resolves: P2 takes the Row. */
async function loseTheRow(game: Game): Promise<void> {
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" } });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("small");
  }
  await game.settle();
}

/** Step 2 — P2 walks Scout onto empty bf2 (a showdown → P1 gets Focus); P1 Rides Bruiser onto the Row. */
async function rideBruiserBackIn(game: Game): Promise<void> {
  await game.p2.move("scout", "bf2");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "bruiser" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
  expect((d as Pick).options.map((o) => o.key)).toContain("battlefield-row");
  await game.p1.pick("battlefield-row");
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 3793a0f372aca389 — losing and re-taking Reaver's Row in the same (opponent's) turn still scores a conquer", () => {
  test("step 1: P2 attacks the Row, P1's defend trigger moves Small to base, and when that combat fully resolves P2 controls the Row and scores it — P1 has scored NOTHING there this turn", async () => {
    const game = await board().build();
    await loseTheRow(game);
    expect(game.zoneOf("small")).toBe("base");
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("raider")).toBe("battlefield-row");
    expect(game.p2.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P2]).toEqual(["row"]);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual([]); // the key fact the ruling relies on
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 }); // combat fully over
  });

  test("step 2: later that turn P1 Rides the Wind Bruiser back onto the (now enemy) Row — it arrives ready and the Row is contested by P1", async () => {
    const game = await board().build();
    await loseTheRow(game);
    await rideBruiserBackIn(game);
    expect(game.zoneOf("bruiser")).toBe("battlefield-row");
    expect(game.state("bruiser").isReady).toBe(true);
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.p1.points()).toBe(0);
  });

  test("step 3: when the new showdown at the Row resolves (Bruiser 6 kills Raider 3) P1 GAINS control and SCORES a conquer point on P2's turn — prior control earlier in the turn does not block it", async () => {
    const game = await board().build();
    await loseTheRow(game);
    await rideBruiserBackIn(game);
    // Finish bf2's showdown, then the Row's combat; P2 (now the defender there) declines its own Row trigger.
    game.script(P2, [(d) => (d.kind === "yes-no" && d.source?.cardId === "row" ? false : undefined)]);
    await game.settle();
    if (game.gameState.battlefields.row?.contested) {
      await game.settle();
    }
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["row"]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["row"]);
    expect(game.p1.points()).toBe(1);
    // P2 keeps what it scored earlier (Row) plus bf2; each player scored the Row once this turn.
    expect(game.gameState.scoredThisTurn?.[P2]).toEqual(["row", "bf2"]);
    expect(game.p2.points()).toBe(2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
