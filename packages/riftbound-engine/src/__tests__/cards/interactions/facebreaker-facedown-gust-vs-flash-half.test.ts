/**
 * Interaction: Facebreaker (ogn-220-298) · Spell · Order · 2 energy
 *     "[Hidden] [Action] Stun a friendly unit and an enemy unit at the same battlefield.
 *      (They don't deal combat damage this turn.)"
 *   × Gust  (ogn-169-298) "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its
 *      owner's hand."
 *   × Flash (ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *
 * Question: P1 controls bf1 with defender F (3 Might) and has Facebreaker facedown there. P2 attacks
 * bf1 with E (5 Might); the combat showdown opens. P1 flips Facebreaker for 0 choosing F and E.
 *   (a) Could P1 have chosen a friendly/enemy pair at bf2 instead? Could P1 flip it at all if only
 *       friendly units were at bf1?
 *   (b) P2 responds with Gust returning F to hand — is E still stunned? What happens to the combat?
 *   (c) P2 responds with Flash moving E to base — is F still stunned? Is another enemy re-picked?
 *   (d) No response baseline.
 *
 * Rules:
 *   811.1.d.2 / 811.1.d.2.a — from facedown, each target role that CAN be satisfied at the hidden
 *       battlefield MUST be; 811.1.d + 355.8 — no valid enemy there → cannot be played from hidden.
 *   811.3 — from hand: full cost, Action timing, no battlefield-of-origin restriction.
 *   359.3.e.4 — F bounced to hand is a new object (illegal target); 359.3.e.5 — E moved to base is no
 *       longer "an enemy unit at [that] battlefield" → unaffected; 359.3.e.8 — one instruction, two
 *       targets: it still executes on the remaining legal target; 355.15 — nothing is re-chosen.
 *   465.1 — combat damage needs both sides present; 466.3.a / 466.5.d — sole remaining side wins and
 *       (if attacker) conquers; 466.1.a.2 — surviving attackers are recalled if defenders remain;
 *       423.1.b — stunned units contribute no combat damage.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const GUST = "ogn-169-298";
const FLASH = "ogs-011-024";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 3, P2's turn (Facebreaker was hidden on an earlier turn). P1 controls bf1 with F (3) and the
 * facedown Facebreaker; bf2 is uncontrolled with one small unit per side (the "other pair").
 * P2's E (5) starts in base and attacks bf1. P2 holds Gust + Flash with 3 energy (enough for either).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Defender F" }, "F")
    .unit(P2, "base", { might: 5, name: "Attacker E" }, "E")
    .unit(P1, "bf2", { might: 2, name: "P1 Bf2 Unit" }, "F2")
    .unit(P2, "bf2", { might: 2, name: "P2 Bf2 Unit" }, "E2")
    .facedown(P1, "bf1", FACEBREAKER, "fb")
    .hand(P2, GUST, "gust")
    .hand(P2, FLASH, "flash");
}

/** E attacks bf1, P2 passes Focus, P1 flips Facebreaker (targets F + E). P1 now holds priority. */
async function flipped(s = board()): Promise<G> {
  const game = await s.build();
  await game.p2.move("E", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "fb")).toBe(true);
  await game.p1.reveal("fb");
  return game;
}

describe("Facebreaker from facedown × Gust / Flash — half the targets go illegal", () => {
  // ── (a) targeting restrictions from facedown ────────────────────────────────────────────────

  test("(a) flipped for 0 during the combat showdown: both roles are forced to the bf1 pair [F, E] — the bf2 pair is never an option (811.1.d.2)", async () => {
    const game = await flipped();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } }); // played from hidden ignoring cost
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "fb", controller: P1, targets: ["F", "E"] });
    // Nothing was asked: with exactly one friendly and one enemy at bf1 the choice is locked.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) with two friendlies at bf1 the friendly role is asked — and offers ONLY bf1 units (F, G), never F2 at bf2; the enemy role locks to E, not E2 (811.1.d.2.a)", async () => {
    const game = await board().unit(P1, "bf1", { might: 1, name: "Defender G" }, "G").build();
    await game.p2.move("E", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("fb");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered.sort()).toEqual(["F", "G"]);
    expect(offered).not.toContain("F2");
    await game.p1.pick("F");
    // The enemy role had a single legal candidate at bf1 → E; E2 (bf2) was never offered.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain()[0]).toMatchObject({ cardId: "fb", targets: ["F", "E"] });
  });

  test("(a) only friendly units at bf1 (P1's own turn, no combat): the enemy role has no valid choice there → Facebreaker cannot be flipped at all (811.1.d, 355.8)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 3, name: "Defender F" }, "F")
      .unit(P1, "bf2", { might: 2, name: "P1 Bf2 Unit" }, "F2")
      .unit(P2, "bf2", { might: 2, name: "P2 Bf2 Unit" }, "E2")
      .facedown(P1, "bf1", FACEBREAKER, "fb")
      .hand(P1, FACEBREAKER, "fbHand")
      .build();
    expect(game.p1.can("reveal", "fb")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("fb"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fb")).toBe("facedown-bf1");
    // 811.3 — from HAND the same card is playable for its full cost on any same-battlefield pair: the bf2 pair.
    expect(game.p1.can("cast", "fbHand")).toBe(true);
    const field = game.p1.option("cast", "fbHand")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([["F2", "E2"]]);
    await game.p1.cast("fbHand", { targets: ["F2", "E2"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } }); // printed cost: 2 energy, no power
    await game.settle();
    expect(game.state("F2").isStunned).toBe(true);
    expect(game.state("E2").isStunned).toBe(true);
    expect(game.state("F").isStunned).toBe(false);
    expect(game.zoneOf("fbHand")).toBe("trash");
  });

  // ── (d) baseline: no response ───────────────────────────────────────────────────────────────

  test("(d) no response: both F and E are stunned, no combat damage is dealt, F holds bf1 and the surviving attacker E is recalled to base (423.1.b, 466.1.a.2)", async () => {
    const game = await flipped();
    await game.settle();
    expect(game.zoneOf("fb")).toBe("trash"); // played from facedown normally → trash
    expect(game.state("F")).toMatchObject({ damage: 0, isStunned: true, zone: "battlefield-bf1" });
    expect(game.state("E")).toMatchObject({ damage: 0, isStunned: true, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Gust bounces the friendly half ──────────────────────────────────────────────────────

  test("(b) P2 may respond with Gust on F (3 Might); the chain is [Facebreaker, Gust] and Gust resolves first (LIFO)", async () => {
    const game = await flipped();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "F" });
    expect(game.p2.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("F")).toBe("hand");
    expect(game.p1.hand()).toContain("F");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb"]);
    expect(game.chain()[0]?.targets).toEqual(["F", "E"]); // 355.15 — choices are not changed
  });

  test("(b) after Gust, Facebreaker still stuns E — the instruction executes on its remaining legal target (359.3.e.8); F in hand is untouched (359.3.e.4)", async () => {
    const game = await flipped();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "F" });
    await game.settle();
    expect(game.zoneOf("F")).toBe("hand");
    expect(game.state("F").isStunned).toBe(false); // new object in hand carries no status
    expect(game.state("E").isStunned).toBe(true);
    expect(game.state("E").damage).toBe(0);
    // No replacement friendly was picked: the bf2 friendly is unaffected.
    expect(game.state("F2").isStunned).toBe(false);
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.zoneOf("gust")).toBe("trash");
  });

  test("(b) with no defender left there is no damage step (465.1); the stunned E is the only unit at bf1 and CONQUERS it for P2 (+1) — stun only stops combat damage", async () => {
    const game = await flipped();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "F" });
    await game.settle();
    expect(game.zoneOf("E")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Flash pulls the enemy half ──────────────────────────────────────────────────────────

  test("(c) P2 may respond with Flash moving E to base; Flash resolves first and E is in base while Facebreaker is still pending with targets [F, E]", async () => {
    const game = await flipped();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "E" });
    expect(game.p2.energy()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("E")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb"]);
    expect(game.chain()[0]?.targets).toEqual(["F", "E"]);
  });

  test("(c) after Flash, F IS still stunned (359.3.e.8) but E in base is unaffected (359.3.e.5) — and no other enemy (E2) is re-picked (355.15)", async () => {
    const game = await flipped();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "E" });
    await game.settle();
    expect(game.state("F")).toMatchObject({ damage: 0, isStunned: true, zone: "battlefield-bf1" });
    expect(game.state("E")).toMatchObject({ damage: 0, isStunned: false, zone: "base" });
    expect(game.state("E2").isStunned).toBe(false);
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.zoneOf("flash")).toBe("trash");
  });

  test("(c) no attackers remain → combat ends without damage; P1 keeps bf1 and nobody scores", async () => {
    const game = await flipped();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "E" });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bf1")).toEqual(["F"]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
