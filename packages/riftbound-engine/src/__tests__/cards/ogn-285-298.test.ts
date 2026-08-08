/**
 * Reaver's Row — ogn-285-298 · Battlefield
 *
 *   When you defend here, you may move a friendly unit here to base.
 *
 * Rules: 383.4.f ("When you defend" = Defend Trigger; the PLAYER gains the Defender designation —
 * 464.2.c.2: the defender is whoever did NOT apply Contested, i.e. the side being attacked here),
 * 383.4.f.2.a (checked once per combat however many units defend), 471.2.a-style "here" (only a
 * combat AT this battlefield), 190.6.b / 108.2 (a battlefield ability is controlled by the player it
 * speaks to — the defender — not by whoever put the card in their deck), "friendly" is relative to
 * that player, an effect-move is not the Standard Move (exhausted units can be moved, nothing is
 * exhausted), 323.2.c (a unit that leaves the combat battlefield drops its Defender designation),
 * 465.1 / 466.3.a / 466.5 (if no defending unit remains, no combat damage is dealt and the attacker
 * establishes control = conquers).
 *
 * Head-judge corner cases for THIS card:
 *  1. Symmetry — the card owner is irrelevant: when P1 attacks a Reaver's Row P2 controls, it is P2's
 *     trigger and P2's prompt; P1 must never be asked.
 *  2. Evacuating the ONLY defender: the combat fizzles (no damage either way) and the attacker
 *     conquers an empty battlefield — the classic "chump-dodge" line.
 *  3. Target set = friendly units HERE only: not the attacker, not my units in base / at another
 *     battlefield; an exhausted defender is still a legal pick and arrives home still exhausted.
 *  4. "here" negative space: me defending at a DIFFERENT battlefield while I control Reaver's Row
 *     must not trigger it; a walk-in onto my EMPTY Reaver's Row is a Non-Combat Showdown (no defender).
 *  5. Once per combat with two defenders, but a second combat here later in the same turn re-triggers.
 *  6. "you may" declined → plain combat.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-285-298";

/** P2 to act. bf1 = live Reaver's Row controlled by P1 (card owned by P2 to prove ownership is irrelevant). */
function siege(raiderMight = 4) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider");
}

const rowItems = (game: Game) => game.chain().filter((c) => c.cardId === "bf1" && c.triggered).length;

/** Answer the Row's opt-in (+ target) for `seat`, then pass priority until the item has resolved; stops before Focus passes. */
async function resolveRow(game: Game, accept: boolean, target?: string): Promise<{ prompts: number; offered: string[] }> {
  let prompts = 0;
  let offered: string[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no") {
      prompts += 1;
      await (accept ? game.seat(d.seat).yes() : game.seat(d.seat).no());
    } else if (d?.kind === "pick") {
      offered = d.options.map((o) => String(o.card ?? o.key));
      await game.seat(d.seat).pick(target ?? (d.options[0]?.key as string));
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return { offered, prompts };
}

describe("Reaver's Row (ogn-285-298)", () => {
  test("enemy attacks here → ONE triggered item controlled by the defender (P1), who is asked 'you may' before anything moves", async () => {
    const game = await siege().build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "Reaver's Row", triggered: true })]);
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
  });

  test("accepting offers exactly the friendly units HERE (not the attacker, not my base/bf2 units); an exhausted pick goes home still exhausted and loses Defender", async () => {
    const game = await siege()
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy", { exhausted: true })
      .unit(P1, "base", { might: 3, name: "Homebody" }, "home")
      .unit(P1, "bf2", { might: 3, name: "Elsewhere" }, "else")
      .build();
    await game.p2.move("raider", "bf1");
    const r = await resolveRow(game, true, "buddy");
    expect(r.prompts).toBe(1);
    expect(r.offered.sort()).toEqual(["buddy", "holder"]);
    expect(game.zoneOf("buddy")).toBe("base");
    expect(game.state("buddy")).toMatchObject({ combatRole: null, isExhausted: true });
    expect(game.state("holder").combatRole).toBe("defender");
    // combat continues: Holder (2) vs Raider (4)
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("evacuating the ONLY defender: no combat damage is dealt either way, Holder survives at home, the Raider conquers bf1 unhurt (+1 point)", async () => {
    const game = await siege().build();
    await game.p2.move("raider", "bf1");
    await resolveRow(game, true, "holder");
    expect(game.zoneOf("holder")).toBe("base");
    await game.settle();
    await game.settle();
    expect(game.zoneOf("holder")).toBe("base");
    expect(game.state("holder").damage).toBe(0);
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("'you may' declined → nothing moves and it is an ordinary combat (Holder 2 dies to Raider 4)", async () => {
    const game = await siege().build();
    await game.p2.move("raider", "bf1");
    const r = await resolveRow(game, false);
    expect(r.prompts).toBe(1);
    expect(rowItems(game)).toBe(0);
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("symmetry — P1 attacks a Reaver's Row that P2 controls: the trigger and the prompt belong to P2 (the defender); P2 pulls its unit home and P1 conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "bf1", { might: 5, name: "Their Wall" }, "wall")
      .unit(P2, "bf1", { might: 1, name: "Their Pawn" }, "pawn")
      .unit(P1, "base", { might: 2, name: "My Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    const r = await resolveRow(game, true, "wall");
    expect(r.prompts).toBe(1);
    expect(r.offered.sort()).toEqual(["pawn", "wall"]); // my attacking Scout is not "friendly" to the defender
    expect(game.zoneOf("wall")).toBe("base");
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash"); // Scout 2 vs Pawn 1
    expect(game.state("scout").zone).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // BUG — expected (383.4.f + "here"): the Defend Trigger is conditioned on a combat AT Reaver's Row;
  // being attacked at bf2 must not put a Reaver's Row item on the chain. Actual: the `on:"controller"`
  // matcher ignores the trigger's `location:"here"` for battlefield cards, so it fires for any defence.
  test("'When you defend HERE' fires when its controller defends at a DIFFERENT battlefield (383.4.f, trigger location 'here')", async () => {
    const game = await siege().unit(P1, "bf2", { might: 2, name: "Outpost" }, "outpost").build();
    await game.p2.move("raider", "bf2");
    expect(rowItems(game)).toBe(0);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.zoneOf("outpost")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("negative space — a walk-in onto my EMPTY Reaver's Row is a Non-Combat Showdown: no defender, no trigger, P2 simply conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 1, name: "Walker" }, "walker")
      .build();
    await game.p2.move("walker", "bf1");
    expect(rowItems(game)).toBe(0);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    await game.settle();
    expect(game.zoneOf("home")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("383.4.f.2.a — two of my units defending here is still ONE 'you defend': one chain item, one prompt", async () => {
    const game = await siege(6).unit(P1, "bf1", { might: 1, name: "Second" }, "second").build();
    await game.p2.move("raider", "bf1");
    expect(rowItems(game)).toBe(1);
    const r = await resolveRow(game, false);
    expect(r.prompts).toBe(1);
    expect(rowItems(game)).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("per combat, not per turn: after combat #1 here resolves (declined, 5-Might Holder kills Raider), a second attacker this turn triggers it again", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "bf1", { might: 5, name: "Big Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
      .build();
    await game.p2.move("raider", "bf1");
    expect((await resolveRow(game, false)).prompts).toBe(1);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p2.move("scout", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    expect((await resolveRow(game, false)).prompts).toBe(1);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
  });

  test("registry payload: one optional Defend Trigger scoped to the controller and to HERE, moving a friendly unit here → base", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Reaver's Row" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toEqual({
      effect: { target: { controller: "friendly", location: "here", type: "unit" }, to: "base", type: "move" },
      optional: true,
      trigger: { event: "defend", location: "here", on: "controller" },
      type: "triggered",
    });
  });
});
