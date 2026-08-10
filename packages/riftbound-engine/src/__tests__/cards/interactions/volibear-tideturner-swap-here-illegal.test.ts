/**
 * Interaction: Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 9 Might
 *     "[Deflect 2] … When I attack, deal 5 damage split among any number of enemy units here."
 *   × Tideturner (ogn-199-298) · Unit · Chaos · 2 · 2 Might
 *     "[Hidden] When you play me, you may choose a unit you control at another location. Move me to its
 *      location and it to my original location."
 *   × Shipyard Skulker (ogn-175-298, 3 Might) "X" and Vanguard Sergeant (ogn-219-298, 4 Might) "Y".
 *
 * Question. P1's Volibear attacks bf1 where P2 defends with X and Y; P2 also has Tideturner facedown at
 * bf2. Volibear's attack trigger finalizes with split targets {X, Y}. In response P2 flips Tideturner at
 * bf2 for [0] and swaps it with X: Tideturner arrives at bf1, X goes to bf2. At resolution:
 *  (a) does X (now at bf2, still an enemy unit on the board) take any of the 5?
 *  (b) can P1 assign damage to the newly-arrived Tideturner?
 *  (c) how is the 5 divided?
 *  (d) variant: Volibear named ONLY X — does the ability do nothing, and does combat then proceed against
 *      Tideturner + Y with no pre-combat damage?
 *
 * Ruling. Split targets are TARGETS chosen at finalization (355.14.a/.b) and fixed (355.15); only the
 * division waits for resolution (355.14.e). (a) No: "enemy units HERE" — X no longer meets the requirement
 * → illegal, unaffected (359.3.e.2/.5, the CR's own Tideturner example); it stays a counted-but-
 * mistargeted choice (359.3.e.9.a). (b) No: Tideturner was never chosen and cannot be added. (c) 355.14.e/f:
 * divide among the remaining legal targets → all 5 to Y (≥1 each, single target) → Y (4) dies; combat then
 * pits Volibear against Tideturner, the newly-arrived Defender. (d) Sole target illegal → the deal
 * instruction does not execute (359.3.e.7/.10): nobody is damaged; combat: Volibear 9 v Y 4 + Tideturner 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR_FURIOUS = "ogn-041-298";
const TIDETURNER = "ogn-199-298";
const SHIPYARD_SKULKER = "ogn-175-298";
const VANGUARD_SERGEANT = "ogn-219-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", VOLIBEAR_FURIOUS, "voli")
    .unit(P2, "bf1", SHIPYARD_SKULKER, "x")
    .unit(P2, "bf1", VANGUARD_SERGEANT, "y")
    .facedown(P2, "bf2", TIDETURNER, "tt");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Volibear walks into bf1; its attack trigger goes on the chain. If the engine asks for the split targets now (355.14.b), name `names`. */
async function attackNaming(game: Game, names: string[]): Promise<void> {
  await game.p1.move("voli", "bf1");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "voli") {
    await game.p1.pick(...names);
    const cont = game.decision();
    if (cont?.kind === "pick" && cont.seat === P1 && cont.allowDecline) {
      await game.p1.decline(); // "any number of": stop here (355.13)
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, triggered: true })]);
}

/** P1 passes priority; P2 flips Tideturner at bf2, accepts the swap naming X; both pass → the swap resolves, Volibear's item is next. */
async function flipTideturnerSwappingX(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tt" } });
  await game.p2.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    expect(d.options.map((o) => o.key).sort()).toEqual(["x", "y"]); // "a unit you control at ANOTHER location" — both bf1 defenders
    await game.p2.pick("x");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli", "tt"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Tideturner's swap resolves
  expect(game.locationOf("tt")).toBe("bf1");
  expect(game.locationOf("x")).toBe("bf2");
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli"]);
}

/** Both pass on Volibear's item → it resolves (a distribute prompt may follow). */
async function resolveVolibear(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "action" && d.context === "chain") {
    await game.seat(d.seat).passPriority();
  }
  const d2 = game.decision();
  if (d2?.kind === "action" && d2.context === "chain") {
    await game.seat(d2.seat).passPriority();
  }
}

describe("Volibear's split targets are locked at finalization — a Tideturner swap makes X illegal and cannot add Tideturner", () => {
  // BUG — expected (355.14.a/.b): each unit the 5 is split among is a TARGET chosen when the trigger is
  // finalized, i.e. before anyone receives priority; the chain item then publicly names {X, Y}. Actual: the
  // engine finalizes the trigger with no targets and only asks "Split 5 damage" among whatever enemy units
  // are here at RESOLUTION.
  test("finalization (355.14.b) — moving Volibear in asks P1 to name the split targets FIRST; naming {X, Y} records both on the chain item before P1's priority", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["x", "y"]);
    await game.p1.pick("x", "y");
    const cont = game.decision();
    if (cont?.kind === "pick" && cont.allowDecline) {
      await game.p1.decline();
    }
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["x", "y"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the response is legal: with Volibear's item pending P2 flips Tideturner at bf2 for [0] (Hidden → Reaction) although the combat is at bf1; 'another location' offers X and Y; choosing X swaps them — Tideturner is now a DEFENDER at bf1, X sits undesignated and undamaged at bf2, Volibear's item still on the chain", async () => {
    const game = await board().build();
    await attackNaming(game, ["x", "y"]);
    const p2Energy = game.p2.energy();
    await flipTideturnerSwappingX(game);
    expect(game.p2.energy()).toBe(p2Energy); // played for [0]
    expect(game.state("tt")).toMatchObject({ combatRole: "defender", controller: P2, isHidden: false, location: "bf1" });
    expect(game.state("x")).toMatchObject({ combatRole: null, damage: 0, location: "bf2" });
    expect(game.state("y")).toMatchObject({ combatRole: "defender", location: "bf1" });
    expect(game.state("voli")).toMatchObject({ combatRole: "attacker", location: "bf1" });
    expect(showdown(game)?.battlefieldId).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  // ---------------------------------------------------------------- (a)
  test("(a) X — no longer 'here' — takes NONE of the 5 (359.3.e.2/.5): it is not among the units P1 may assign to, and after resolution it is undamaged at bf2", async () => {
    const game = await board().build();
    await attackNaming(game, ["x", "y"]);
    await flipTideturnerSwappingX(game);
    await resolveVolibear(game);
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.seat).toBe(P1);
      expect(d.total).toBe(5);
      expect(d.buckets.map((b) => b.card)).not.toContain("x");
      const sneaky = await game.p1.try((p) => p.distribute({ x: 2, y: 3 }));
      expect(sneaky.ok).toBe(false);
      if (game.decision()?.kind === "distribute") {
        await game.p1.distribute({ y: 5 });
      }
    }
    expect(game.state("x")).toMatchObject({ damage: 0, location: "bf2", zone: "battlefield-bf2" });
  });

  // ---------------------------------------------------------------- (b)
  // BUG — expected (355.14.b / 355.15): Tideturner was never chosen as a target when the trigger was
  // finalized, so at resolution it cannot receive any of the split damage — it must not be offered and an
  // assignment naming it must be rejected. Actual: the engine picks the recipients at resolution from the
  // enemy units currently here, so Tideturner is offered as a bucket and {y:3, tt:2} is accepted.
  test("(b) the newly-arrived Tideturner was never a target — it is NOT offered for the split and assigning any of the 5 to it is refused", async () => {
    const game = await board().build();
    await attackNaming(game, ["x", "y"]);
    await flipTideturnerSwappingX(game);
    await resolveVolibear(game);
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.buckets.map((b) => b.card)).not.toContain("tt");
      const illegal = await game.p1.try((p) => p.distribute({ tt: 2, y: 3 }));
      expect(illegal.ok).toBe(false);
      if (game.decision()?.kind === "distribute") {
        await game.p1.distribute({ y: 5 });
      }
    }
    expect(game.state("tt")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.zoneOf("y")).toBe("trash");
  });

  // ---------------------------------------------------------------- (c)
  // BUG — expected (355.14.e/.f): the division is decided at resolution among the REMAINING LEGAL targets;
  // with X illegal and Tideturner never chosen, Y is the only one → the full 5 goes to Y, nothing to decide
  // (a forced single line at most). Actual: P1 is asked to split 5 freely between Y and Tideturner.
  test("(c) the whole 5 MUST go to Y — at most a forced single-bucket line {Y: 5} is presented, never a free split", async () => {
    const game = await board().build();
    await attackNaming(game, ["x", "y"]);
    await flipTideturnerSwappingX(game);
    await resolveVolibear(game);
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.buckets.map((b) => [b.card, b.min, b.max])).toEqual([["y", 5, 5]]);
      await game.p1.distribute({ y: 5 });
    }
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.state("tt").damage).toBe(0);
  });

  test("(c) outcome when the 5 lands on Y: Y (4 Might) dies before combat damage; X and Tideturner are untouched; the showdown at bf1 continues with Tideturner as the lone Defender facing Volibear", async () => {
    const game = await board().build();
    await attackNaming(game, ["x", "y"]);
    await flipTideturnerSwappingX(game);
    await resolveVolibear(game);
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ y: 5 });
    }
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.state("x")).toMatchObject({ damage: 0, location: "bf2" });
    expect(game.state("tt")).toMatchObject({ combatRole: "defender", damage: 0, location: "bf1" });
    expect(game.state("voli")).toMatchObject({ combatRole: "attacker", damage: 0, location: "bf1" });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.p2.units("bf1")).toEqual(["tt"]);
  });

  test("(c) …both pass: Volibear 9 v Tideturner 2 → Tideturner dies, Volibear survives (healed) and P1 conquers bf1 for 1 point; X lives on at bf2, which stays P2's", async () => {
    const game = await board().build();
    await attackNaming(game, ["x", "y"]);
    await flipTideturnerSwappingX(game);
    await resolveVolibear(game);
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ y: 5 });
    }
    await game.settle();
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.state("voli")).toMatchObject({ combatRole: null, damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("x")).toMatchObject({ damage: 0, location: "bf2" });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (d)
  // BUG — expected (355.14.b + 359.3.e.7/.10): had P1 named ONLY X at finalization, the swap leaves the deal
  // instruction with no legal target → it does not execute: nobody (not Y, not Tideturner) takes damage and
  // no split is asked; the trigger still resolved and the showdown goes on against Y + Tideturner. Actual:
  // targets cannot be named at finalization at all (the engine asks nothing when the trigger is added), and
  // at resolution it demands a 5-damage split between Y and Tideturner.
  test("(d) variant — Volibear named ONLY X; after the swap the ability resolves doing NOTHING (no prompt, no damage anywhere) and combat proceeds 9 v Y 4 + Tideturner 2: both defenders die, P1 conquers", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" } });
    await game.p1.pick("x");
    const cont = game.decision();
    if (cont?.kind === "pick" && cont.allowDecline) {
      await game.p1.decline();
    }
    expect(game.chain()[0]?.targets ?? []).toEqual(["x"]);
    await flipTideturnerSwappingX(game);
    await resolveVolibear(game);
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ damage: 0, location: "bf2" });
    expect(game.state("y")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.state("tt")).toMatchObject({ damage: 0, location: "bf1" });
    // combat damage step: 9 split lethal-first over Y (4) and Tideturner (2) kills both; Volibear takes 6 < 9
    await game.settle();
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.state("voli")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
