/**
 * Interaction: Kog'Maw, Caustic (ogn-190-298) · Unit · Chaos · 1 Might
 *     "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Spectral Centaur (unl-068-219) · Unit · Mind · 5 Might
 *     "When another friendly unit dies, give me +2 [Might] this turn."
 *   × Flurry of Blades (ogn-133-298) · Spell · Body · 1 · Reaction
 *     "Deal 1 to all units at battlefields."
 *   (+ Recruit token ogn-271-298, a vanilla 1-Might P2 unit)
 *
 * Question: at bf1 sit P1's Kog'Maw (1), P2's Spectral Centaur (5) and a P2 Recruit (1). Flurry of
 * Blades resolves: Kog'Maw and the Recruit die simultaneously, Centaur has 1 damage. Each player has
 * exactly one trigger (P1: Kog'Maw's Deathknell; P2: Centaur's +2). Is any ordering decision surfaced,
 * and does Centaur survive? Case A: P1's turn. Case B: P2's turn.
 *
 * Rules: 323.4 / 323.5 (one cleanup queues the death triggers, noting location, then kills both units
 * simultaneously), 808.1.d.2 / 808.1.d.3 (Deathknell is queued before the card leaves, remembering "my
 * battlefield"), 383.3.d.1 (simultaneous triggers of DIFFERENT controllers: the turn player puts theirs
 * on the chain first, then the next player — so the non-turn player's item is on top and resolves
 * first; nobody with a single trigger gets an ordering choice), 319.5 + 323.5 (a cleanup after each
 * chain item leaves the chain kills lethal-damaged units), 317.2.b before 317.2.c (end of turn: damage
 * heals before "this turn" effects expire).
 *
 * Expected: no order prompt for anyone; who cast Flurry is irrelevant.
 *   Case A (P1's turn): chain bottom→top = [Kog'Maw DK, Centaur]. Centaur resolves → 7 Might. Kog'Maw DK
 *   → 4 more damage = 5 on a 7-Might unit → survives; end of turn heals before the +2 lapses → lives.
 *   Case B (P2's turn): chain = [Centaur, Kog'Maw DK]. Kog'Maw DK resolves first → 5 damage on 5 Might →
 *   Centaur is killed by the cleanup before its own +2 resolves; that item then does nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const CENTAUR = "unl-068-219";
const RECRUIT = "ogn-271-298";
const FLURRY = "ogn-133-298";
const DISCIPLINE = "ogn-058-298"; // cheap P1 spell so P2 can respond with Flurry on P1's turn

/** bf1 (P2's) with P1's Kog'Maw, P2's Centaur and Recruit. Both players hold a Flurry and 1 energy for it. */
function board(active: Seat) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", CENTAUR, "centaur")
    .unit(P2, "bf1", RECRUIT, "recruit")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2home") // in a base: not "at my battlefield"
    .hand(P1, FLURRY, "flurryP1")
    .hand(P2, FLURRY, "flurryP2");
}

/** The turn player casts Flurry and both players pass once so that Flurry — and only Flurry — resolves. */
async function flurryResolves(active: Seat): Promise<Game> {
  const game = await board(active).build();
  await game.seat(active).cast(active === P1 ? "flurryP1" : "flurryP2");
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

/** Both players pass once more → the top chain item resolves (and its cleanup runs). */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Kog'Maw Deathknell × Spectral Centaur — cross-player simultaneous triggers are ordered by turn order (383.3.d.1)", () => {
  // ---- common: the simultaneous deaths and the two triggers ---------------------------------------

  test("Flurry resolves: Kog'Maw and the Recruit die in the same cleanup, Centaur takes 1; exactly two triggered items go on the chain — Kog'Maw's (P1) and Centaur's (P2)", async () => {
    const game = await flurryResolves(P1);
    expect(game.zoneOf("flurryP1")).toBe("trash");
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("recruit")).not.toBe("battlefield-bf1"); // token: trash or ceased to exist
    expect(game.state("centaur").damage).toBe(1);
    expect(game.state("p2home").damage).toBe(0); // "at battlefields" only
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "kog", controller: P1, triggered: true }),
        expect.objectContaining({ cardId: "centaur", controller: P2, triggered: true }),
      ]),
    );
  });

  test("Centaur triggers exactly ONCE — only the Recruit was 'another friendly unit'; the enemy Kog'Maw's death adds nothing", async () => {
    const game = await flurryResolves(P1);
    expect(game.chain().filter((i) => i.cardId === "centaur")).toHaveLength(1);
    expect(game.chain().filter((i) => i.cardId === "kog")).toHaveLength(1);
  });

  test("no ordering decision is surfaced to either player — each controls a single trigger; the next decision is plain chain priority", async () => {
    for (const active of [P1, P2]) {
      const game = await flurryResolves(active);
      const d = game.decision();
      expect(d?.kind).toBe("action");
      expect(d).toMatchObject({ context: "chain", kind: "action" });
      expect(["order", "pick"]).not.toContain(d?.kind as string);
    }
  });

  // ---- Case A: P1's turn ---------------------------------------------------------------------------

  test("Case A (P1's turn): turn player appends first → chain bottom→top = [Kog'Maw DK (P1), Centaur +2 (P2)]", async () => {
    const game = await flurryResolves(P1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["kog", "centaur"]);
  });

  test("Case A: Centaur's +2 resolves first → 7 Might with 1 damage; Kog'Maw's item still waiting", async () => {
    const game = await flurryResolves(P1);
    await resolveTop(game);
    expect(game.chain().map((i) => i.cardId)).toEqual(["kog"]);
    expect(game.state("centaur").might).toBe(7);
    expect(game.state("centaur").damage).toBe(1);
  });

  test("Case A: Kog'Maw's Deathknell then deals 4 at its noted battlefield → Centaur at 5 damage on 7 Might survives; the base unit is untouched (808.1.d.3)", async () => {
    const game = await flurryResolves(P1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("centaur")).toBe("battlefield-bf1");
    expect(game.state("centaur").damage).toBe(5);
    expect(game.state("centaur").might).toBe(7);
    expect(game.state("p2home").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Case A: at end of turn damage heals (317.2.b) before the +2 expires (317.2.c) — Centaur is alive on P2's turn at 5 Might, 0 damage", async () => {
    const game = await flurryResolves(P1);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("centaur")).toBe("battlefield-bf1");
    expect(game.state("centaur").damage).toBe(0);
    expect(game.state("centaur").might).toBe(5);
    expect(game.p2.trash()).not.toContain("centaur");
  });

  test("Case A, caster irrelevant: P2 casts Flurry in response to a P1 spell on P1's turn → same order above the pending spell: [Discipline, Kog'Maw DK, Centaur] and Centaur survives", async () => {
    const game = await board(P1)
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", { might: 2, name: "P1 Homebody" }, "p1home")
      .hand(P1, DISCIPLINE, "discipline")
      .build();
    await game.p1.cast("discipline", { targets: "p1home" });
    await game.p1.passPriority();
    await game.p2.cast("flurryP2");
    await resolveTop(game); // Flurry resolves (LIFO), Discipline still pending
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["discipline", "kog", "centaur"]);
    await game.settle();
    expect(game.zoneOf("centaur")).toBe("battlefield-bf1");
    expect(game.state("centaur").damage).toBe(5);
    expect(game.state("centaur").might).toBe(7);
  });

  // ---- Case B: P2's turn ---------------------------------------------------------------------------

  // Expected: P2 is the turn player, so P2's Centaur trigger is appended FIRST and P1's Kog'Maw
  // Deathknell lands on top (383.3.d.1). Actual: the engine appends in seat order (P1 first) regardless
  // of whose turn it is, giving the same [kog, centaur] chain as Case A.
  test("Case B (P2's turn): turn player P2 appends first → chain bottom→top = [Centaur +2 (P2), Kog'Maw DK (P1)] (383.3.d.1)", async () => {
    const game = await flurryResolves(P2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["centaur", "kog"]);
  });

  // Expected: Kog'Maw's item resolves first: Centaur 1 + 4 = 5 damage on 5 Might → killed by the cleanup
  // that follows the item leaving the chain (319.5, 323.5), while its own +2 is still on the chain.
  // Actual: Centaur's +2 resolves first (wrong order), so after one resolution it is 7 Might / 1 damage.
  test("Case B: the first item to resolve is Kog'Maw's Deathknell → Centaur takes lethal (5 on 5) and is in P2's trash with its +2 trigger still unresolved on the chain", async () => {
    const game = await flurryResolves(P2);
    await resolveTop(game);
    expect(game.zoneOf("centaur")).toBe("trash");
    expect(game.p2.trash()).toContain("centaur");
    expect(game.chain().map((i) => i.cardId)).toEqual(["centaur"]);
  });

  // Expected: the orphaned +2 item then resolves with its source gone and does nothing; final state has
  // Centaur in P2's trash and bf1 empty of P2 units. Actual: Centaur survives at bf1 with 5 damage / 7 Might.
  test("Case B end state: Centaur's trigger resolves doing nothing; Centaur is in P2's trash — same cards, other turn player, opposite outcome", async () => {
    const game = await flurryResolves(P2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("centaur")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.state("p2home").damage).toBe(0);
  });

  test("Case B: still no ordering prompt and Kog'Maw's Deathknell does resolve for 4 at bf1 (Centaur ends with ≥ 5 damage marked or dead)", async () => {
    // Order-independent facts of Case B that hold today: both triggers resolve, nobody is asked to order.
    const game = await flurryResolves(P2);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    const dead = game.zoneOf("centaur") === "trash";
    expect(dead || game.state("centaur").damage === 5).toBe(true);
  });
});
