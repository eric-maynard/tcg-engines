/**
 * Interaction: Ezreal, Dashing (sfd-082-221) · Champion Unit · Mind · 4+[mind] · 3 Might
 *     "When I attack or defend, deal damage equal to my Might to an enemy unit here. I don't deal combat damage. …"
 *   × Janna, Savior (sfd-053-221) · Champion Unit · Calm · 3+[calm] · 3 Might · [Reaction]
 *     "When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · [Reaction] · "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 383.4.e (attack triggers go on the chain when the unit gains Attacker), 402.2 / 355.5 (a trigger's TARGET is
 * chosen as it is finalized — Decision FIN), 355.13 ("up to one" may be zero — chosen at FIN and never re-opened),
 * 337.4 (P1, controller of the newest item, has priority first), 340 (LIFO), 359.3.e.2 / 359.3.e.5 (a target that no
 * longer meets the requirement at RESOLUTION is illegal → its instruction is ignored), 359.3.e.12.a ("equal to my
 * Might" is information read at RES), 464.2.c / 323.2.c (a unit that leaves the combat battlefield loses Attacker).
 *
 * Question: P1's turn; P2 controls bf1 with a 3-Might defender D. P1 standard-moves Ezreal into bf1; his attack trigger
 * is finalized.
 *   (a) What is fixed at FIN vs read at RES — the target D? the amount? P1 responds to his own trigger with Discipline
 *       on Ezreal (+2): how much does D take?
 *   (b) Instead P2 responds with Janna to bf1 and at FIN of her play trigger picks Ezreal for the 'up to one'. Janna's
 *       trigger resolves first and sends Ezreal home. When Ezreal's trigger resolves, D is still where it was — 3?
 *   (c) Variant of (b): P2 chose ZERO units at FIN, then regrets it — can P2 move Ezreal when Janna's trigger resolves?
 *
 * Expected: (a) target = FIN (item.targets=[D], chooser P1); amount = RES → Discipline resolves first (+2, draw 1) → 5
 * to D → D dies; P1 conquers bf1. (b) Janna's 'up to one' = FIN pick by P2 (targets=[Ezreal]); LIFO: Ezreal → base;
 * his trigger's 'enemy unit HERE' is re-checked at RES from his CURRENT location (base) → D illegal → no damage; his
 * Might is not null (still 3 on the board) — a pure targeting-legality whiff; he loses Attacker; no conquer, P2 keeps
 * bf1. (c) No: targets=[] was P2's FIN choice; nothing is asked at RES; Ezreal stays and deals 3 to D, killing it.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-082-221";
const JANNA = "sfd-053-221";
const DISCIPLINE = "ogn-058-298";
const SKULKER = "ogn-175-298";

/**
 * P1's turn 2, Neutral Open. P1: Ezreal (3) ready in base, Discipline in hand + exactly its 2 energy, a known card on
 * top of the deck. P2: bf1 with the 3-Might defender D (+ a 1-Might Extra when asked), Janna in hand + exactly 3+[calm].
 */
function board(o: { extraEnemy?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", EZREAL, "ez")
    .unit(P2, "bf1", { might: 3, name: "Defender D" }, "d")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, JANNA, "janna")
    .deck(P1, [SKULKER], ["top"]);
  if (o.extraEnemy) {
    s.unit(P2, "bf1", { might: 1, name: "Extra E" }, "e");
  }
  return s;
}

/** Ezreal standard-moves into bf1; his attack trigger is finalized (D auto-bound as the only enemy there); P1 has priority. */
async function ezrealAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ez", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ez", controller: P1, targets: ["d"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** …P1 passes; P2 plays Janna to bf1 → her play trigger's 'up to one enemy unit from here' FIN pick is open for P2. */
async function jannaResponds(): Promise<{ game: Game; pick: Decision | null }> {
  const game = await ezrealAttacks();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.play("janna", { to: "bf1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  return { game, pick: game.decision() };
}

/** Pass priority around until only `keep` items remain on the chain (stops early at any non-action prompt). */
async function resolveDownTo(game: Game, keep: number): Promise<Decision | null> {
  for (let i = 0; i < 10 && game.chain().length > keep; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action") {
      return d;
    }
    await game.acting().passPriority();
  }
  return game.decision();
}

describe("Ezreal, Dashing — 'here' target locked at FIN, Might read at RES × Janna's bounce × Discipline", () => {
  // ── (a) FIN target / RES amount ───────────────────────────────────────────────────────────────

  test("(a) the TARGET is a finalization choice: with two enemy units at bf1, P1 is asked right after the move — a FIN-timed pick bound to Ezreal's chain item, before anyone holds priority (383.4.e, 402.2)", async () => {
    const game = await board({ extraEnemy: true }).build();
    await game.p1.move("ez", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d?.source).toMatchObject({ cardId: "ez", pendingChoiceType: "choose-target" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["d", "e"]);
    await game.p1.pick("d");
    expect(game.chain()[0]).toMatchObject({ cardId: "ez", targets: ["d"] });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 337.4: P1 first
  });

  test("(a) with D alone it is auto-bound: item.targets = [D] is visible on the chain BEFORE resolution, and P1 (controller of the newest item) holds priority first with Discipline castable on Ezreal (337.4)", async () => {
    const game = await ezrealAttacks();
    expect(game.p1.can("cast", "disc")).toBe(true);
    const offered = (game.p1.option("cast", "disc")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("ez");
    expect(game.state("d").damage).toBe(0); // nothing read or dealt yet
  });

  test("(a) the AMOUNT is read at resolution: Discipline (+2, draw 1) resolves first (LIFO), then Ezreal's trigger deals his CURRENT Might 5 to D — D (3) is dead before combat damage is even considered (359.3.e.12.a, 340)", async () => {
    const game = await ezrealAttacks();
    await game.p1.cast("disc", { targets: "ez" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ez", "disc"]);
    await resolveDownTo(game, 1); // Discipline resolves
    expect(game.state("ez").might).toBe(5);
    expect(game.p1.hand()).toEqual(["top"]); // drew 1
    expect(game.state("d").damage).toBe(0); // Ezreal's item still pending
    await resolveDownTo(game, 0); // Ezreal's trigger resolves
    expect(game.zoneOf("d")).toBe("trash"); // 5 ≥ 3
    expect(game.chain()).toEqual([]);
  });

  test("(a) …no defender remains and Ezreal deals no combat damage anyway: the combat closes with P1 CONQUERING bf1 (+1), Ezreal unhurt at bf1", async () => {
    const game = await ezrealAttacks();
    await game.p1.cast("disc", { targets: "ez" });
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.state("ez")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Janna picks Ezreal ────────────────────────────────────────────────────────────────────

  test("(b) Janna resolves immediately as a unit; her play trigger's 'up to one enemy unit from here' is a FIN pick for P2 (min 0, max 1, up-to targeting) offering exactly Ezreal (355.13, 402.2)", async () => {
    const { game, pick } = await jannaResponds();
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(pick).toMatchObject({ allowDecline: true, kind: "pick", max: 1, min: 0, seat: P2, targeting: "up-to", timing: "FIN" });
    expect(pick?.source).toMatchObject({ cardId: "janna" });
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.key) : []).toEqual(["ez"]);
    await game.p2.pick("ez");
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["ez", ["d"]], ["janna", ["ez"]]]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(b) LIFO: Janna's trigger resolves first — Ezreal is moved to P1's base while his own trigger (targets still [D]) is pending; he has lost the Attacker designation but his Might is a perfectly readable 3 (323.2.c, 359.3.e.12.a)", async () => {
    const { game } = await jannaResponds();
    await game.p2.pick("ez");
    await resolveDownTo(game, 1);
    expect(game.locationOf("ez")).toBe("base");
    expect(game.state("ez")).toMatchObject({ combatRole: null, might: 3, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ez", targets: ["d"] })]);
    expect(game.state("d").damage).toBe(0);
  });

  test("(b) Ezreal's trigger then resolves with 'here' = his BASE: D (unmoved, at bf1) no longer meets 'enemy unit here' → illegal target → NO damage to D or anyone (359.3.e.2, 359.3.e.5)", async () => {
    const { game } = await jannaResponds();
    await game.p2.pick("ez");
    await resolveDownTo(game, 0);
    expect(game.chain()).toEqual([]);
    expect(game.state("d")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("janna").damage).toBe(0);
    expect(game.state("ez").damage).toBe(0);
  });

  test("(b) end state: no attacker is left at bf1, so the combat ends without damage — P2 KEEPS bf1 uncontested, nobody scores, Ezreal sits in base, back to P1's open main phase", async () => {
    const { game } = await jannaResponds();
    await game.p2.pick("ez");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.locationOf("ez")).toBe("base");
    expect(game.zoneOf("d")).toBe("battlefield-bf1");
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Janna picks nobody ────────────────────────────────────────────────────────────────────

  test("(c) P2 declines the 'up to one' at FIN: Janna's item is finalized with targets = [] and P2 gets priority — the choice is closed (355.13)", async () => {
    const { game } = await jannaResponds();
    await game.p2.decline();
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["ez", ["d"]], ["janna", []]]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(c) when Janna's trigger resolves NOTHING is asked — no late 'move Ezreal?' prompt for P2 — and Ezreal is still at bf1 as an Attacker", async () => {
    const { game } = await jannaResponds();
    await game.p2.decline();
    const after = await resolveDownTo(game, 1);
    expect(after).toMatchObject({ context: "chain", kind: "action" }); // straight to priority over Ezreal's item
    expect(game.locationOf("ez")).toBe("bf1");
    expect(game.state("ez").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ez", targets: ["d"] })]);
  });

  test("(c) Ezreal's trigger resolves 'here' = bf1: D takes 3 and dies", async () => {
    const { game } = await jannaResponds();
    await game.p2.decline();
    await resolveDownTo(game, 0);
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.locationOf("ez")).toBe("bf1");
  });

  test("(c) coda: Janna (3) still defends and Ezreal deals no combat damage — combat kills Ezreal (3 taken) and P2 keeps bf1", async () => {
    const { game } = await jannaResponds();
    await game.p2.decline();
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf("ez")).toBe("trash");
    expect(game.state("janna")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
