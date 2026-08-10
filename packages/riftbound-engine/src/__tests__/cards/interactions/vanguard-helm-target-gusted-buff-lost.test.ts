/**
 * Interaction: Vanguard Helm (ogn-228-298) · Gear · Order · 2 · "When a buffed friendly unit dies, buff another friendly
 *     unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)"
 *   × Cithria of Cloudfield (ogn-139-298) · Unit · Body · 2 · 1 Might — here just "a buffed friendly unit" (1+1) that dies
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction · "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."                                                                                     — held by P2
 *   with an inline 0-cost "Test Kill" (kill a unit) to make Cithria die and an inline 0-cost Reaction "Test Boost" (buff a
 *   unit) for the buffed-in-response contrast.
 *
 * Rules: 705 / 747 (a unit that leaves play loses its Buff; a counter that leaves an object without being placed on
 * another ceases to exist), 746 (a "moved" counter is always on exactly one object — the Helm does NOT move Cithria's
 * counter, it performs a fresh Buff), 748 (an object in a non-board zone has no counters), 426.1.b.1 / 426.1.c (an
 * already-buffed unit is a legal choice for a Buff but gets no second counter), 359.3.e.2 / 359.3.e.5 (a target that
 * changed to a non-board zone is illegal → its instruction is ignored; targets were locked at finalization — no
 * re-choice), 703 (each Buff is +1 Might).
 *
 * Question: P1 has the Helm, buffed Cithria (1+1) at bf1, unbuffed 2-Might X at bf1 (and an unbuffed bystander Y in
 * base). Cithria dies; the Helm triggers and P1 chooses X. In response P2 Gusts X to P1's hand.
 *   (a) When the Helm's trigger resolves with its target gone — is a Buff placed anywhere / can P1 re-choose?
 *   (b) How many Buff counters exist on P1's board afterwards?
 *   (c) Contrast: X is BUFFED in response instead (still at bf1, already carrying a counter when the Helm resolves).
 *   (d) Contrast: no response at all.
 *
 * Expected: (a) nothing is placed and no new choice is offered — X in hand is an illegal target, the instruction is
 * ignored; Y is untouched. (b) zero. (c) X stays a legal target, the ability resolves, but 426.1.b.1 adds no second
 * counter: X is buffed exactly once, 3 Might. (d) X 0 → 1 counter, 2 → 3 Might.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VANGUARD_HELM = "ogn-228-298";
const CITHRIA = "ogn-139-298";
const GUST = "ogn-169-298";

/** Inline 0-cost Action: "Kill a unit." — a neutral way to make Cithria die on P1's turn. */
const TEST_KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Kill",
  rulesText: "[Action] Kill a unit.",
  timing: "action",
};
/** Inline 0-cost Reaction: "Buff a unit." — the 'buffed in response by another effect' of contrast (c). */
const TEST_BOOST = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Boost",
  rulesText: "[Reaction] Buff a unit.",
  timing: "reaction",
};

/**
 * P1's turn. P1: Vanguard Helm (gear), buffed Cithria (1+1) at bf1, unbuffed 2-Might X at bf1, unbuffed 2-Might Y in
 * base, Test Kill in hand. P2: Gust (exactly 1 energy + a chaos pip) and Test Boost in hand.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .gear(P1, VANGUARD_HELM, "helm")
    .unit(P1, "bf1", CITHRIA, "cithria", { buffed: true })
    .unit(P1, "bf1", { might: 2, name: "X" }, "x")
    .unit(P1, "base", { might: 2, name: "Y" }, "y")
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .hand(P1, TEST_KILL, "kill")
    .hand(P2, GUST, "gust")
    .hand(P2, TEST_BOOST, "boost");
}

/** Cithria is killed; the Helm triggers; P1 finalizes it choosing X and passes priority to P2 (item still pending). */
async function helmAimedAtX(): Promise<Game> {
  const game = await board().build();
  expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
  await game.p1.cast("kill", { targets: "cithria" });
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "helm" } });
  await game.p1.pick("x");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "helm", controller: P1, targets: ["x"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

const buffedOnP1Board = (game: Game) => game.p1.units().filter((id) => game.state(id).isBuffed);

describe("Vanguard Helm × Gust — the Helm's chosen unit is bounced (or pre-buffed) in response", () => {
  test("premise: buffed Cithria dies → she is her unbuffed printed self in the trash (705/748); the Helm's trigger asks P1 for 'another friendly unit' — X | Y offered, Cithria herself and nothing of P2's", async () => {
    const game = await board().unit(P2, "base", { might: 2, name: "Foe" }, "foe").build();
    await game.p1.cast("kill", { targets: "cithria" });
    await game.settle();
    expect(game.zoneOf("cithria")).toBe("trash");
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 1 });
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["x", "y"]);
  });

  test("premise: with the Helm's item finalized on X, P2 has a Reaction window; Gust (1) may take X (2 Might, at a battlefield) but not Y (in base)", async () => {
    const game = await helmAimedAtX();
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["x"]);
    await game.p2.cast("gust", { targets: "x" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["helm", "gust"]);
  });

  // ── (a)/(b) Gust in response ──────────────────────────────────────────────────────────────────────

  test("(a) Gust resolves first (LIFO): X is in P1's hand — unbuffed there (748) — while the Helm's item, still locked on X, waits on the chain", async () => {
    const game = await helmAimedAtX();
    await game.p2.cast("gust", { targets: "x" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p1.hand()).toContain("x");
    expect(game.state("x").isBuffed).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "helm", targets: ["x"], triggered: true })]);
  });

  test("(a) the Helm's trigger then resolves with its only target gone: NO re-choice is offered (targets were locked at finalization), the instruction is ignored (359.3.e.2/.5) — straight back to P1's open main phase", async () => {
    const game = await helmAimedAtX();
    await game.p2.cast("gust", { targets: "x" });
    const s = await game.settle();
    expect(s.reason).toBe("open"); // an "unanswered" here would mean a re-target prompt appeared
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("y")).toMatchObject({ isBuffed: false, might: 2, zone: "base" }); // the bystander was never chosen
    expect(game.state("x")).toMatchObject({ isBuffed: false, zone: "hand" });
  });

  test("(b) afterwards ZERO Buff counters exist on P1's board: Cithria's ceased with her (705/747 — the Helm never 'moves' it, 746), X's was never placed, Y untouched", async () => {
    const game = await helmAimedAtX();
    await game.p2.cast("gust", { targets: "x" });
    await game.settle();
    expect(buffedOnP1Board(game)).toEqual([]);
    expect(game.p1.units().sort()).toEqual(["y"]);
    for (const id of ["cithria", "x", "y"]) {
      expect(game.state(id).isBuffed).toBe(false);
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b) X replayed from hand later is a NEW object (359.3.e.4) — it enters unbuffed; still no counter anywhere", async () => {
    const game = await helmAimedAtX();
    await game.p2.cast("gust", { targets: "x" });
    await game.settle();
    expect(game.p1.can("play", "x")).toBe(true); // inline X costs 0
    await game.p1.play("x");
    await game.settle();
    expect(game.state("x")).toMatchObject({ isBuffed: false, might: 2, zone: "base" });
    expect(buffedOnP1Board(game)).toEqual([]);
  });

  // ── (c) buffed in response instead ────────────────────────────────────────────────────────────────

  test("(c) contrast — P2 answers with Test Boost on X: X is buffed (2 → 3) BEFORE the Helm resolves; X is still a legal target (426.1.c) so the item resolves normally, but 426.1.b.1 places no second counter — X ends buffed exactly once at 3 Might, no prompt, Y untouched", async () => {
    const game = await helmAimedAtX();
    await game.p2.cast("boost", { targets: "x" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["helm", "boost"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Boost resolves
    expect(game.state("x")).toMatchObject({ isBuffed: true, might: 3, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "helm", targets: ["x"] })]);
    const s = await game.settle(); // Helm resolves
    expect(s.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ isBuffed: true, might: 3, zone: "battlefield-bf1" }); // not 4
    expect(game.state("y")).toMatchObject({ isBuffed: false, might: 2 });
    expect(buffedOnP1Board(game)).toEqual(["x"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) no response ───────────────────────────────────────────────────────────────────────────────

  test("(d) contrast — no response: the Helm resolves and X goes 0 → 1 counter, 2 → 3 Might (703); exactly one Buff on P1's board; P2 still holds Gust", async () => {
    const game = await helmAimedAtX();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ isBuffed: true, might: 3, zone: "battlefield-bf1" });
    expect(game.state("y")).toMatchObject({ isBuffed: false, might: 2 });
    expect(buffedOnP1Board(game)).toEqual(["x"]);
    expect(game.p2.hand().sort()).toEqual(["boost", "gust"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
