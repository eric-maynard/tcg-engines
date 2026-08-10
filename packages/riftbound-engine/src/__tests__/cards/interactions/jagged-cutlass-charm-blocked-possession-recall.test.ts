/**
 * Interaction: Jagged Cutlass (ven-073-166) · Gear (Equipment) · Body · 3 · +2 Might
 *     "Equip [body] ([body]: Attach this to a unit you control.)
 *      I can't be moved by enemy spells and abilities."           (Effect Text — speaks as the holder)
 *   × Charm (ogn-043-298) · Spell · Calm · 1 + [calm] · "Move an enemy unit."
 *   × Possession (ogn-203-298) · Spell (Action) · Chaos · 8 + [chaos][chaos][chaos]
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base.
 *      This isn't a move.)"
 *   contrast: Ride the Wind (ogn-173-298) · Spell (Action) · Chaos · 2 + [chaos] · "Move a friendly unit
 *   and ready it."; the ordinary Standard Move; Stellacorn Herder (sfd-048-221) "When I move, draw 1." as
 *   a move-trigger probe.
 *
 * Question: P2's Vanguard Sergeant (4) is at bf1 wearing P2's Jagged Cutlass. On P1's turn:
 *   (a) P1 Charms the Sergeant — is it a legal choice, does it move, is Charm still "played" (trash)?
 *   (b) P1 plays Possession on the Sergeant — does the Cutlass stop the relocation? Where does the
 *       Sergeant end up, who controls the Cutlass, do "when I move" triggers fire?
 *   (c) contrast: P2's own Ride the Wind on the Sergeant.   (d) contrast: the Sergeant's Standard Move.
 *
 * Rules: 054.1 (a "can't" beats a "can"), 055 (do as much as you can), 420.2.a (Move = a permanent
 * changing location by a move action/effect), 456 / 456.1 / 456.2 / 456.3 (a Recall is not a Move,
 * fires no move triggers, changes location, and cannot be prevented by effects that restrict Movement),
 * 369.1 / 374 (passive restriction applies continuously while attached), 719.3.a (Equipment travels with
 * its holder).
 *
 * Expected: (a) "can't be moved" restricts the move, not the choosing: the Sergeant IS offered to Charm;
 * on resolution the enemy spell's move is forbidden → the Sergeant stays at bf1, Charm resolves with no
 * effect and goes to P1's trash, cost paid, counted as played. (b) Possession changes control then
 * RECALLS — not a Move (456.3) → the Sergeant lands in P1's base under P1's control, Cutlass still
 * attached (+2 → 6 Might) and still controlled by P2; no move trigger fires. (c) a friendly spell moves
 * and readies it normally. (d) a Standard Move is a player action, unaffected.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JAGGED_CUTLASS = "ven-073-166";
const VANGUARD_SERGEANT = "ogn-219-298"; // vanilla 4-Might unit
const CHARM = "ogn-043-298";
const POSSESSION = "ogn-203-298";
const RIDE_THE_WIND = "ogn-173-298";
const STELLACORN_HERDER = "sfd-048-221"; // 3 Might, "When I move, draw 1."

/**
 * bf1 is P2's: the Cutlass-wearing `bearer` (the Sergeant by default) + a vanilla 1-Might Buddy (so a
 * relocation never empties the battlefield by itself). bf2 is empty and uncontrolled (a legal move
 * destination). P1: Charm + Possession in hand, exactly 9 energy + 1 calm + 3 chaos (1+[calm] and
 * 8+[chaos]×3). P2: Ride the Wind in hand with exactly 2 energy + 1 chaos; the Sergeant starts EXHAUSTED
 * so Ride the Wind's "ready it" is observable.
 */
function board(bearer: "sergeant" | "herder" = "sergeant", active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 9, power: { calm: 1, chaos: 3 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", bearer === "sergeant" ? VANGUARD_SERGEANT : STELLACORN_HERDER, "sarge", { equippedWith: ["cutlass"], exhausted: true })
    .card("cutlass", { def: JAGGED_CUTLASS, meta: { attachedTo: "sarge" }, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 1, name: "Buddy" }, "buddy")
    .hand(P1, CHARM, "charm")
    .hand(P1, POSSESSION, "poss")
    .hand(P2, RIDE_THE_WIND, "ride");
}

const offered = (game: Game, seat: "p1" | "p2", alias: string): string[] =>
  [...new Set((game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[])];

/** Answer a pending destination prompt for `seat` (Charm / Ride the Wind ask "where to" as they are played) with bf2. */
async function destination(game: Game, seat: "p1" | "p2"): Promise<boolean> {
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "destination" && d.seat === game[seat].seat) {
    await game[seat].pick("bf2");
    return true;
  }
  return false;
}

describe("setup — the Sergeant wears P2's Cutlass at bf1", () => {
  test("Sergeant 4 + 2 = 6 Might at bf1, exhausted; the Cutlass is attached, controlled by P2, and carries the 'can't be moved by enemy spells and abilities' text", async () => {
    const game = await board().build();
    expect(game.state("sarge")).toMatchObject({ attachments: ["cutlass"], baseMight: 4, controller: P2, isExhausted: true, location: "bf1", might: 6 });
    expect(game.state("cutlass")).toMatchObject({ attachedTo: "sarge", controller: P2, location: "bf1", owner: P2 });
    expect(game.state("cutlass").rulesText).toContain("I can't be moved by enemy spells and abilities.");
  });
});

describe("(a) Charm (enemy spell: 'Move an enemy unit') on the Cutlass bearer", () => {
  test("the Sergeant IS a legal choice for Charm — 'can't be moved' restricts the move, not being chosen", async () => {
    const game = await board().build();
    expect(offered(game, "p1", "charm").sort()).toEqual(["buddy", "sarge"]);
    expect(game.p1.can("cast", "charm")).toBe(true);
    await game.p1.cast("charm", { targets: "sarge" });
    await destination(game, "p1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["sarge"] })]);
    expect(game.p1.resources()).toEqual({ energy: 8, power: { calm: 0, chaos: 3 } }); // 1 + [calm] paid
  });

  // rule 054.1 / 055: the move instruction is performed by an ENEMY spell and is forbidden — the
  // Sergeant stays at bf1 (still exhausted, Cutlass attached), no showdown opens at bf2.
  test("on resolution the Sergeant does NOT move — it stays at bf1 with the Cutlass; nothing arrives at bf2 (054.1, 055)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "sarge" });
    await destination(game, "p1");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ controller: P2, isExhausted: true, location: "bf1", might: 6 });
    expect(game.state("cutlass")).toMatchObject({ attachedTo: "sarge", location: "bf1" });
    expect(game.cardsAt("bf2")).toEqual([]);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Charm still resolves as a played spell: it ends in P1's trash, its cost stays paid, and it counts among the cards P1 played this turn", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "sarge" });
    await destination(game, "p1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.p1.trash()).toEqual(["charm"]);
    expect(game.p1.resources()).toEqual({ energy: 8, power: { calm: 0, chaos: 3 } });
    expect(game.gameState.cardsPlayedIdsThisTurn?.[P1] ?? []).toContain("charm");
  });

  test("control: Charm on the UN-equipped Buddy moves it normally (bf1 → bf2)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "buddy" });
    await destination(game, "p1");
    await game.settle();
    expect(game.locationOf("buddy")).toBe("bf2");
    expect(game.locationOf("sarge")).toBe("bf1");
  });
});

describe("(b) Possession (take control, then RECALL) on the Cutlass bearer", () => {
  test("the Sergeant is a legal choice ('an enemy unit at a battlefield'); P1 pays 8 + [chaos]×3", async () => {
    const game = await board().build();
    expect(offered(game, "p1", "poss").sort()).toEqual(["buddy", "sarge"]);
    await game.p1.cast("poss", { targets: "sarge" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poss", controller: P1, targets: ["sarge"] })]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, chaos: 0 } });
  });

  test("a Recall is not a Move and cannot be blocked by move restrictions (456.3): the Sergeant ends in the base under P1's control", async () => {
    const game = await board().build();
    await game.p1.cast("poss", { targets: "sarge" });
    await game.settle();
    expect(game.zoneOf("poss")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ controller: P1, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain("sarge");
    expect(game.p2.units()).not.toContain("sarge");
    expect(game.cardsAt("bf1")).toEqual(["buddy"]);
  });

  test("the Cutlass stays attached (Sergeant still 6 Might), travels to the base with its holder (719.3.a) and remains under P2's control", async () => {
    const game = await board().build();
    await game.p1.cast("poss", { targets: "sarge" });
    await game.settle();
    expect(game.state("sarge")).toMatchObject({ attachments: ["cutlass"], might: 6 });
    expect(game.state("cutlass")).toMatchObject({ attachedTo: "sarge", controller: P2, location: "base", owner: P2 });
    expect(game.p1.trash()).toEqual(["poss"]);
    expect(game.p2.trash()).toEqual([]);
  });

  test("the recall does not change ready/exhausted status and bf1 stays P2's (Buddy is still there)", async () => {
    const game = await board().build();
    await game.p1.cast("poss", { targets: "sarge" });
    await game.settle();
    expect(game.state("sarge").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("no 'When I move' trigger fires on the recall (456.1) — with a Cutlass-wearing Stellacorn Herder ('When I move, draw 1') nobody draws", async () => {
    const game = await board("herder").build();
    expect(game.state("sarge")).toMatchObject({ might: 5, name: "Stellacorn Herder" });
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("poss", { targets: "sarge" });
    await game.settle();
    expect(game.state("sarge")).toMatchObject({ controller: P1, location: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // spent Possession, drew nothing
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("control for the probe: the same Herder DOES draw its controller a card when it is actually moved (P2's Standard Move)", async () => {
    // board()'s bearer starts exhausted; use a fresh READY Cutlass-wearing Herder on P2's turn.
    const g2 = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", STELLACORN_HERDER, "herder", { equippedWith: ["cutlass"] })
      .card("cutlass", { def: JAGGED_CUTLASS, meta: { attachedTo: "herder" }, owner: P2, zone: "bf1" })
      .build();
    const p2Hand = g2.p2.hand().length;
    await g2.p2.move("herder", "base");
    await g2.settle();
    expect(g2.locationOf("herder")).toBe("base");
    expect(g2.p2.hand()).toHaveLength(p2Hand + 1);
  });
});

describe("(c) contrast — P2's own Ride the Wind (friendly spell) on the bearer", () => {
  test("a FRIENDLY spell is not restricted: the Sergeant moves bf1 → bf2 and is readied; the Cutlass goes with it", async () => {
    const game = await board("sergeant", P2).build();
    expect(offered(game, "p2", "ride").sort()).toEqual(["buddy", "sarge"]);
    await game.p2.cast("ride", { targets: "sarge" });
    await destination(game, "p2");
    await game.settle();
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ controller: P2, isReady: true, location: "bf2", might: 6 });
    expect(game.state("cutlass")).toMatchObject({ attachedTo: "sarge", location: "bf2" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });
});

describe("(d) contrast — the bearer's ordinary Standard Move", () => {
  test("a Standard Move is a player action, not a spell or ability: a READY Cutlass-wearing Sergeant may move bf1 → base", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", VANGUARD_SERGEANT, "sarge", { equippedWith: ["cutlass"] })
      .card("cutlass", { def: JAGGED_CUTLASS, meta: { attachedTo: "sarge" }, owner: P2, zone: "bf1" })
      .unit(P2, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .build();
    expect(game.p2.can("standardMove")).toBe(true);
    const opt = game.p2.legal().find((o) => o.key === "standardMove:to:base");
    expect((opt?.fields.find((f) => f.name === "unitIds")?.options ?? []).flat()).toContain("sarge");
    await game.p2.move("sarge", "base");
    await game.settle();
    expect(game.state("sarge")).toMatchObject({ isExhausted: true, location: "base", might: 6 });
    expect(game.state("cutlass")).toMatchObject({ attachedTo: "sarge", location: "base" });
    expect(game.violations()).toEqual([]);
  });
});
