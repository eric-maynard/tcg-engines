/**
 * Interaction: Possession (ogn-203-298) · Chaos Action spell · 8 + [chaos]×3
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Doran's Blade (sfd-095-221) · Equipment · Body · 2 · +2 Might · "[Equip] [body]"        — P2's, worn by …
 *   × Vanguard Sergeant (ogn-219-298) · Unit · 4 · 4 Might (vanilla)                          — P2's, at bf1
 *   × Vengeance (ogn-229-298) · Order spell · 4 + [order][order] · "Kill a unit."               — P2's hand
 *   (+ Angle Shot sfd-011-221 "Choose a unit and an Equipment with the same controller. Attach … or detach … Draw 1.",
 *      Veteran Poro sfd-099-221 [Weaponmaster], Retreat ogn-104-298 "Return a friendly unit to its owner's hand. Its
 *      owner channels 1 rune exhausted." for facets (b) and (e).)
 *
 * Position: P1's turn. P2's Vanguard Sergeant (4) at bf1 wears P2's Doran's Blade (+2 → 6); P2's Buddy (2) is also at
 * bf1 and P2's Wall (9) holds bf2. P1 resolves Possession on the Sergeant.
 *
 * Question. (a) After Possession and the following Cleanup: who controls / owns the Sergeant and the Blade, where is
 * each, is the Blade still attached, what is the Sergeant's Might for P1 — does 323.7 yank the Blade (a P2 permanent
 * now sitting in P1's base) home on its own? (b) Can P1 use the Blade's [Equip]? Can either player Angle-Shot the
 * pair (Sergeant, Blade)? Can P2 reclaim it with a Weaponmaster unit? (c) On P2's turn P2 Vengeances the Sergeant in
 * P1's base: which trash; where is the Blade once detached and after the Cleanup; who owns/controls it; is its [Equip]
 * live again this same Main Phase? (d) Contrast: the possessed Sergeant attacks bf2 and dies there. (e) Contrast: P1
 * Retreats the Sergeant.
 *
 * Rules: 455 / 456.2 (Possession's recall is a location change, not a Move, not a zone change), 719.3 / 719.3.a
 * (attachments share and follow the Top-Most card's location), 719.5 (Detach only on board → non-board), 718.1
 * (attached until Detached), 718.2 (printed [Equip] inactive while attached), 718.5.c (cannot be relocated apart),
 * 718.5.e / 718.5.f (attachment control is independent of the wearer's), 718.5.g (bonus still applies), 323.7 (recall
 * UNATTACHED gear at battlefields and permanents in a base other than their controller's), 435.4.a / 435.4.b (a
 * detached card's location = the wearer's last location), 435.1.c (rules text active again once detached), 457.1
 * (loose gear at a battlefield → its CONTROLLER's base), 428.2 / 127.1 (killed → OWNER's trash), 434.1.f (attaching to
 * a new Top-Most card detaches from the old), 821.1.c (Weaponmaster: "one of your Equipment … even if it's already
 * attached", cost reduced by [A]), 151.2 (Equip is a Main-Phase Open-State action).
 *
 * Expected: (a) Sergeant: controller P1, owner P2, in P1's base, READY state unchanged, 6 Might (4 + 2). Blade: still
 * attached to it (so located with it), controller = owner = P2. The Cleanup does not detach or recall it. (b) No Equip
 * for P1 (not its gear; and the printed [Equip] is inactive while attached — P2 has none either). Angle Shot never
 * offers (Sergeant, Blade) to either player — different controllers. P2's Veteran Poro's Weaponmaster CAN pick the
 * attached Blade and pulls it onto the Poro for [body] − [A] = 0; the Sergeant drops to 4. (c) Sergeant → P2's trash;
 * Blade detaches, unattached, controller/owner P2, ends the Cleanup in P2's base; never in a trash; P2 may Equip it
 * again at once (onto Buddy / Wall). (d) Dies at bf2 → Blade detaches at bf2 → recalled to P2's base (its controller),
 * not P1's. (e) Sergeant → P2's HAND (owner); P2 channels the rune; Blade again ends in P2's base unattached.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const DORANS_BLADE = "sfd-095-221";
const VANGUARD_SERGEANT = "ogn-219-298";
const VENGEANCE = "ogn-229-298";
const ANGLE_SHOT = "sfd-011-221";
const VETERAN_PORO = "sfd-099-221";
const RETREAT = "ogn-104-298";

/**
 * P1's turn (turn 2). bf1 (P2's): P2's Sergeant wearing P2's Blade (6) + P2's Buddy (2). bf2 (P2's): P2's Wall (9).
 * P1: Homebody (2) in base; Possession, Angle Shot, Retreat in hand; 12 energy + 3 chaos (Possession 8+3, then either
 * Reaction). P2: Vengeance, Angle Shot, Veteran Poro in hand (P2's resources are added on P2's turn — pools empty at
 * end of turn).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sarge", { equippedWith: ["blade"] } as Record<string, unknown>)
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "sarge" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, ANGLE_SHOT, "angleP1")
    .hand(P1, RETREAT, "retreat")
    .hand(P2, VENGEANCE, "veng")
    .hand(P2, ANGLE_SHOT, "angleP2")
    .hand(P2, VETERAN_PORO, "poro");
}

/** P1 resolves Possession on the Sergeant (everyone passes; the Cleanup after resolution has run). */
async function possessed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "sarge" });
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.zoneOf("poss")).toBe("trash");
  return game;
}

/** …then on to P2's turn with `pool` floating for P2. */
async function possessedThenP2Turn(pool: { energy?: number; power?: Record<string, number> }): Promise<Game> {
  const game = await possessed();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", pool);
  return game;
}

/** Two-role target tuples a seat's spell currently offers. */
function pairsOffered(game: Game, seat: Seat, alias: string): string[][] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => (Array.isArray(v) ? [...v] : [v]) as string[]);
}

/** Unit ids `seat` may currently activate [Equip] onto with the Blade. */
function equipTargets(game: Game, seat: Seat): string[] {
  return game
    .seat(seat)
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === "blade")
    .map((v) => String(v.params.unitId))
    .sort();
}

describe("(a) Possession on a unit wearing the opponent's Equipment", () => {
  test("setup: the Sergeant is P2's, at bf1, 4 + 2 = 6 with the Blade attached; the Blade is P2's at bf1", async () => {
    const game = await board().build();
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], baseMight: 4, controller: P2, location: "bf1", might: 6, owner: P2 });
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", controller: P2, location: "bf1", owner: P2 });
  });

  test("after Possession + Cleanup: Sergeant controller P1 / owner P2, in base on P1's side; the Blade is STILL ATTACHED and came along (719.3.a) — controller = owner = P2 (718.5.e/f); Sergeant reads 6 for P1 (718.5.g)", async () => {
    const game = await possessed();
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], controller: P1, location: "base", might: 6, owner: P2, zone: "base" });
    expect(game.p1.units("base").sort()).toEqual(["home", "sarge"]);
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", controller: P2, location: "base", owner: P2, zone: "base" });
    expect(game.cardsAt("bf1")).toEqual(["buddy"]);
    expect(game.violations()).toEqual([]);
  });

  test("323.7 does NOT yank the attached Blade home on its own: it is neither detached nor in any trash, and it is still on the Sergeant (6 Might) when P2's turn opens", async () => {
    const game = await possessed();
    expect(game.state("blade").attachedTo).toBe("sarge");
    expect(game.p1.trash()).toEqual(["poss"]);
    expect(game.p2.trash()).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("blade")).toMatchObject({ attachedTo: "sarge", controller: P2, owner: P2 });
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], controller: P1, might: 6 });
  });
});

describe("(b) who can do what with the Blade while it sits on the possessed Sergeant", () => {
  test("P1 has no [Equip] with it (not P1's gear, and the printed [Equip] is inactive while attached — 718.2); P1's gear list is empty, P2's still names the Blade", async () => {
    const game = await possessed();
    expect(equipTargets(game, P1)).toEqual([]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual(["blade"]);
  });

  test("P2 has no [Equip] activation for it either while it is attached (718.2), even with [body] floating on P2's turn", async () => {
    const game = await possessedThenP2Turn({ energy: 2, power: { body: 1 } });
    expect(equipTargets(game, P2)).toEqual([]);
  });

  test("Angle Shot needs a unit and an Equipment with the SAME controller: P1's copy never offers (Sergeant, Blade) — Sergeant is P1's, Blade is P2's — and naming that pair is rejected", async () => {
    const game = await possessed();
    const pairs = pairsOffered(game, P1, "angleP1");
    expect(pairs.some((p) => p.includes("sarge"))).toBe(false);
    expect(pairs.every((p) => p.includes("blade"))).toBe(true); // the only Equipment around; paired with P2's own units only
    expect((await game.p1.try((p) => p.cast("angleP1", { targets: ["sarge", "blade"] }))).ok).toBe(false);
    expect(game.state("blade").attachedTo).toBe("sarge");
  });

  test("…nor does P2's copy on P2's turn: (Buddy, Blade) / (Wall, Blade) are fine, (Sergeant, Blade) is not", async () => {
    const game = await possessedThenP2Turn({ energy: 2 });
    expect(game.p2.can("cast", "angleP2")).toBe(true);
    const pairs = pairsOffered(game, P2, "angleP2").map((p) => p.join("+")).sort();
    expect(pairs).toEqual(["buddy+blade", "wall+blade"]);
    expect((await game.p2.try((p) => p.cast("angleP2", { targets: ["sarge", "blade"] }))).ok).toBe(false);
  });

  test("P2's Veteran Poro (Weaponmaster) CAN name the Blade 'even if it's already attached' (821.1.c): it hops onto the Poro for [body] − [A] = 0; Poro 4, Sergeant back to 4 for P1 (434.1.f, 435.1.e)", async () => {
    const game = await possessedThenP2Turn({ energy: 2, power: { body: 1 } }); // exactly the Poro; the [body] must stay unspent
    await game.p2.play("poro", { to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "equip" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["blade"]);
    await game.p2.pick("blade");
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 1 } });
    expect(game.state("blade")).toMatchObject({ attachedTo: "poro", controller: P2, owner: P2, zone: "base" });
    expect(game.state("poro")).toMatchObject({ attachments: ["blade"], might: 4 });
    expect(game.state("sarge")).toMatchObject({ attachments: [], controller: P1, might: 4, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) P2 Vengeances the possessed Sergeant sitting in P1's base", () => {
  test("Vengeance ('a unit') may pick the Sergeant in P1's base; it is killed into its OWNER's trash — P2's (428.2, 127.1) — not P1's", async () => {
    const game = await possessedThenP2Turn({ energy: 4, power: { body: 1, order: 2 } });
    const offered = pairsOffered(game, P2, "veng").flat().sort();
    expect(offered).toEqual(["buddy", "home", "sarge", "wall"]);
    await game.p2.cast("veng", { targets: "sarge" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["sarge", "veng"]);
    expect(game.p1.trash()).toEqual(["poss"]);
  });

  test("the Blade Detaches (719.5) and, unattached and P2-controlled, ends the Cleanup in P2's base (323.7) — owner and controller P2, attached to nothing, never in a trash; P1's side keeps only Homebody", async () => {
    const game = await possessedThenP2Turn({ energy: 4, power: { body: 1, order: 2 } });
    await game.p2.cast("veng", { targets: "sarge" });
    await game.settle();
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, location: "base", owner: P2, zone: "base" });
    expect(game.p2.gear()).toEqual(["blade"]);
    expect(game.p2.base()).toContain("blade");
    expect(game.p1.base()).toEqual(["home"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.trash()).not.toContain("blade");
    expect(game.p2.trash()).not.toContain("blade");
    expect(game.violations()).toEqual([]);
  });

  test("its printed '[Equip] [body]' is active again at once (435.1.c, 151.2): in this same Main Phase, chain empty, P2 may Equip it onto Buddy or Wall — doing so spends the [body] and makes Buddy 4", async () => {
    const game = await possessedThenP2Turn({ energy: 4, power: { body: 1, order: 2 } });
    await game.p2.cast("veng", { targets: "sarge" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(equipTargets(game, P2)).toEqual(["buddy", "wall"]);
    await game.p2.choose("equipCard", { params: { equipmentId: "blade", unitId: "buddy" } });
    await game.settle();
    expect(game.p2.power("body")).toBe(0);
    expect(game.state("blade")).toMatchObject({ attachedTo: "buddy", controller: P2 });
    expect(game.state("buddy")).toMatchObject({ attachments: ["blade"], might: 4 });
  });
});

describe("(d) contrast — the possessed Sergeant attacks bf2 and dies there", () => {
  test("the Blade rides to bf2 with its wearer (719.3.a); the Sergeant (6) dies into the Wall (9) → P2's trash (owner); the Blade detaches AT bf2 (435.4.b) and is recalled to its CONTROLLER's base — P2's — unattached (457.1); Wall keeps bf2", async () => {
    const game = await possessed();
    expect(game.state("sarge").isReady).toBe(true);
    await game.p1.move("sarge", "bf2");
    expect(game.zoneOf("blade")).toBe("battlefield-bf2");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p2.trash()).toEqual(["sarge"]);
    expect(game.p1.trash()).toEqual(["poss"]);
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, location: "base", owner: P2, zone: "base" });
    expect(game.p2.gear()).toEqual(["blade"]);
    expect(game.p1.base()).toEqual(["home"]);
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(e) contrast — P1 Retreats the possessed Sergeant", () => {
  test("Retreat ('a friendly unit') offers the Sergeant to P1; it returns to its OWNER's hand — P2's — and P2 (owner) channels 1 rune exhausted; the Blade detaches in base and ends unattached on P2's side, P1 keeps nothing", async () => {
    const game = await possessed();
    expect(pairsOffered(game, P1, "retreat").flat().sort()).toEqual(["home", "sarge"]);
    const p2Runes = game.p2.runes().length;
    const p1Runes = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "sarge" });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("hand");
    expect(game.p2.hand()).toContain("sarge");
    expect(game.p1.hand()).not.toContain("sarge");
    expect(game.p2.runes()).toHaveLength(p2Runes + 1);
    expect(game.p2.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(p1Runes);
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, location: "base", owner: P2, zone: "base" });
    expect(game.p2.gear()).toEqual(["blade"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.base()).toEqual(["home"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
