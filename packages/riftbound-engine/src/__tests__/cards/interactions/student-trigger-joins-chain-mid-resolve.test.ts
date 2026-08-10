/**
 * Interaction: Ravenbloom Student (ogn-103-298) · Unit · Mind · 2 · 2 Might
 *     "When you play a spell, give me +1 [Might] this turn."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · [Action] — "Deal 3 to a unit at a battlefield."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · [Reaction] — "Give a unit +2 [Might] this turn. Draw 1."
 *   × Defy (ogn-045-298) · Spell · Calm · 1+[calm] · [Reaction] — "Counter a spell that costs no more
 *     than [4] and no more than [rainbow]."  (control case)
 *
 * Board: P1's turn. P2's Ravenbloom Student (2) sits at bf1. P1 plays Hextech Ray at the Student and
 * passes; P2 responds with Discipline on the Student; P2 passes, P1 passes → Discipline resolves.
 *
 * Questions:
 *  (a) The Student's condition is met DURING resolution (Discipline finished = "played", 419.4.a) while
 *      Hextech Ray is still on the chain. The trigger joins THIS chain as a Pending item (336.1, 330.2,
 *      383.3); 340.3 → back to Finalize (337.1 / 337.1.a — nobody gets priority first); then 337.4:
 *      the controller of the newest item — P2 — gets priority, not P1.
 *  (b) Hextech Ray never left, so the chain / Closed State never lapsed (330, 331.1).
 *  (c) Trigger resolves → Student 2 +2 +1 = 5; 340.4 → priority to P1 (Ray's controller); both pass →
 *      3 damage to a 5-Might Student → it lives; end of turn clears damage before "this turn" buffs
 *      expire (317.2.b before 317.2.c) so it survives into the next turn as a clean 2.
 *  (d) Control: P1 answers Discipline with Defy → Discipline is countered (425.1.a) → it was never
 *      "played" (419.4.a.1) → NO Student trigger; newest remaining item is Hextech Ray → priority P1;
 *      both pass → 3 damage to a 2-Might Student → it dies.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const HEXTECH_RAY = "ogn-009-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RAVENBLOOM_STUDENT, "student")
    .resources(P1, { energy: 2, power: { calm: 1, fury: 1 } }) // Hextech Ray (1+fury) + Defy (1+calm)
    .resources(P2, { energy: 2 }) // exactly Discipline
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, DEFY, "defy")
    .hand(P2, DISCIPLINE, "disc");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);
const priority = (game: Game) => {
  const d = game.decision();
  return d?.kind === "action" && d.context === "chain" ? d.seat : undefined;
};

/** [Hextech Ray, Discipline] on the chain, P2 has passed → P1 holds priority (last chance to respond). */
async function disciplineOnTopP1Priority(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray", { targets: "student" });
  expect(chainIds(game)).toEqual(["ray"]);
  expect(priority(game)).toBe(P1);
  await game.p1.passPriority();
  expect(priority(game)).toBe(P2);
  await game.p2.cast("disc", { targets: "student" });
  expect(chainIds(game)).toEqual(["ray", "disc"]);
  expect(priority(game)).toBe(P2);
  await game.p2.passPriority();
  expect(priority(game)).toBe(P1);
  return game;
}

/** …P1 passes too → Discipline resolves (and the Student's trigger is created). */
async function disciplineResolved(): Promise<Game> {
  const game = await disciplineOnTopP1Priority();
  await game.p1.passPriority();
  expect(game.zoneOf("disc")).toBe("trash");
  return game;
}

describe("Ravenbloom Student's play-trigger joins a live chain under Hextech Ray", () => {
  // ── (a) the trigger is appended to THIS chain, finalized, and P2 gets priority ─────────────────

  test("(a) when Discipline resolves the Student's trigger is appended to the SAME chain above Hextech Ray: [Ray (P1), Student-trigger (P2, triggered)] (336.1, 330.2, 383.3, 419.4.a)", async () => {
    const game = await disciplineResolved();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "student", controller: P2, triggered: true }),
    ]);
    expect(game.state("student").might).toBe(4); // Discipline's +2 already applied; the +1 is still a chain item
  });

  test("(a) the new item is already FINALIZED (no choices — 'me' is a referent) before anyone acts, and priority goes to P2 — the controller of the newest item — NOT to turn player / Ray owner P1 (340.3 → 337.1.a → 337.4)", async () => {
    const game = await disciplineResolved();
    const items = game.gameState.interaction?.chain?.items ?? [];
    expect(items.at(-1)).toMatchObject({ cardId: "student", controller: P2, status: "finalized", triggered: true });
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(priority(game)).toBe(P2);
    expect(game.decision()?.kind).not.toBe("pick"); // nothing was asked of anyone
  });

  test("(a) priority windows in order: [Ray]→P1; [Ray,Disc]→P2 then P1; [Ray,Student-trig]→P2 then P1; [Ray]→P1 then P2 (337.4 / 340.4)", async () => {
    const game = await disciplineResolved(); // asserts the first three windows on the way
    expect([chainIds(game), priority(game)]).toEqual([["ray", "student"], P2]);
    await game.p2.passPriority();
    expect([chainIds(game), priority(game)]).toEqual([["ray", "student"], P1]);
    await game.p1.passPriority(); // trigger resolves
    expect([chainIds(game), priority(game)]).toEqual([["ray"], P1]); // 340.4: Ray's controller
    await game.p1.passPriority();
    expect([chainIds(game), priority(game)]).toEqual([["ray"], P2]);
  });

  // ── (b) the Closed State never lapsed ─────────────────────────────────────────────────────────

  test("(b) between Discipline leaving and the trigger arriving the chain never emptied: Hextech Ray is on it at every observable instant, the decision context stays 'chain' and P1 is never offered an Open-State action such as End Turn (330, 331.1)", async () => {
    const game = await board().build();
    const closed = () => {
      expect(chainIds(game)[0]).toBe("ray");
      expect(game.zoneOf("ray")).toBe("chain");
      expect(game.gameState.interaction?.chain?.active).toBe(true);
      expect(game.decision()).toMatchObject({ kind: "action", context: "chain" });
      expect(game.p1.can("endTurn")).toBe(false);
    };
    await game.p1.cast("ray", { targets: "student" });
    closed();
    await game.p1.passPriority();
    closed();
    await game.p2.cast("disc", { targets: "student" });
    closed();
    await game.p2.passPriority();
    closed();
    await game.p1.passPriority(); // Discipline resolves, trigger appended — still closed
    closed();
    await game.p2.passPriority();
    closed();
    await game.p1.passPriority(); // trigger resolves — Ray still there
    closed();
    await game.p1.passPriority();
    closed();
    await game.p2.passPriority(); // Ray resolves → NOW the chain is gone
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.chain ?? null).toBeNull();
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  // ── (c) might vs damage ───────────────────────────────────────────────────────────────────────

  test("(c) Discipline drew P2 a card and gave +2; the trigger gives +1 → 5 Might; Hextech Ray then deals 3 to a 5-Might Student → it LIVES at bf1 with 3 damage; chain empty → Open, P1 to act", async () => {
    const game = await disciplineOnTopP1Priority();
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority(); // Discipline resolves
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.state("student").might).toBe(4);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Student trigger resolves
    expect(game.state("student").might).toBe(5);
    expect(game.state("student").damage).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Hextech Ray resolves
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("student")).toBe("battlefield-bf1");
    expect(game.state("student")).toMatchObject({ damage: 3, might: 5 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, fury: 0 } }); // only Ray was paid for
    expect(game.p2.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) it also survives the END of turn: damage is cleared (317.2.b) before the 'this turn' +3 expires (317.2.c) — next turn it is an undamaged 2-Might Student at bf1", async () => {
    const game = await disciplineResolved();
    await game.settle(); // everyone passes: trigger, then Ray, resolve
    expect(game.state("student")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("student")).toBe("battlefield-bf1");
    expect(game.state("student")).toMatchObject({ damage: 0, might: 2 });
  });

  // ── (d) control: Defy counters Discipline ─────────────────────────────────────────────────────

  test("(d) control: P1 may answer Discipline with Defy (Discipline costs 2 ≤ 4, no power); chain = [Ray, Discipline, Defy→Discipline], P1 keeps priority as its controller", async () => {
    const game = await disciplineOnTopP1Priority();
    expect(game.p1.can("cast", "defy")).toBe(true);
    const offered = (game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("disc");
    await game.p1.cast("defy", { targets: "disc" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P1 }),
      expect.objectContaining({ cardId: "disc", controller: P2 }),
      expect.objectContaining({ cardId: "defy", controller: P1 }),
    ]);
    expect(priority(game)).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  test("(d) Defy resolves → Discipline is COUNTERED (425.1.a): no +2, no draw, and — a countered spell was never 'played' (419.4.a.1) — NO Student trigger joins the chain; newest remaining item is Hextech Ray → priority to P1, not P2 (340.4)", async () => {
    const game = await disciplineOnTopP1Priority();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("defy", { targets: "disc" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Defy resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, triggered: false })]);
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
    expect(game.state("student").might).toBe(2);
    expect(game.p2.hand()).toHaveLength(p2Hand); // no draw
    expect(priority(game)).toBe(P1);
  });

  test("(d) …P1 passes, P2 passes → Hextech Ray deals 3 to a 2-Might Student → it dies (to P2's trash); chain empty, P1's open main phase", async () => {
    const game = await disciplineOnTopP1Priority();
    await game.p1.cast("defy", { targets: "disc" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Defy resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ray resolves
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("student")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["student", "disc"]));
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
