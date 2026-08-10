/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow]×2 · [Hidden] [Action]
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   × Forge of the Fluft (sfd-208-221) · Battlefield
 *     "While you control this battlefield, friendly legends have '[Exhaust]: Attach an Equipment you
 *      control to a unit you control.'"
 *   × Doran's Blade (sfd-095-221) · Equipment · +2 Might · [Equip] [body]
 *   with a lone Stalwart Poro (ogn-052-298, 2 Might, Shield) holding the Forge for P2.
 *
 * Question: P1's turn, Neutral Open. P2 controls the Forge with only the Poro; P1 has a ready legend,
 * a unit Y and an unattached Doran's Blade in base.
 *   (a) Right now whose legend has the granted [Exhaust] ability, and can P2 use it during P1's turn?
 *   (b) P1 plays Hostile Takeover on the Poro. When does P2 stop controlling the Forge (before/after the
 *       showdown)? Whose is the battlefield during the non-combat showdown, and whose legend has the
 *       ability during it? What happens when it closes?
 *   (c) After P1 conquers, may P1 exhaust its legend the same turn to attach Doran's Blade to Y?
 *   (d) At end of turn the Poro is recalled to P2 — who controls the Forge (and the grant) going into
 *       P2's turn?
 *
 * Rules: 190.6 / 190.6.a (control of a battlefield = control of its abilities), 190.2.b (controlled by
 * a player or by no one), 190.3.a (a unit that "otherwise becomes present"/changes sides applies
 * Contested), 190.4 / 190.4.c + 323.6 (no units + Open State + no showdown ongoing → lose control at
 * the Cleanup), 323.7 (hidden cards at a battlefield you no longer control are trashed), 323.8 / 323.12
 * (Showdown staged → Non-Combat Showdown begins in Neutral Open), 345 (the contesting player gets
 * Focus), 348.2.a / 348.2.a.1 (sole remaining player establishes control → Conquer), 381 / 310.1.a
 * (activated abilities: controller's turn, Open State), 171 (friendly = controlled by you).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const FORGE_OF_THE_FLUFT = "sfd-208-221";
const DORANS_BLADE = "sfd-095-221";
const STALWART_PORO = "ogn-052-298";
const LOOSE_CANNON = "ogn-251-298"; // P1 legend with no printed activated ability
const NINE_TAILED_FOX = "ogn-255-298"; // P2 legend with no printed activated ability
const SUDDEN_STORM = "sfd-017-221"; // an arbitrary [Hidden] card for the 323.7 facet

/** P1's turn 2. Forge: P2's (P2's card), lone Stalwart Poro. P1: ready legend, Y (2) + loose Doran's Blade in base, HT in hand with exact cost. */
function board(opts: { p2Blade?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .battlefield("forge", { controller: P2, def: FORGE_OF_THE_FLUFT, inert: false, owner: P2 })
    .battlefield("bf2", { controller: null })
    .legend(P1, LOOSE_CANNON, "p1Legend")
    .legend(P2, NINE_TAILED_FOX, "p2Legend")
    .unit(P2, "forge", STALWART_PORO, "poro")
    .unit(P1, "base", { might: 2, name: "Unit Y" }, "Y")
    .gear(P1, DORANS_BLADE, "blade")
    .hand(P1, HOSTILE_TAKEOVER, "ht");
  return opts.p2Blade ? s.gear(P2, DORANS_BLADE, "p2Blade") : s;
}

const forge = (game: Game) => game.gameState.battlefields.forge;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Does `legend` currently carry the Forge's granted ability (layer view of 190.6.a)? */
function hasForgeGrant(game: Game, legend: string): boolean {
  const granted = (game.state(legend).meta.grantedAbilities ?? []) as { sourceCardId?: string }[];
  return granted.some((g) => g.sourceCardId === "forge");
}

/** The activate option for the granted ability on `legend`, if that seat may use it right now. */
function forgeActivation(game: Game, seat: "p1" | "p2", legend: string) {
  return game[seat].legal().find((o) => o.verb === "activate" && o.card === legend);
}

/** HT cast on the Poro and resolved (both pass); stops at whatever the Cleanup produced. */
async function takeoverResolved(s = board()): Promise<Game> {
  const game = await s.build();
  await game.p1.cast("ht", { targets: "poro" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
  return game;
}

/** …and the non-combat showdown passed through by both players. */
async function conquered(s = board()): Promise<Game> {
  const game = await takeoverResolved(s);
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(showdown(game)).toBeUndefined();
  return game;
}

/** P1 activates the granted ability on its legend: blade → Y. */
async function attachBladeToY(game: Game): Promise<void> {
  const opt = forgeActivation(game, "p1", "p1Legend");
  expect(opt).toBeDefined();
  const chooser = (d: Decision) =>
    d.kind === "pick" ? (d.options.some((o) => o.key === "blade") ? "blade" : d.options.some((o) => o.key === "Y") ? "Y" : undefined) : undefined;
  game.script(P1, [chooser, chooser]);
  await game.p1.choose(opt!.key);
}

describe("Hostile Takeover × Forge of the Fluft — the granted legend ability follows CONTROL of the battlefield through the whole cycle", () => {
  // ── (a) before anything happens ────────────────────────────────────────────────────────────

  test("(a) P2 controls the Forge → only P2's legend has the granted ability; P1's legend has nothing (190.6.a, 171)", async () => {
    const game = await board().build();
    expect(forge(game)).toMatchObject({ contested: false, controller: P2 });
    expect(hasForgeGrant(game, "p2Legend")).toBe(true);
    expect(hasForgeGrant(game, "p1Legend")).toBe(false);
    expect(forgeActivation(game, "p1", "p1Legend")).toBeUndefined();
  });

  test("(a) …but P2 cannot activate it during P1's turn — activated abilities need the controller's own turn in an Open State (381, 310.1.a); on P2's own turn the same board does offer it", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    expect(forgeActivation(game, "p2", "p2Legend")).toBeUndefined();
    expect(game.p2.legal().some((o) => o.verb === "activate")).toBe(false);

    const p2Turn = await board({ p2Blade: true }).active(P2).build();
    expect(hasForgeGrant(p2Turn, "p2Legend")).toBe(true);
    expect(forgeActivation(p2Turn, "p2", "p2Legend")).toBeDefined();
    expect(forgeActivation(p2Turn, "p1", "p1Legend")).toBeUndefined();
  });

  // ── (b) Hostile Takeover resolves ──────────────────────────────────────────────────────────

  test("(b) Hostile Takeover offers only the enemy Poro, costs exactly 5 + 2, and on resolution P1 controls the Poro (owner P2), readied, still at the Forge", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "ht")?.fields.find((f) => f.name === "targets");
    expect([...new Set((field?.options ?? []).flat() as string[])]).toEqual(["poro"]);
    await game.p1.cast("ht", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("poro")).toMatchObject({ controller: P1, isReady: true, owner: P2, zone: "battlefield-forge" });
    expect(game.p1.units("forge")).toEqual(["poro"]);
    expect(game.p2.units("forge")).toEqual([]);
  });

  test("(b) the Cleanup after HT: P2 — no units there, Open State, nothing ongoing yet — LOSES the Forge BEFORE the showdown begins; it is Uncontrolled (not P1's), Contested by P1, and a Non-Combat Showdown opens with P1 holding Focus (323.6, 190.2.b, 190.3.a, 323.8, 323.12, 345)", async () => {
    const game = await takeoverResolved();
    expect(forge(game)).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: "forge", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("poro").combatRole).toBeNull(); // not a combat
    expect(game.p1.points()).toBe(0); // nothing conquered yet
  });

  test("(b) during that showdown NEITHER legend has the granted ability — P2 no longer controls the Forge and P1 does not control it yet (190.6.a: condition false for both)", async () => {
    const game = await takeoverResolved();
    expect(showdown(game)).toBeDefined();
    expect(hasForgeGrant(game, "p2Legend")).toBe(false);
    expect(hasForgeGrant(game, "p1Legend")).toBe(false);
    expect(forgeActivation(game, "p1", "p1Legend")).toBeUndefined();
    expect(forgeActivation(game, "p2", "p2Legend")).toBeUndefined();
  });

  test("(b) 323.7: a card P2 had hidden at the Forge is trashed in that same Cleanup, once P2 no longer controls the battlefield", async () => {
    const game = await takeoverResolved(board().facedown(P2, "forge", SUDDEN_STORM, "p2Hidden"));
    expect(forge(game)?.controller).toBeNull();
    expect(game.zoneOf("p2Hidden")).toBe("trash");
    expect(game.p2.trash()).toContain("p2Hidden");
    expect(game.p2.facedown("forge")).toEqual([]);
  });

  test("(b) both pass Focus → the showdown closes with only P1's (stolen) Poro there: P1 establishes control = Conquer, scores 1, Contested cleared ('Otherwise, conquer', 348.2.a/.a.1)", async () => {
    const game = await conquered();
    expect(forge(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["forge"]);
    expect(game.locationOf("poro")).toBe("forge");
    expect(game.state("poro").controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) P1 now controls the Forge ──────────────────────────────────────────────────────────

  test("(c) after the conquer P1's legend HAS the granted ability and P2's does not (190.6.a) — and it is P1's turn, Neutral Open, so P1 may activate it now (381)", async () => {
    const game = await conquered();
    expect(hasForgeGrant(game, "p1Legend")).toBe(true);
    expect(hasForgeGrant(game, "p2Legend")).toBe(false);
    expect(game.state("p1Legend").isReady).toBe(true);
    expect(forgeActivation(game, "p1", "p1Legend")).toBeDefined();
    expect(forgeActivation(game, "p2", "p2Legend")).toBeUndefined();
  });

  test("(c) P1 exhausts its legend: the ability goes on the chain, and on resolution Doran's Blade is attached to Y (+2 → 4 Might) for no energy/power — [Exhaust] was the whole cost", async () => {
    const game = await conquered();
    await attachBladeToY(game);
    expect(game.state("p1Legend").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "p1Legend", controller: P1, triggered: false, type: "ability" })]);
    expect(game.state("blade").attachedTo).toBeUndefined(); // not before it resolves
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("blade").attachedTo).toBe("Y");
    expect(game.state("Y")).toMatchObject({ baseMight: 2, might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // HT took everything; the attach was free
    expect(forgeActivation(game, "p1", "p1Legend")).toBeUndefined(); // legend exhausted → cannot pay again
    expect(game.violations()).toEqual([]);
  });

  // ── (d) end of turn ────────────────────────────────────────────────────────────────────────

  test("(d) at end of turn HT's delayed effect returns the Poro to P2 and recalls it to P2's base; with no P1 unit left and no showdown, P1 loses the Forge — it enters P2's turn UNCONTROLLED and uncontested (317.1, 455, 323.6, 190.4.c)", async () => {
    const game = await conquered();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.state("poro")).toMatchObject({ controller: P2, owner: P2, zone: "base" });
    expect(game.cardsAt("forge")).toEqual([]);
    expect(forge(game)).toMatchObject({ contested: false, controller: null });
    expect(showdown(game)).toBeUndefined();
    expect(game.p1.points()).toBe(1); // kept the conquer point, nothing more
    expect(game.p2.points()).toBe(0);
  });

  test("(d) going into P2's turn NOBODY has the granted ability: P1 lost control, and P2 does not get it back merely by owning / formerly controlling the Forge — P2's ready legend (with its own Equipment in base) offers no activation on P2's own turn", async () => {
    const game = await conquered(board({ p2Blade: true }));
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(hasForgeGrant(game, "p1Legend")).toBe(false);
    expect(hasForgeGrant(game, "p2Legend")).toBe(false);
    expect(game.state("p2Legend").isReady).toBe(true);
    expect(forgeActivation(game, "p2", "p2Legend")).toBeUndefined();
    expect(forgeActivation(game, "p1", "p1Legend")).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("(d) P2 must re-establish control the normal way: moving the Poro back onto the empty Forge → showdown → control (190.4) → P2's legend has the ability again and can use it that turn", async () => {
    const game = await conquered(board({ p2Blade: true }));
    await game.advanceTurn();
    expect(game.state("poro").isReady).toBe(true);
    await game.p2.move("poro", "forge");
    await game.settle(); // hands back the auto-begun non-combat showdown once …
    await game.settle(); // … then both pass and P2 takes the Forge
    expect(forge(game)).toMatchObject({ contested: false, controller: P2 });
    expect(hasForgeGrant(game, "p2Legend")).toBe(true);
    expect(hasForgeGrant(game, "p1Legend")).toBe(false);
    expect(forgeActivation(game, "p2", "p2Legend")).toBeDefined();
  });
});
