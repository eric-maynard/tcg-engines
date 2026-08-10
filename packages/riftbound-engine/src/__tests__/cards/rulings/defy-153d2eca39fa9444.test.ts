/**
 * Ruling 153d2eca39fa9444 — Defy (OGN-045 → ogn-045-298) × Thrill of the Hunt (UNL-184 → unl-184-219)
 *   Defy: 1 + [calm] [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   Thrill of the Hunt: 2 + [rainbow] [Reaction] "Banish a friendly unit, then its owner plays it to any battlefield,
 *   ignoring its cost."
 *
 * Q: Opponent Defies my Thrill of the Hunt — do I banish first (and the unit is stranded), or does Defy stop the
 *    banish? How do I tell "pay first" costs from effects?
 * A: Thrill is countered before any of its text executes: "Banish a friendly unit" is an INSTRUCTION (effect), not
 *    an additional cost, so no unit is banished and nothing is replayed. The play cost (2 + 1 power) was paid on
 *    casting and is not refunded. A countered spell is cleared to trash and not considered played (for triggers).
 * Rules: 425.1.a/.a.1 (countered → does nothing, to trash), 425.1.b + 419.4.a.1 (play-triggers don't fire),
 *        425.1.c (no refund), 419.4.b (it WAS Finalized — non-trigger "cards played" checks still count it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const THRILL = "unl-184-219";
const RAVENBLOOM_STUDENT = "ogn-103-298"; // 2 Might — "When you play a spell, give me +1 [Might] this turn." (a play-TRIGGER witness)

/**
 * P1's turn. P1: Hunter (3) + Ravenbloom Student (2) in base, Thrill in hand with exactly 2 energy + 1 power.
 * Two battlefields (bf1 open, bf2 P2's with a Wall). P2: Defy with exactly 1 + [calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { energyCost: 3, might: 3, name: "Hunter" }, "hunter")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, THRILL, "thrill")
    .hand(P2, DEFY, "defy");
}

/** Step 1: P1 casts Thrill naming the Hunter. */
async function castThrill(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("thrill", { targets: "hunter" });
  return game;
}

describe("Ruling 153d2eca39fa9444 — Defy on Thrill of the Hunt: cost stays paid, but no banish and no replay", () => {
  test("step 1: casting Thrill pays 2 + [rainbow] up front and puts it on the chain as a Finalized item — the Hunter is NOT banished yet (the banish is effect text, not a cost)", async () => {
    const game = await castThrill();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "thrill", controller: P1, targets: ["hunter"] })]);
    expect(game.zoneOf("hunter")).toBe("base");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state("student").might).toBe(2); // play-triggers wait for the spell to resolve (419.4.a)
  });

  test("step 2: Thrill (cost 2, one power) is a legal Defy target; P2 casts Defy on top of it", async () => {
    const game = await castThrill();
    await game.p1.passPriority();
    const offered = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["thrill"]);
    await game.p2.cast("defy", { targets: "thrill" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["thrill", "defy"]);
  });

  test("steps 3–4: Defy resolves first and counters Thrill → Thrill goes to trash having done NOTHING: Hunter still in base (never banished, never replayed), no showdown, and the 2 + [rainbow] is not refunded", async () => {
    const game = await castThrill();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "thrill" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("hunter")).toBe("base");
    expect(game.state("hunter")).toMatchObject({ isExhausted: false, location: "base" });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 425.1.c
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'not considered played' (425.1.b / 419.4.a.1): the Ravenbloom Student's 'when you play a spell' trigger never fires for the countered Thrill — still 2 Might; yet Thrill WAS Finalized, so the plain cards-played tally reads 1 (419.4.b)", async () => {
    const game = await castThrill();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "thrill" });
    await game.settle();
    expect(game.state("student").might).toBe(2);
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1, [P2]: 1 });
  });

  test("control (no Defy): Thrill resolves — Hunter is banished, then P1 (its owner) CHOOSES a battlefield and plays it there ignoring cost; the Student's play-trigger fires (+1 → 3)", async () => {
    const game = await castThrill();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    const dests = d?.kind === "pick" ? d.options.map((o) => String(o.zone ?? o.card ?? o.key)) : [];
    expect(dests.some((x) => x.includes("bf1"))).toBe(true);
    expect(dests.some((x) => x.includes("bf2"))).toBe(true);
    expect(dests.some((x) => x === "base")).toBe(false); // "to any battlefield"
    await game.p1.pick(dests.find((x) => x.includes("bf1")) as string);
    await game.settle();
    expect(game.zoneOf("hunter")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(0); // "ignoring its cost"
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.state("student").might).toBe(3);
  });
});
