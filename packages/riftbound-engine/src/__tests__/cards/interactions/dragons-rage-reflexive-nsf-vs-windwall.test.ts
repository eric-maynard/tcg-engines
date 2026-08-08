/**
 * Interaction: Dragon's Rage (ogn-258-298) · Spell · Calm/Body · 4 + [C] · standard timing
 *     "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal
 *      damage equal to their Mights to each other."
 *   × Not So Fast (sfd-045-221) · Spell · Calm · 2 + [calm] · Reaction
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Wind Wall (ogn-064-298) · Spell · Calm · 3 + [calm][calm] · Reaction — "Counter a spell."
 *
 * Rules: 355.4 (a Move's destination is chosen while the spell is played), 355.5 / 355.5.b (game
 * objects are chosen at play time — but NOT the choices of a Reflexive Trigger the item will
 * generate), 387 / 387.2 / 388.1 ("Then do this:" = Reflexive Trigger → a NEW pending ability item
 * is created on the chain when the spell resolves and is finalized then), 359.3.b, 337.4 (after it
 * is finalized the other player gets priority and may respond), 425.1.a (a countered card/ability
 * does nothing).
 *
 * Question: P1 plays Dragon's Rage choosing P2's X (bf1) to move to bf2 where P2 has Y and Z.
 *   (a) When is "another enemy unit at its destination" chosen?  → not at finalization (only X and
 *       the destination are); on resolution X moves, then a reflexive item is created and P1 picks
 *       Y or Z from the enemy units at bf2 as they exist then.
 *   (b) Wind Wall / Not So Fast on Dragon's Rage itself → nothing happens: X stays, no reflexive item.
 *   (c) After the reflexive item is finalized P2 may Not So Fast just that item → X stays moved at
 *       bf2, no damage. Uncountered → X and the chosen unit deal their Mights to each other.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";
const NOT_SO_FAST = "sfd-045-221";
const WIND_WALL = "ogn-064-298";

/**
 * P1 to act with exactly 4 + [calm]. P2: X (3) alone at bf1; Y (5) and Z (2) at bf2; both counters in
 * hand with 5 energy + 3 calm (enough for either one, or for Not So Fast twice over).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .resources(P2, { energy: 5, power: { calm: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "X" }, "x")
    .unit(P2, "bf2", { might: 5, name: "Y" }, "y")
    .unit(P2, "bf2", { might: 2, name: "Z" }, "z")
    .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
    .hand(P1, DRAGONS_RAGE, "rage")
    .hand(P2, NOT_SO_FAST, "nsf")
    .hand(P2, WIND_WALL, "windwall");
}

/** P1 casts Dragon's Rage on X; the destination (bf2) is pre-queued for whenever the engine asks. */
async function castRageOnX(game: Game): Promise<void> {
  await game.p1.cast("rage", { answers: ["bf2"], targets: "x" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
}

const untouched = (game: Game) =>
  game.state("x").damage === 0 && game.state("y").damage === 0 && game.state("z").damage === 0 && game.locationOf("x") === "bf1";

describe("Dragon's Rage reflexive 'Then do this' × Not So Fast / Wind Wall", () => {
  // ── (a) what is chosen when ─────────────────────────────────────────────────────────────────

  test("(a) at play time the ONLY game-object choice is one enemy unit (X | Y | Z, single role) — 'another enemy unit at its destination' is not asked (355.5.b)", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "rage")?.fields.find((f) => f.arg === "targets");
    expect(targets).toMatchObject({ max: 1, min: 1 });
    expect(targets?.options).toEqual(expect.arrayContaining([["x"], ["y"], ["z"]]));
    expect(targets?.options).toHaveLength(3); // never the friendly unit
    await game.p1.cast("rage", { targets: "x" });
    // Whatever is asked next, it is not the second enemy unit.
    const d = game.decision();
    const asksSecondUnit = d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "y" || (o.card ?? o.key) === "z");
    expect(asksSecondUnit).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rage", controller: P1, targets: ["x"], triggered: false })]);
  });

  // Expected (355.4): the Move destination is a play-time choice, made while Dragon's Rage is being
  // finalized — before anyone receives priority — so P2 responds knowing where X is headed.
  // Actual: the cast finalizes with only X chosen; the "Choose a destination" prompt appears only
  // when the spell RESOLVES (after both players have passed).
  test.failing("BUG: (a) X's destination is chosen as Dragon's Rage is finalized, before P2 gets priority (355.4)", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { targets: "x" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf2"]);
    await game.p1.pick("battlefield-bf2");
    // Only now does the priority window open, P1 (controller) first.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.locationOf("x")).toBe("bf1"); // not moved yet — that happens on resolution
  });

  // Expected (387, 388.1, 359.3.b): when Dragon's Rage resolves X moves to bf2, THEN a new pending
  // ability item (source Dragon's Rage, controller P1) is created on the chain and P1 finalizes it by
  // choosing between Y and Z — the enemy units at bf2 at that moment. Dragon's Rage itself is in the
  // trash. Actual: no reflexive item is ever created and P1 is never asked — the engine silently
  // pairs X with the first other enemy unit at bf2 and deals the damage inside the spell's own
  // resolution.
  test("(a) on resolution X moves first, then a reflexive chain item is created and P1 chooses Y or Z for it (387, 388.1)", async () => {
    const game = await board().build();
    await castRageOnX(game);
    // Both pass → Dragon's Rage resolves (destination answered from the queue whenever it is asked);
    // settle() must then stop at P1's unscripted Y/Z choice for the new reflexive item.
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.locationOf("x")).toBe("bf2");
    expect(game.state("x").damage).toBe(0);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["y", "z"]); // "another" — never X itself, never the friendly unit
    await game.p1.pick("y");
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
    expect(game.zoneOf("rage")).toBe("trash");
  });

  // ── (b) countering Dragon's Rage itself ─────────────────────────────────────────────────────

  test("(b) Wind Wall counters Dragon's Rage: X does not move, nobody is damaged, no reflexive item — both spells to trash (425.1.a)", async () => {
    const game = await board().build();
    await castRageOnX(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "windwall")).toBe(true);
    await game.p2.cast("windwall", { targets: "rage" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rage", "windwall"]);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(untouched(game)).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    game.clearScript(P1);
  });

  test("(b) Not So Fast is legal against Dragon's Rage (an ENEMY spell that CHOOSES X, a unit friendly to P2) and countering it likewise does nothing at all", async () => {
    const game = await board().build();
    await castRageOnX(game);
    await game.p1.passPriority();
    expect(game.p2.option("cast", "nsf")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["rage"]]);
    await game.p2.cast("nsf", { targets: "rage" });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    await game.settle();
    expect(untouched(game)).toBe(true);
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // nothing refunded
    game.clearScript(P1);
  });

  // ── (c) countering only the reflexive item ──────────────────────────────────────────────────

  // Expected (337.4, 425.1.a): once P1 has finalized the reflexive item (choosing Y), P2 receives
  // priority and may Not So Fast it — it is an enemy ABILITY that chooses friendly unit Y.
  // Countering removes only that item: X stays at bf2 (the move already happened), no damage is
  // exchanged. Actual: there is no reflexive item and no priority window — the damage is dealt
  // inside Dragon's Rage's resolution, so P2 never gets the chance.
  test("(c) P2 may Not So Fast the reflexive item after it is finalized → X remains at bf2, X and Y undamaged (387, 425.1.a)", async () => {
    const game = await board().build();
    await castRageOnX(game);
    await game.settle(); // both pass → spell resolves: X → bf2, reflexive item pending → stops at P1's Y/Z choice
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("y");
    }
    expect(game.locationOf("x")).toBe("bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
    // P1 (controller of the newest item) has priority first, then P2 may respond.
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const nsfTargets = game.p2.option("cast", "nsf")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(nsfTargets).toHaveLength(1); // the reflexive ability is the only enemy item choosing a friendly unit
    await game.p2.cast("nsf");
    await game.settle();
    expect(game.locationOf("x")).toBe("bf2");
    expect(game.state("x").damage).toBe(0);
    expect(game.state("y").damage).toBe(0);
    expect(game.state("z").damage).toBe(0);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("rage")).toBe("trash");
  });

  test("(c) not countered, Y as the other unit: X moves to bf2, then X (3) and Y (5) deal their Mights to each other → X dies, Y has 3 damage, Z and the friendly unit untouched", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { answers: ["bf2", "y"], targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
    expect(game.state("z").damage).toBe(0);
    expect(game.state("friend").damage).toBe(0);
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand().sort()).toEqual(["nsf", "windwall"]); // P2 spent nothing
    game.clearScript(P1);
  });

  // Expected (387: "Choose another enemy unit at its destination"): the choice is P1's — picking Z
  // (2 Might) means X (3) kills Z and survives with 2 damage at bf2, Y untouched. Actual: P1 is never
  // asked; the engine pairs X with Y regardless (X dies, Y takes 3, Z unharmed).
  test("(c) the other enemy unit is P1's CHOICE — choosing Z: Z dies, X survives at bf2 with 2 damage, Y untouched", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { answers: ["bf2", "z"], targets: "x" });
    await game.settle();
    expect(game.zoneOf("z")).toBe("trash");
    expect(game.state("x")).toMatchObject({ damage: 2, zone: "battlefield-bf2" });
    expect(game.state("y").damage).toBe(0);
  });
});
