/**
 * Interaction: Rebuttal (ven-152-166) × Cull the Weak (ogn-209-298) × Ravenbloom Student (ogn-103-298)
 *
 *   Rebuttal — Spell (Reaction) · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   Cull the Weak — Spell (Action) · Order · 2 + [order]   "Each player kills one of their units."
 *   Ravenbloom Student — Unit · Mind · 2 · 2 Might         "When you play a spell, give me +1 [Might] this turn."
 *
 * Rules: 355.10.e ("Each player kills a unit they control" does NOT target — every player, caster
 * included, chooses as the spell resolves), 355.17 (choices not listed under finalization are made on
 * resolution), 752 / 752.1 (new choices = the FINALIZATION choices: locations, modes, destinations,
 * targets), 753.2 (a player may not elect to make new choices when there are no legal ones), 340.4
 * (after an item resolves the controller of the newest chain item gets priority), 359.3.d (a resolved
 * spell goes to its OWNER's trash), 303.2.a (simultaneous actions are sequenced in turn order from the
 * turn player). Ruling (Mystic Reversal / Ravenbloom Student): "when you play" triggers happen when the
 * spell finishes resolving and go to whoever controls it then; the thief's Student gets +1 from the
 * steal spell AND +1 from the stolen spell; the original caster's Student gets nothing.
 *
 * Question: P1's turn. Each player has two vanilla units plus their own Ravenbloom Student. P1 casts
 * Cull the Weak; P2 Rebuttals it and pays [rainbow]. (a) Is there anything to re-choose — may P2 now
 * pre-select which of P1's units dies? (b) How does resolution proceed and what did the steal change?
 * (c) Contrast: P2 declines to pay (counter).
 *
 * Expected: (a) Nothing to re-choose — the per-player kills are not targets; the engine must skip the
 * new-choices step or offer only "keep as is"; it must never let P2 pick units (least of all P1's).
 * (b) Cull stays finalized under P2, P2 gets priority; on resolution each player in turn order kills
 * one of THEIR OWN units — same board outcome as un-stolen. Difference: P2's Student +2 (Rebuttal +
 * stolen Cull), P1's Student +0; Cull → P1's trash; P1's 2+[order] gone. (c) Countered: nobody dies,
 * P2's Student +1 (Rebuttal only), P2 keeps the rainbow.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const CULL_THE_WEAK = "ogn-209-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

const P1_UNITS = ["a1", "a2", "s1"];
const P2_UNITS = ["b1", "b2", "s2"];

/**
 * P1's turn (default). P1: Weakling a1 (1), Brute a2 (4), Student s1 (2) — exactly affords Cull (2 + order).
 * P2: Weakling b1 (1), Brute b2 (4), Student s2 (2) — affords Rebuttal (1 + chaos) plus `extra` for [rainbow].
 */
function board(extra: Record<string, number> = { rainbow: 1 }) {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1, ...extra } })
    .unit(P1, "base", { might: 1, name: "P1 Weakling" }, "a1")
    .unit(P1, "base", { might: 4, name: "P1 Brute" }, "a2")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "s1")
    .unit(P2, "base", { might: 1, name: "P2 Weakling" }, "b1")
    .unit(P2, "base", { might: 4, name: "P2 Brute" }, "b2")
    .unit(P2, "base", RAVENBLOOM_STUDENT, "s2")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P2, REBUTTAL, "reb");
}

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1 casts Cull the Weak making NO play-time pick (355.10.e — the per-player kills are chosen on
 * resolution; `preselect` exercises the engine's optional play-time slot instead), P1 passes, P2
 * Rebuttals it, both pass → Rebuttal resolves and P2 faces the "pay [rainbow]?" prompt.
 */
async function rebutted(preselect: string[] = [], extra?: Record<string, number>): Promise<Game> {
  const game = await board(extra).build();
  await game.p1.cast("cull", { targets: preselect });
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: "cull" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cull", "reb"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  if (extra === undefined) {
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
  }
  return game;
}

/** The new-choices prompt (if any) P2 sees right after paying, while Cull is still on the chain; null when P2 goes straight to priority. */
function newChoicesPrompt(game: Game) {
  const d = game.decision();
  if (!d || d.kind === "action" || d.seat !== P2 || !game.chain().some((c) => c.cardId === "cull")) {
    return null;
  }
  return d;
}

/** "You MAY make new choices" — keep everything as is (decline whatever re-choice prompt is shown). */
async function keepAsIs(game: Game): Promise<void> {
  const d = newChoicesPrompt(game);
  if (d?.kind === "pick" && d.allowDecline) {
    await game.p2.decline();
  } else if (d?.kind === "yes-no") {
    await game.p2.no();
  }
}

interface Asked {
  seat: Seat;
  options: string[];
}

/**
 * Pass priority around and answer every resolution-time "kill one of your units" prompt from `picks`
 * until the chain is empty and nobody is being asked anything. Returns who was asked, in order, with
 * the options each was shown.
 */
async function resolveEverything(game: Game, picks: Record<Seat, string> = { [P1]: "a1", [P2]: "b1" }): Promise<Asked[]> {
  const asked: Asked[] = [];
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (game.chain().length === 0) {
        break;
      }
      await game.acting().passPriority();
      continue;
    }
    if (d.kind === "pick") {
      const options = d.options.map((o) => o.card ?? o.key);
      asked.push({ options, seat: d.seat });
      await game.seat(d.seat).pick(picks[d.seat] ?? options[0] ?? "");
      continue;
    }
    break;
  }
  return asked;
}

describe("Rebuttal × Cull the Weak — (a) there is nothing to re-choose", () => {
  // Expected (355.10.e): "each player kills one of their units" is not targeting — the caster makes no
  // unit choice while playing it, so the cast should offer no unit at all. Actual: the engine models the
  // caster's own kill as an optional ("up to 1") play-time target slot and offers a1 / a2 / s1.
  test.failing("BUG: Cull the Weak offers the caster's own units as play-time targets; 355.10.e says the per-player picks are made on resolution and are not targets", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "cull")).toBe(true);
    expect(targetsOffered(game, P1, "cull")).toEqual([]);
  });

  test("cast with no pick: the chain item carries no targets, P1 paid 2 + [order], and P2 may Rebuttal it (cost 2 ≤ 4) once P1 passes", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: [] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1, targets: [], triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "reb")).toBe(true);
    expect(targetsOffered(game, P2, "reb")).toEqual(["cull"]);
  });

  test("after P2 pays, whatever the engine shows P2 never offers P1's units — P2 cannot pre-select which of P1's units dies", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = newChoicesPrompt(game);
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    for (const u of P1_UNITS) {
      expect(offered).not.toContain(u);
    }
    // and nothing has died yet — the kills happen on resolution
    for (const u of [...P1_UNITS, ...P2_UNITS]) {
      expect(game.zoneOf(u)).toBe("base");
    }
  });

  // 752.1 / 753.2: the re-choosable set is {locations, modes, destinations, targets}; Cull the Weak has none
  // of these (355.10.e — "each player kills one of their units" is not targeting), so no Decision is raised
  // (P2 goes straight to priority) — never a unit pick.
  test("paying for Rebuttal on Cull the Weak raises NO unit re-choice; there are no finalization choices to remake (752.1, 753.2)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    const d = newChoicesPrompt(game);
    const unitOptions = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).filter((c) => [...P1_UNITS, ...P2_UNITS].includes(c)) : [];
    expect(unitOptions).toEqual([]);
  });
});

describe("Rebuttal × Cull the Weak — (b) paid: resolution under P2's control", () => {
  test("Cull the Weak stays finalized and un-countered with controller P2; Rebuttal → P2's trash; P2 spent 1 + chaos + rainbow; P2 holds priority (340.4)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await keepAsIs(game);
    expect(game.chain()[0]).toMatchObject({ cardId: "cull", controller: P2, countered: false });
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p2.trash()).toContain("reb");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
  });

  test("P2's Student triggers off Rebuttal resolving: its +1 goes on the chain ABOVE the stolen Cull (ruling)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await keepAsIs(game);
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["cull", P2, false],
      ["s2", P2, true],
    ]);
  });

  test("on resolution EACH player is asked to kill one of THEIR OWN units — P1 chooses among exactly {a1,a2,s1}, P2 among exactly {b1,b2,s2} (355.10.e)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await keepAsIs(game);
    const asked = await resolveEverything(game);
    expect(asked).toHaveLength(2);
    const bySeat = Object.fromEntries(asked.map((a) => [a.seat, [...a.options].sort()]));
    expect(bySeat[P1]).toEqual([...P1_UNITS].sort());
    expect(bySeat[P2]).toEqual([...P2_UNITS].sort());
  });

  // Expected (303.2.a): the simultaneous per-player choices are sequenced in turn order starting with the
  // turn player — P1 first, then P2 — regardless of who controls the spell. Actual: the engine asks the
  // spell's controller (P2) first.
  test.failing("BUG: stolen Cull the Weak asks its controller P2 to choose first; simultaneous choices go in turn order from the turn player P1 (303.2.a)", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await keepAsIs(game);
    const asked = await resolveEverything(game);
    expect(asked.map((a) => a.seat)).toEqual([P1, P2]);
  });

  test("board outcome is identical to the un-stolen spell: a1 → P1's trash, b1 → P2's trash, everyone else stays", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await keepAsIs(game);
    await resolveEverything(game);
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.p1.trash()).toContain("a1");
    expect(game.zoneOf("b1")).toBe("trash");
    expect(game.p2.trash()).toContain("b1");
    for (const u of ["a2", "s1", "b2", "s2"]) {
      expect(game.zoneOf(u)).toBe("base");
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the resolved Cull the Weak goes to its OWNER P1's trash (359.3.d); P1's 2 energy + [order] are not refunded", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await keepAsIs(game);
    await resolveEverything(game);
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.state("cull").owner).toBe(P1);
    expect(game.p1.trash()).toContain("cull");
    expect(game.p2.trash()).not.toContain("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("what the steal changed: P2's Student ends on 4 (= 2, +1 Rebuttal, +1 stolen Cull 'played' by P2 at resolution); P1's Student stays 2 — P1 never finished playing it", async () => {
    const game = await rebutted();
    await game.p2.yes();
    await keepAsIs(game);
    await resolveEverything(game);
    expect(game.state("s2")).toMatchObject({ baseMight: 2, might: 4 });
    expect(game.state("s1")).toMatchObject({ baseMight: 2, might: 2 });
  });

  // Expected: even if P1 used the engine's play-time slot to name a1, that pick is not a target; after the
  // steal (kept as is) resolution still has each player kill one of their own units → a1 and b1 die.
  // Actual: the stolen item keeps "targets: [a1]", a1 is not friendly to the new controller P2, and the
  // whole effect fizzles — nobody is asked and no unit dies.
  test.failing("BUG: with a play-time pre-pick, a stolen-and-kept Cull the Weak kills nothing; each player must still kill one of their units on resolution (355.10.e)", async () => {
    const game = await rebutted(["a1"]);
    await game.p2.yes();
    await keepAsIs(game);
    const asked = await resolveEverything(game);
    expect(asked.map((a) => a.seat)).toContain(P2);
    expect(game.p1.trash()).toContain("a1");
    expect(game.p2.trash().filter((c) => P2_UNITS.includes(c))).toHaveLength(1);
  });
});

describe("Rebuttal × Cull the Weak — (c) not paid: countered", () => {
  test("declining the [rainbow]: Cull the Weak is countered — nobody is asked to kill anything and all six units stay on the board", async () => {
    const game = await rebutted();
    await game.p2.no();
    expect(game.chain().some((c) => c.cardId === "cull")).toBe(false);
    const asked = await resolveEverything(game);
    expect(asked).toEqual([]);
    for (const u of [...P1_UNITS, ...P2_UNITS]) {
      expect(game.zoneOf(u)).toBe("base");
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("countered Cull → its owner P1's trash, cost not refunded; P2 keeps the unspent rainbow; Rebuttal → P2's trash", async () => {
    const game = await rebutted();
    await game.p2.no();
    await resolveEverything(game);
    expect(game.p1.trash()).toEqual(["cull"]);
    expect(game.p2.trash()).toEqual(["reb"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } });
  });

  test("nobody 'played' Cull the Weak: P2's Student gets +1 from Rebuttal only (→ 3), P1's Student nothing (→ 2)", async () => {
    const game = await rebutted();
    await game.p2.no();
    await resolveEverything(game);
    expect(game.state("s2").might).toBe(3);
    expect(game.state("s1").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("with no rainbow available there is nothing to accept (prompt skipped or 'yes' unavailable) — Rebuttal simply counters", async () => {
    const game = await rebutted([], {});
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(false);
      await game.p2.no();
    }
    expect(game.chain().some((c) => c.cardId === "cull")).toBe(false);
    await resolveEverything(game);
    expect(game.zoneOf("a1")).toBe("base");
    expect(game.zoneOf("b1")).toBe("base");
    expect(game.p1.trash()).toContain("cull");
  });
});

describe("control: Cull the Weak with no Rebuttal", () => {
  test("each player is asked on resolution (P1 = turn player and controller first), a1 and b1 die, P1's Student +1 (→ 3), P2's Student untouched (2)", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: [] });
    const asked = await resolveEverything(game);
    expect(asked.map((a) => a.seat)).toEqual([P1, P2]);
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("b1")).toBe("trash");
    expect(game.p1.trash()).toContain("cull");
    expect(game.state("s1").might).toBe(3);
    expect(game.state("s2").might).toBe(2);
    expect(game.p2.hand()).toContain("reb");
    expect(game.violations()).toEqual([]);
  });
});
