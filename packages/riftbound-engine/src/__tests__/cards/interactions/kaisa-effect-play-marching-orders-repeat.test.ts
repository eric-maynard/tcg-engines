/**
 * Interaction: Kai'Sa, Evolutionary (ogn-112-298) · Champion Unit · Mind · 6 + [mind] · 6 Might
 *     "[Ganking] When I conquer, you may play a spell from your trash with Energy cost less than your points
 *      without paying its Energy cost. Then recycle it. (You must still pay its Power cost.)"
 *   × Marching Orders (sfd-114-221) · Spell [Action] · Body · 3 · [Repeat] [3]
 *     "Choose a friendly unit anywhere and an enemy unit at a battlefield. They deal damage equal to their
 *      Mights to each other."
 *
 * Position: P1's turn, P1 at 4 points with 3 energy floating; Kai'Sa (6, ready) in P1's base; Marching Orders in
 * P1's trash. bf1 is P2's but empty; P2's vanilla E1 (4 Might) and E2 (1 Might) sit at bf2. Kai'Sa moves to bf1
 * and conquers it (→ 5 points); her trigger resolves and P1 picks Marching Orders.
 *
 * Question: (a) must the Repeat option be offered on this effect-play, and what does P1 pay for one vs two
 * executions? (b) Repeat paid, (Kai'Sa, E1) declared for BOTH executions: what dies — does Kai'Sa survive
 * fighting an already-lethal E1 a second time? (c) same but execution 2 = (Kai'Sa, E2). (d) where does
 * Marching Orders end up, and how many times was it "played"?
 *
 * Rules: 419.3.b (an effect-play performs every step of Play), 356.2.b.1 / 820.1.c.1 (Repeat is an optional
 * additional cost elected in Make Choices), 356.1.b.3 (only the base Energy is waived — the Repeat cost is paid
 * in full), 206 (the "less than your points" gate reads the printed cost 3), 820.2 / 820.2.a (every execution's
 * pair is declared as the spell is played and may differ), 820.3.a (played once), 417.6.b.3 (the units are the
 * damage sources, at current Might), 321 / 142.4.a / 323.5 (lethal damage kills only in the Cleanup after
 * the spell leaves the chain — E1 is still a legal, damage-dealing unit for execution 2), Kai'Sa's "Then
 * recycle it" (→ bottom of Main Deck instead of trash).
 *
 * Expected: (a) Repeat offered; one execution costs 0, two cost exactly 3 energy; one chain item P2 may respond
 * to. (b) exec 1: E1 6/4, Kai'Sa 4/6; exec 2: E1 12/4, Kai'Sa 8/6 → single Cleanup: BOTH die (a single
 * exchange would have left Kai'Sa alive at 4 damage). (c) exec 2 vs E2: E2 6/1, Kai'Sa 5/6 → E1 and E2 die,
 * Kai'Sa survives with 5 damage. (d) Marching Orders is recycled to the bottom of P1's deck; played exactly once.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-112-298";
const MARCHING_ORDERS = "sfd-114-221";
const FILLER = "ogn-175-298";

/** P1: `points`, 3 energy, Kai'Sa ready in base, Marching Orders in trash, known 2-card deck top. P2: empty bf1, E1(4)+E2(1) at bf2. */
function board(points = 4) {
  return scenario()
    .points(P1, points)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", KAISA, "kaisa")
    .unit(P2, "bf2", { might: 4, name: "Enemy E1" }, "e1")
    .unit(P2, "bf2", { might: 1, name: "Enemy E2" }, "e2")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .trash(P1, MARCHING_ORDERS, "mo");
}

/** Kai'Sa → bf1, conquer, accept her "you may", let the trigger resolve and pick Marching Orders; stops at the next P1 prompt. */
async function conquerIntoMarchingOrders(points = 4): Promise<Game> {
  const game = await board(points).build();
  await game.p1.move("kaisa", "bf1");
  await game.settle(); // empty bf1: showdown passes → conquer
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(points + 1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
  await game.p1.yes();
  // rule 355.10.a / 383.3.b — the trash is public, so the spell is a TARGET named as the trigger is
  // FINALIZED; Marching Orders is the only eligible card, so the item carries it before priority.
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "kaisa", targets: ["mo"], triggered: true }),
  ]);
  await game.settle(); // both pass → the trigger resolves and plays the named spell
  return game;
}

const isRepeatOffer = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "mo" && /\[3\]/.test(d.prompt);

/** Is `d` a prompt asking P1 to name Marching Orders' fight pair(s)? */
const isPairPrompt = (d: Decision | null): boolean =>
  d?.kind === "pick" && d.seat === P1 && d.options.some((o) => ["kaisa", "e1", "e2"].includes((o.card ?? o.key) as string));

/**
 * Answer Marching Orders' play dialog: Repeat yes/no, then any pair prompts with `pairs` (flattened, execution
 * order). Stops at the first priority window. Returns whether a pair prompt was actually asked.
 */
async function makeChoices(game: Game, repeat: boolean, pairs: readonly string[]): Promise<boolean> {
  const queue = [...pairs];
  let asked = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1 || d.kind === "action") {
      break;
    }
    if (isRepeatOffer(d)) {
      await game.p1.answer(repeat);
    } else if (d.kind === "pick" && isPairPrompt(d)) {
      asked = true;
      if (queue.length === 0) {
        queue.push(...pairs); // fewer pairs than executions ⇒ name the same pair again
      }
      // a pair may be asked as one tuple pick or slot by slot, and a role the play already
      // locked is not re-asked — take the next wanted object this prompt can actually accept
      const legal = new Set(d.options.map((o) => (o.card ?? o.key) as string));
      const keys: string[] = [];
      const max = Math.max(1, d.max);
      while (keys.length < max) {
        const at = queue.findIndex((k) => legal.has(k) && !keys.includes(k));
        if (at < 0) break;
        keys.push(...queue.splice(at, 1));
      }
      await game.p1.pick(...(keys.length > 0 ? keys : [(d.options[0]?.card ?? d.options[0]?.key) as string]));
    } else {
      break;
    }
  }
  return asked;
}

/** Pass priority around until the chain is empty (answering nothing else). */
async function resolveChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Kai'Sa's conquer effect-play of Marching Orders — Repeat still offered, pairs per execution, deaths wait for one Cleanup", () => {
  // ── (a) the Repeat election and what is paid ──────────────────────────────────────────────────

  test("(a) the effect-play still runs Make Choices: right after P1 names Marching Orders it sits on the chain as ONE (non-triggered) spell item and P1 is offered its optional [Repeat] [3] — nothing paid yet (419.3.b, 356.2.b.1, 820.1.c.1)", async () => {
    const game = await conquerIntoMarchingOrders();
    expect(game.zoneOf("mo")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mo", controller: P1, type: "spell" })]);
    const d = game.decision();
    expect(isRepeatOffer(d)).toBe(true);
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.p1.energy()).toBe(3);
  });

  test("(a) ONE execution costs P1 nothing: declining Repeat leaves all 3 energy floating (Kai'Sa waives the base Energy cost; Marching Orders has no Power cost)", async () => {
    const game = await conquerIntoMarchingOrders();
    await makeChoices(game, false, ["kaisa", "e1"]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mo", controller: P1, triggered: false, type: "spell" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) TWO executions cost exactly 3: the Repeat cost is an additional cost added after the waiver and paid in full (356.1.b.3) — energy 3 → 0, still a single chain item that P2 gets a priority window to respond to", async () => {
    const game = await conquerIntoMarchingOrders();
    await makeChoices(game, true, ["kaisa", "e1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().filter((i) => i.cardId === "mo")).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("mo")).toBe("chain"); // nothing has resolved yet
    expect(game.state("e1").damage).toBe(0);
  });

  test("(a) eligibility reads the PRINTED cost (206): at 5 points the 3-cost Action spell is offered from the trash on P1's turn; from 2 points (→ 3 after the conquer) '3 < 3' fails and Marching Orders is never offered — it stays in the trash", async () => {
    const game = await board(2).build();
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(3);
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.answer(d.canAccept !== false);
        await game.settle();
      } else {
        break;
      }
    }
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).not.toContain("mo");
    await game.settle();
    expect(game.zoneOf("mo")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // BUG — expected (820.2 / 820.2.a / 355.5 via 419.3.b): the pairs for BOTH executions are declared as the spell
  // is played — a P1 prompt naming Kai'Sa / E1 / E2 before anyone gets priority, and the finalized item carries
  // them. Actual: the effect-play of a fight spell never asks for its pair; the item is finalized with no targets
  // and the engine binds "first friendly unit / first enemy unit at a battlefield" on its own at resolution.
  test("(a) after electing Repeat, P1 is asked to declare the (friendly, enemy) pair for each execution BEFORE the priority window, and the chain item records them (820.2, 820.2.a)", async () => {
    const game = await conquerIntoMarchingOrders();
    const asked = await makeChoices(game, true, ["kaisa", "e1", "kaisa", "e2"]);
    expect(asked).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()[0]?.targets ?? []).toEqual(expect.arrayContaining(["kaisa", "e1", "e2"]));
  });

  // ── (b) (Kai'Sa, E1) twice ────────────────────────────────────────────────────────────────────

  test("(b) contrast first — ONE execution (Kai'Sa, E1): E1 takes 6 ≥ 4 and dies in the Cleanup after the spell; Kai'Sa takes 4 < 6 and SURVIVES at bf1 with 4 damage; E2 untouched", async () => {
    const game = await conquerIntoMarchingOrders();
    await makeChoices(game, false, ["kaisa", "e1"]);
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.state("kaisa")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.state("e2")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.violations()).toEqual([]);
  });

  test("(b) Repeat paid, (Kai'Sa, E1) for BOTH executions: E1 is still on the board and still deals its 4 during execution 2 (no Cleanup mid-resolution — 321, 142.4.a) → Kai'Sa 4+4 = 8 ≥ 6: in the single Cleanup after the spell BOTH Kai'Sa and E1 die; E2 untouched", async () => {
    const game = await conquerIntoMarchingOrders();
    await makeChoices(game, true, ["kaisa", "e1"]); // one pair = the same pair for both executions
    expect(game.chain()).toHaveLength(1);
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.p1.trash()).toContain("kaisa");
    expect(game.p2.trash()).toEqual(["e1"]);
    expect(game.state("e2")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) (Kai'Sa, E1) then (Kai'Sa, E2) ────────────────────────────────────────────────────────

  // BUG — expected (820.2.a): execution 2 may name a DIFFERENT pair. (Kai'Sa,E1) then (Kai'Sa,E2): E1 6/4, E2 6/1,
  // Kai'Sa 4+1 = 5/6 → Cleanup: E1 and E2 die, Kai'Sa survives with 5 damage. Actual: no pair can be declared on
  // the effect-play (see the BUG above); the engine fights Kai'Sa into E1 twice, so Kai'Sa dies and E2 lives.
  test("(c) exec 1 = (Kai'Sa, E1), exec 2 = (Kai'Sa, E2): E1 and E2 both die, Kai'Sa SURVIVES at bf1 with exactly 5 damage (820.2.a, 417.6.b.3)", async () => {
    const game = await conquerIntoMarchingOrders();
    await makeChoices(game, true, ["kaisa", "e1", "kaisa", "e2"]);
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    expect(game.state("kaisa")).toMatchObject({ damage: 5, zone: "battlefield-bf1" });
  });

  // ── (d) where Marching Orders goes / played once ──────────────────────────────────────────────

  test("(d) 'Then recycle it': when Marching Orders finishes resolving it goes to the BOTTOM of P1's Main Deck — not the trash, not banishment — whether or not Repeat was paid", async () => {
    for (const repeat of [false, true]) {
      const game = await conquerIntoMarchingOrders();
      await makeChoices(game, repeat, ["kaisa", "e1"]);
      await resolveChain(game);
      await game.settle();
      expect(game.zoneOf("mo")).toBe("mainDeck");
      expect(game.p1.deck().at(-1)).toBe("mo");
      expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
      expect(game.p1.trash()).not.toContain("mo");
      expect(game.p1.banishment()).toEqual([]);
    }
  });

  test("(d) it was PLAYED exactly once however many executions ran (820.3.a): a single Marching Orders item ever sat on the chain and P1's cards-played tally reads 1 (Kai'Sa moved, she was not played)", async () => {
    const game = await conquerIntoMarchingOrders();
    await makeChoices(game, true, ["kaisa", "e1"]);
    expect(game.chain().filter((i) => i.cardId === "mo")).toHaveLength(1);
    await resolveChain(game);
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.p1.points()).toBe(5); // the conquer point; nothing else scored
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
