/**
 * Interaction: Eye of the Herald (sfd-153-221) · Equipment · Order · 1 · +0 — "[Equip] [order] … Effect Text: When I move,
 *     play a 1 [Might] Recruit unit token here."
 *   × Highlander (ogs-020-024) · Reaction · 4 — "Choose a friendly unit. The next time it would die this turn, heal it,
 *     exhaust it, and recall it instead. (Send it to base. This isn't a move.)"
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] — "Kill a unit."
 *   (holders: Vanguard Sergeant ogn-219-298, vanilla 4; the wall: Mega-Mech ogn-088-298, vanilla 8)
 *
 * Rules: 434.4 / 434.4.a (Attach: the gear's location becomes the holder's — NOT a Move), 136.2.c / 718.3 (Effect Text
 * speaks as the Top-Most card: "I" = the holder), 719.3.a (attached cards travel with the holder), 719.4 (ready state
 * is independent), 719.5 (board → non-board zone change Detaches everything), 435.4.a / 435.4.b (a Detached gear sits at
 * the holder's last location; at a battlefield it is Recalled in the next Cleanup), 435.1.c / 724 (unattached: Rules Text
 * active again, Effect Text inactive), 455 / 456.1 / 456.2 (Recall changes location, not zone, and is not a Move),
 * 457.1 / 323.7 (loose gear at a battlefield → its CONTROLLER's base), 458.1, 466.1.a.2 (units arriving mid-combat
 * become attackers).
 *
 * Q — trace the Eye (zone / location / attached / controller) and whether a Recruit appears:
 *  (1) P1 Equips the loose Eye onto Sergeant A standing AT bf1 (base → bf1): a move? a token?
 *  (2) The Eye is on Sergeant B in base; B standard-moves base → bf2 (Mega-Mech there): token? where?
 *  (3) In that combat P1 Highlanders B; the Mech's 8 is lethal to B and the Recruit → B healed/exhausted/RECALLED.
 *      Does the Eye come along? Is the recall a move (second Recruit)? The Recruit token?
 *  (4) P2's next turn: Vengeance kills B in P1's base — where exactly is the Eye, attached?, whose, re-equippable?
 *  (5) Contrast: no Highlander — B dies at bf2. Where does the Eye detach to and end up? Any trash?
 * Expected: (1) attached at bf1, not a Move → no Recruit. (2) Move → trigger from B → Recruit at bf2 (an attacker); Eye at
 * bf2 attached. (3) recall = location change only → Eye stays on B, both in P1's base; not a Move → no Recruit; the
 * Recruit dies (ceases to exist); Mech keeps bf2. (4) B → trash; Eye detaches in P1's base, unattached, P1's, on the
 * board (never trashed); P1 may re-Equip it next turn (onto A at bf1: again no token). (5) Eye detaches at bf2 and is
 * Recalled to P1's base — not P2's, not a trash; Recruit gone; Mech holds.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EYE_OF_THE_HERALD = "sfd-153-221";
const HIGHLANDER = "ogs-020-024";
const VENGEANCE = "ogn-229-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const MEGA_MECH = "ogn-088-298";

/** Step (1): P1's turn; A at bf1 (P1's), B in base, the Eye LOOSE in base, [order]×2 to Equip, 4 energy for Highlander. */
function looseBoard() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sgtA")
    .unit(P1, "base", VANGUARD_SERGEANT, "sgtB")
    .unit(P2, "bf2", MEGA_MECH, "mech")
    .gear(P1, EYE_OF_THE_HERALD, "eye")
    .hand(P1, HIGHLANDER, "highlander");
}

/** Steps (2)–(5): same board a turn later — the Eye already worn by B in base; P2 holds Vengeance for step (4). */
function wornBoard(opts: { highlander?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sgtA")
    .unit(P1, "base", VANGUARD_SERGEANT, "sgtB", { equippedWith: ["eye"] } as Record<string, unknown>)
    .gear(P1, EYE_OF_THE_HERALD, "eye", { attachedTo: "sgtB" } as Record<string, unknown>)
    .unit(P2, "bf2", MEGA_MECH, "mech")
    .hand(P2, VENGEANCE, "vengeance");
  return opts.highlander === false ? b : b.hand(P1, HIGHLANDER, "highlander");
}

/** The Eye's trace point: zone / location / holder / control. */
function eye(game: Game) {
  const s = game.state("eye");
  return { attachedTo: s.attachedTo, controller: s.controller, location: s.location, owner: s.owner, zone: s.zone };
}

const recruitsAlive = (game: Game) => game.findAll({ name: "Recruit" }).filter((id) => game.zoneOf(id) !== "gone");
const equipPairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`))
    .sort();

/** (2): B (wearing the Eye) walks base → bf2; both pass so the move trigger resolves; returns the Recruit id. */
async function bMovesToBf2(game: Game): Promise<string> {
  await game.p1.move("sgtB", "bf2");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sgtB", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  const list = recruitsAlive(game);
  expect(list).toHaveLength(1);
  return list[0] as string;
}

describe("Eye of the Herald — equip / move / Highlander recall / death: where the Eye is and when a Recruit appears", () => {
  // ---------------------------------------------------------------- (1)
  test("(1) Equip onto A AT bf1: [order] paid, the Equip ability (not a trigger) resolves, the Eye's location becomes bf1 attached to A (434.4) — tree A ← Eye @ bf1, both P1's", async () => {
    const game = await looseBoard().build();
    expect(equipPairs(game)).toEqual(["eye->sgtA", "eye->sgtB"]);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "eye", unitId: "sgtA" } });
    expect(game.p1.power("order")).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "eye", controller: P1, triggered: false })]);
    await game.settle();
    expect(eye(game)).toEqual({ attachedTo: "sgtA", controller: P1, location: "bf1", owner: P1, zone: "battlefield-bf1" });
    expect(game.state("sgtA")).toMatchObject({ attachments: ["eye"], location: "bf1", might: 4 }); // +0
  });

  test("(1) base → bf1 by attaching is expressly NOT a Move (434.4.a) and 'I' is A, who did not move (718.3): no move event, no trigger, no Recruit anywhere", async () => {
    const game = await looseBoard().build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "eye", unitId: "sgtA" } });
    await game.settle();
    expect(game.gameState.turnEventCounts?.move).toBeUndefined();
    expect(game.chain()).toEqual([]);
    expect(recruitsAlive(game)).toEqual([]);
    expect(game.findAll({ name: "Recruit" })).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (2)
  test("(2) B's Standard Move base → bf2 IS a Move: B's (the wearer's) 'When I move' goes on the chain and the Eye travelled with B to bf2, still attached (719.3.a)", async () => {
    const game = await wornBoard().build();
    expect(eye(game)).toEqual({ attachedTo: "sgtB", controller: P1, location: "base", owner: P1, zone: "base" });
    await game.p1.move("sgtB", "bf2");
    expect(game.gameState.turnEventCounts?.move).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sgtB", controller: P1, triggered: true })]);
    expect(eye(game)).toEqual({ attachedTo: "sgtB", controller: P1, location: "bf2", owner: P1, zone: "battlefield-bf2" });
  });

  test("(2) on resolution 'here' = B's location = bf2: exactly one 1-Might Recruit TOKEN is played at bf2 and joins as an attacker (466.1.a.2); the combat showdown then opens with P1's Focus", async () => {
    const game = await wornBoard().build();
    const recruit = await bMovesToBf2(game);
    expect(game.state(recruit)).toMatchObject({ combatRole: "attacker", isToken: true, location: "bf2", might: 1, owner: P1 });
    expect(game.state("sgtB")).toMatchObject({ combatRole: "attacker", location: "bf2", might: 4 });
    expect(game.state("mech")).toMatchObject({ combatRole: "defender", might: 8 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  // ---------------------------------------------------------------- (3)
  test("(3) P1 Highlanders B inside the showdown (Reaction, 4 energy; friendly units offered incl. the Recruit); combat: 4+1 = 5 < 8 — the Mech assigns lethal to both, B 'would die' → healed, exhausted, RECALLED to P1's base instead", async () => {
    const game = await wornBoard().build();
    const recruit = await bMovesToBf2(game);
    const offered = (game.p1.option("cast", "highlander")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual([recruit, "sgtA", "sgtB"].sort());
    await game.p1.cast("highlander", { targets: "sgtB" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("highlander")).toBe("trash");
    expect(game.zoneOf("sgtB")).toBe("base");
    expect(game.state("sgtB")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.trash()).not.toContain("sgtB");
  });

  test("(3) a Recall changes location, not zone (455/456.2) → nothing Detaches (719.5): the Eye is still on B and its location is now P1's base with B (719.3.a); B exhausted, the Eye itself still ready (719.4)", async () => {
    const game = await wornBoard().build();
    await bMovesToBf2(game);
    await game.p1.cast("highlander", { targets: "sgtB" });
    await game.settle();
    expect(eye(game)).toEqual({ attachedTo: "sgtB", controller: P1, location: "base", owner: P1, zone: "base" });
    expect(game.state("sgtB").attachments).toEqual(["eye"]);
    expect(game.state("sgtB").isExhausted).toBe(true);
    expect(game.state("eye").isReady).toBe(true);
  });

  test("(3) Recall is not a Move (456.1): still exactly ONE move event this turn and NO second Recruit — the only Recruit (1 Might vs the Mech's 8) died and, being a token, ceased to exist; the Mech keeps bf2 undamaged after combat", async () => {
    const game = await wornBoard().build();
    const recruit = await bMovesToBf2(game);
    await game.p1.cast("highlander", { targets: "sgtB" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.turnEventCounts?.move).toBe(1);
    expect(game.gameState.turnEventCounts?.["play-token-unit"]).toBe(1);
    expect(recruitsAlive(game)).toEqual([]);
    expect(game.zoneOf(recruit)).toBe("gone");
    expect(game.gameState.turnEventCounts?.die).toBe(1); // the Recruit only — B's death was replaced
    expect(game.p1.units("base")).toEqual(["sgtB"]);
    expect(game.state("mech")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (4)
  /** Through (3), then P2's turn with 4 + [order][order] for Vengeance on B sitting in P1's base. */
  async function p2VengeancesB(): Promise<Game> {
    const game = await wornBoard().build();
    await bMovesToBf2(game);
    await game.p1.cast("highlander", { targets: "sgtB" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    await game.p2.cast("vengeance", { targets: "sgtB" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    return game;
  }

  test("(4) P2's Vengeance kills B in P1's base: B → P1's trash; B left the board so the Eye DETACHES (719.5) at B's last location = P1's base (435.4.b) — on the board, unattached, owned and controlled by P1, in nobody's trash", async () => {
    const game = await p2VengeancesB();
    expect(game.zoneOf("sgtB")).toBe("trash");
    expect(game.p1.trash()).toContain("sgtB");
    expect(eye(game)).toEqual({ attachedTo: undefined, controller: P1, location: "base", owner: P1, zone: "base" });
    expect(game.p1.gear()).toContain("eye");
    expect([...game.p1.trash(), ...game.p2.trash()]).not.toContain("eye");
    expect(game.p2.base()).not.toContain("eye");
    expect(recruitsAlive(game)).toEqual([]); // dying/detaching is no move either
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 }); // no Recall/cleanup prompt: it is already home (323.7)
    expect(game.violations()).toEqual([]);
  });

  test("(4) unattached → its Rules Text ([Equip] [order]) is live again (435.1.c / 724): in P1's next Main Phase the only Equip offer is Eye → A; re-equipping onto A at bf1 relocates it there WITHOUT a Move — again no Recruit", async () => {
    const game = await p2VengeancesB();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { power: { order: 1 } });
    expect(equipPairs(game)).toEqual(["eye->sgtA"]);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "eye", unitId: "sgtA" } });
    await game.settle();
    expect(eye(game)).toEqual({ attachedTo: "sgtA", controller: P1, location: "bf1", owner: P1, zone: "battlefield-bf1" });
    expect(game.gameState.turnEventCounts?.move).toBeUndefined();
    expect(recruitsAlive(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  // ---------------------------------------------------------------- (5)
  test("(5) NO Highlander: B (4) and the Recruit (1) both die to the Mech's 8 in the Combat Cleanup at bf2 — B → P1's trash, the Recruit ceases to exist, the undamaged Mech still holds bf2 for P2", async () => {
    const game = await wornBoard({ highlander: false }).build();
    const recruit = await bMovesToBf2(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sgtB")).toBe("trash");
    expect(game.p1.trash()).toEqual(["sgtB"]);
    expect(game.zoneOf(recruit)).toBe("gone");
    expect(game.state("mech")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
  });

  test("(5) the Eye Detaches at bf2 (435.4.b), is a loose gear at a battlefield → Recalled to its CONTROLLER's (P1's) base in the Cleanup (435.4.a / 457.1 / 323.7): on the board in P1's base, unattached, P1's — not P2's base, not any trash", async () => {
    const game = await wornBoard({ highlander: false }).build();
    await bMovesToBf2(game);
    await game.settle();
    expect(eye(game)).toEqual({ attachedTo: undefined, controller: P1, location: "base", owner: P1, zone: "base" });
    expect(game.p1.gear()).toContain("eye");
    expect(game.p2.base()).not.toContain("eye");
    expect(game.cardsAt("bf2")).toEqual(["mech"]);
    expect([...game.p1.trash(), ...game.p2.trash()]).not.toContain("eye");
    expect(game.gameState.turnEventCounts?.move).toBe(1); // the recall home was not a move: still just B's walk
    expect(recruitsAlive(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
