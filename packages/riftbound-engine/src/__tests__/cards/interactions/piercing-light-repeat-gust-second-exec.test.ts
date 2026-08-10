/**
 * Interaction: Piercing Light (sfd-023-221) cast with [Repeat], one execution per enemy unit, answered by Gust
 * (ogn-169-298) on one of them — with Ravenbloom Student (ogn-103-298) listening.
 *
 *   Piercing Light — Spell (Action) · Fury · [2][fury]
 *     "[Repeat] [2][fury] — Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   Gust — Spell (Reaction) · Chaos · [1]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Ravenbloom Student — Unit · Mind · 2 · 2 Might — "When you play a spell, give me +1 [Might] this turn."
 *
 * Rules: 820.1.c.1 (the Repeat cost is an ADDITIONAL cost paid while playing), 820.2.a (each execution makes its
 * own choices), 820.3.a (however many executions, the spell is Played ONCE); 359.3.e.2 (a target that went to a
 * non-board zone is illegal), 359.3.e.5 / .e.7 (instructions on an illegal target are not followed; the rest
 * resolve), 359.3.e.10 (a spell none of whose instructions run is still played — "when you play a spell" still
 * triggers); 419.4.a (play triggers fire when the card finishes resolving); 321 + 142.4.a + 323.5 (no Cleanup —
 * hence no death — while a chain item is resolving; lethal damage kills in the Cleanup afterwards).
 *
 * Board: P1's turn, Ravenbloom Student (2) in P1's base, 4 energy + 2 fury. P2: X (3 Might) at bf1, Z (3 Might) at
 * bf2, Gust in hand with 1 energy. P1 casts Piercing Light paying Repeat: execution 1 → X (no other unit),
 * execution 2 → Z (no other unit) — harness `targets: ["x", "z"]` = execution order.
 *
 * Question / expected:
 *   (a) P2 Gusts Z in response. Gust resolves first (Z → hand). Execution 1: X takes 2 (2/3, alive). Execution 2's
 *       only instruction has no legal target → ignored. Spell resolves, played ONCE → Student +1 (3), not +2/+0.
 *       Nothing refunded: P1 is at 0 energy / 0 fury.
 *   (b) P2 Gusts X instead: execution 1 ignored, execution 2 deals 2 to Z (2/3); Student +1.
 *   (c) No Gust, both executions on X: 2 then 2 more (no death check between executions) → X dies in the Cleanup
 *       after the spell hits the trash; Student +1 once.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const GUST = "ogn-169-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "x")
    .unit(P2, "bf2", { might: 3, name: "Unit Z" }, "z")
    .hand(P1, PIERCING_LIGHT, "pl")
    .hand(P2, GUST, "gust");
}

/** Execution 1 → X alone, execution 2 → Z alone (820.2.a). */
const X_THEN_Z = { repeat: 1, targets: ["x", "z"] } as const;

/** Pass priority (whoever holds it) until `done()` or the chain is gone. */
async function passUntil(game: Game, done: () => boolean): Promise<void> {
  for (let i = 0; i < 12 && !done(); i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** P1 casts Piercing Light (Repeat paid, X then Z); P1 passes; P2 answers with Gust on `gusted`. */
async function castThenGust(gusted: "x" | "z"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pl", X_THEN_Z);
  await game.p1.passPriority();
  await game.p2.cast("gust", { targets: gusted });
  return game;
}

describe("Piercing Light [Repeat] X→Z, Gust in response — per-execution targets, played once, no refund", () => {
  test("setup: the Repeat line X-then-Z is offered and castable from exactly 4 energy + 2 fury; paying it empties the pool at PLAY time (820.1.c.1) and puts ONE item on the chain naming X and Z", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "pl")?.fields ?? [];
    expect(fields.find((f) => f.name === "repeatCount")).toMatchObject({ max: 1, min: 0 });
    expect((fields.find((f) => f.name === "targets")?.options ?? []).map((o) => JSON.stringify(o))).toContain(JSON.stringify(["x", "z"]));
    const r = await game.p1.cast("pl", X_THEN_Z);
    expect(r.executed.map((m) => m.moveId)).toEqual(["playSpell"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1, targets: ["x", "z"], triggered: false, type: "spell" })]);
    // 419.4.a — nothing has been "played" yet as far as the Student is concerned.
    expect(game.state("student").might).toBe(2);
    // too little of either resource → not castable with Repeat
    const poorE = await board().resources(P1, { energy: 3, power: { fury: 2 } }).build();
    expect((await poorE.p1.try((p) => p.cast("pl", X_THEN_Z))).ok).toBe(false);
    const poorF = await board().resources(P1, { energy: 4, power: { fury: 1 } }).build();
    expect((await poorF.p1.try((p) => p.cast("pl", X_THEN_Z))).ok).toBe(false);
  });

  test("Gust (Reaction) is legal for P2 in response and offers exactly the two 3-Might battlefield units (not the Student in base); it goes on top of Piercing Light and resolves FIRST — Z is in P2's hand while Piercing Light still waits", async () => {
    const game = await board().build();
    await game.p1.cast("pl", X_THEN_Z);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].toSorted()).toEqual(["x", "z"]);
    await game.p2.cast("gust", { targets: "z" });
    expect(game.chain().map((c) => c.name)).toEqual(["Piercing Light", "Gust"]);
    await passUntil(game, () => game.chain().length === 1);
    expect(game.chain().map((c) => c.name)).toEqual(["Piercing Light"]);
    expect(game.zoneOf("z")).toBe("hand");
    expect(game.state("z").owner).toBe(P2);
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    expect(game.state("x").damage).toBe(0); // nothing of Piercing Light has happened yet
  });

  // ── (a) Gust on Z ────────────────────────────────────────────────────────────────────────────

  // Expected (820.2.a + 359.3.e.5/.e.7): execution 1 = X alone → X takes exactly 2 and survives (2/3); execution
  // 2 = Z alone, Z is in hand → that Deal 2 is simply not followed. Actual: the engine resolves the two ids as ONE
  // shared (first unit, "other" unit) pair run for BOTH executions, so X is dealt 2 twice and dies.
  test("(a) Gust on Z — execution 1 still resolves on X for exactly 2 (X survives at 2 damage) and execution 2 is skipped entirely (820.2.a, 359.3.e.2/.e.5/.e.7)", async () => {
    const game = await castThenGust("z");
    await game.settle();
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("z")).toBe("hand");
    expect(game.state("x")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["x"]);
  });

  test("(a) Gust on Z — the spell still resolves and counts as played exactly ONCE: Ravenbloom Student +1 → 3 Might (not +2 for two executions, not +0 for the fizzled half) (820.3.a, 359.3.e.10, 419.4.a)", async () => {
    const game = await castThenGust("z");
    expect(game.state("student").might).toBe(2); // still on the chain
    await game.settle();
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.state("student").might).toBe(3);
    expect(game.state("student").mightModifier).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("(a) Gust on Z — none of the Repeat cost comes back: P1 ends on 0 energy / 0 fury having spent 4 + [fury][fury] (820.1.c.1); P2 spent its 1 energy on Gust; Z sits in P2's hand undamaged, both spells in trash", async () => {
    const game = await castThenGust("z");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.energy()).toBe(0);
    expect(game.zoneOf("z")).toBe("hand");
    expect(game.p2.hand()).toEqual(["z"]);
    expect(game.state("z").damage).toBe(0);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) the Student's +1 lasts 'this turn' only", async () => {
    const game = await castThenGust("z");
    await game.settle();
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });

  // ── (b) Gust on X ────────────────────────────────────────────────────────────────────────────

  // Expected: execution 1 (X, now in hand) is ignored; execution 2 deals exactly 2 to Z → Z 2/3, alive. Actual:
  // as in (a) the shared pair runs twice, so Z is dealt 2 by each execution and dies.
  test("(b) Gust on X — execution 1 is ignored and execution 2 deals exactly 2 to Z, which survives at 2 damage (820.2.a, 359.3.e.5)", async () => {
    const game = await castThenGust("x");
    await game.settle();
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.state("z")).toMatchObject({ damage: 2, zone: "battlefield-bf2" });
  });

  test("(b) Gust on X — X is safe in P2's hand (undamaged), Z IS hit by the surviving execution, the spell resolves and Student gets its single +1; P1 still at 0/0", async () => {
    const game = await castThenGust("x");
    await passUntil(game, () => game.chain().length === 1);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.state("z").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.state("x").damage).toBe(0);
    const z = game.state("z");
    expect(z.zone === "trash" || z.damage >= 2).toBe(true); // dealt damage by execution 2 (exact amount: see BUG above)
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.state("student").might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  // ── (c) both executions on X, no Gust ─────────────────────────────────────────────────────────

  test.failing("BUG: (c) no Gust, BOTH executions name X: the second Deal 2 is not skipped for 'already lethal' — X (3 Might) takes 2 + 2 and is dead once the spell has resolved, in the trash together with Piercing Light; Z untouched (321, 142.4.a, 323.5)", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { repeat: 1, targets: ["x", "x"] });
    expect(game.chain()).toHaveLength(1);
    expect(game.zoneOf("x")).toBe("battlefield-bf1"); // no death mid-chain: nothing has resolved yet
    await game.settle();
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash"); // 2 damage alone would not kill a 3-Might unit → the second Deal landed
    expect(game.state("z")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: (c) …and the spell was still played once: Student +1 → 3, P1 paid the full 4 + [fury][fury]", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { repeat: 1, targets: ["x", "x"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.state("student").mightModifier).toBe(1);
  });

  test("contrast — without Repeat a single execution on X costs only [2][fury], leaves X at 2/3 alive, Z untouched, and gives the Student the same single +1", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["x"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    await game.settle();
    expect(game.state("x")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("z").damage).toBe(0);
    expect(game.state("student").might).toBe(3);
  });
});
