/**
 * Interaction: Charm (ogn-043-298) · Spell · Calm · 1+[calm] · Action — "Move an enemy unit."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *   × Shipyard Skulker (ogn-175-298) · Unit · Chaos · 3 · 3 Might (vanilla) — the enemy unit
 *   (+ a vanilla 4-Might "Vanguard Sergeant" holding P1's bfA, a vanilla 1-Might "Scout" in P1's base)
 *
 * Rules: 355.4 / 355.4.a (a spell that moves a unit chooses target AND destination as it is finalized —
 * a destination is a location OTHER than the mover's current one where it could be), 359.3.e.2 (a target
 * is re-checked against the targeting words only: "an enemy unit"), 359.3.e.6 (an instruction that has
 * become impossible is ignored), 359.3.e.10 (a spell whose instructions do nothing still resolved / was
 * played; costs stay paid), 446.3 / 446.3.c (perform the move to the locked destination if still legal),
 * 420.3.a (an effect move does not exhaust), 190.3.a / 450 (the ARRIVING unit's controller applies
 * Contested), 453 (Cleanup after a move stages Showdown/Combat), 323.6 (empty battlefield loses its
 * controller at an Open cleanup), 323.7, 323.9, 323.13 (Combat begins only in a Neutral Open state),
 * 464.2.c.1 / 464.2.c.1.a (Attacker = the player who applied Contested, even off-turn), 345 (Focus
 * starts with the attacker).
 *
 * Question: P1's turn, Neutral Open. P1 holds bfA with Vanguard Sergeant (4). P2 holds bfB with Shipyard
 * Skulker (3), has Flash + 2 energy. P1 casts Charm on Skulker.
 *   (a) When is the destination chosen and what is offered?
 *   (b) X: dest = bfA locked; P2 Flashes Skulker home in response. Charm resolves: still moves base → bfA?
 *       Who contested / attacks / holds Focus; what became of bfB; combat outcome?
 *   (c) Y: dest = P2's base locked; P2 Flashes Skulker home. Charm resolves onto a unit already there.
 *   (d) Z: dest = P2's base, no response.
 *
 * Expected: (a) destination is a FINALIZATION choice (timing FIN) made before anyone gets priority;
 * offered = {P2's base, bfA} — not bfB (current location), not P1's base. (b) Flash resolves first
 * (Skulker → P2 base; bfB still P2's while the chain is Closed); Charm: Skulker is still "an enemy unit"
 * → legal; bfA ≠ its current location → moved base → bfA, NOT exhausted; Contested applied by P2;
 * chain empty → Combat begins with P2 = Attacker holding Focus on P1's turn, Sergeant defends; bfB now
 * uncontrolled; pass/pass → Skulker dies, Sergeant lives, P1 keeps bfA, no points. (c) move to where it
 * already is = impossible → ignored; Charm still resolved → trash, 1 energy + calm spent, nothing
 * contested/staged, bfB uncontrolled. (d) Skulker → P2's base ready, bfB uncontrolled, no showdown; P1
 * may then Standard-Move Scout into open bfB and conquer it.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const FLASH = "ogs-011-024";
const SKULKER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } }) // exactly Charm
    .resources(P2, { energy: 2 }) // exactly Flash
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { might: 4, name: "Vanguard Sergeant" }, "sarge")
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout") // makes P1's base a real, distinct place
    .unit(P2, "bfB", SKULKER, "skulker")
    .hand(P1, CHARM, "charm")
    .hand(P2, FLASH, "flash");
}

const bf = (game: Game, id: string) => game.gameState.battlefields[id];
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
const pickKeys = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []);

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1 casts Charm on Skulker and locks `dest`; P1 passes; P2 responds with Flash on Skulker; Flash resolves (both pass once). Charm still pending. */
async function charmLockedThenFlashResolved(dest: "base" | "battlefield-bfA"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "skulker" });
  await game.p1.pick(dest);
  await game.p1.passPriority();
  await game.p2.cast("flash", { targets: "skulker" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Flash (newest) resolves
  return game;
}

/** Both pass on the remaining Charm → it resolves. */
async function resolveCharm(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Charm: destination locked at finalization, then Flash in response", () => {
  // ── (a) finalization ─────────────────────────────────────────────────────────────────────────

  test("(a) Charm ('an enemy unit') offers only Skulker — never P1's own Sergeant/Scout", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "charm")).toEqual(["skulker"]);
    await expect(game.p1.cast("charm", { targets: "sarge" })).rejects.toThrow();
  });

  test("(a) the destination is asked AT ONCE as a finalization choice (timing FIN, P1, bound to Charm's chain item) — cost already paid, before anyone holds priority (355.4)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "skulker" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "skulker", pendingChoiceType: "choose-destination" }, timing: "FIN" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["skulker"] })]);
    expect(game.p2.can("cast", "flash")).toBe(false); // P2 has no priority yet
  });

  test("(a) offered destinations = { P2's base, bfA } exactly — bfB (current location) and P1's base are not offered (355.4.a, 323.7)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "skulker" });
    expect(pickKeys(game.decision())).toEqual(["base", "battlefield-bfA"]);
    await expect(game.p1.pick("battlefield-bfB")).rejects.toThrow();
  });

  test("(a) after locking bfA nothing has moved; P1 holds priority first, then P2 — who may now Flash its own Skulker (still friendly to P2, at bfB)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "skulker" });
    await game.p1.pick("battlefield-bfA");
    expect(game.locationOf("skulker")).toBe("bfB");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "skulker" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "charm", controller: P1, targets: ["skulker"] }),
      expect.objectContaining({ cardId: "flash", controller: P2, targets: ["skulker"] }),
    ]);
    expect(game.p2.energy()).toBe(0);
  });

  // ── (b) Branch X: dest = bfA, Flash home in response ─────────────────────────────────────────

  test("(b) Flash resolves first (LIFO): Skulker bfB → P2's base, ready; Charm still pending; bfB is STILL P2's — the chain is a Closed state (323.6)", async () => {
    const game = await charmLockedThenFlashResolved("battlefield-bfA");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isReady: true, zone: "base" });
    expect(game.p2.base()).toContain("skulker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", targets: ["skulker"] })]);
    expect(bf(game, "bfB")?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) Charm resolves: Skulker is still 'an enemy unit' (legal, 359.3.e.2) and bfA is still another location → it IS moved base → bfA, NOT exhausted, still P2's (446.3, 420.3.a)", async () => {
    const game = await charmLockedThenFlashResolved("battlefield-bfA");
    await resolveCharm(game);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isExhausted: false, owner: P2, zone: "battlefield-bfA" });
    expect(game.chain()).toEqual([]);
  });

  test("(b) Contested at bfA was applied BY P2 — the arriving unit's controller — although P1 cast the spell; bfA still P1's (190.3.a, 450)", async () => {
    const game = await charmLockedThenFlashResolved("battlefield-bfA");
    await resolveCharm(game);
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("(b) chain empty + Neutral Open on P1's turn → the staged Combat BEGINS: P2 is the Attacker and holds Focus (and the first action), P1 defends; Skulker attacker, Sergeant defender (453, 323.13, 464.2.c.1, 345)", async () => {
    const game = await charmLockedThenFlashResolved("battlefield-bfA");
    await resolveCharm(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("skulker").combatRole).toBe("attacker");
    expect(game.state("sarge").combatRole).toBe("defender");
    expect(game.state("scout").combatRole).toBeNull();
  });

  test("(b) bfB — emptied by Flash — is uncontrolled once Charm has resolved (first Open cleanup), before any combat damage (323.6)", async () => {
    const game = await charmLockedThenFlashResolved("battlefield-bfA");
    await resolveCharm(game);
    expect(game.cardsAt("bfB")).toEqual([]);
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: null });
  });

  test("(b) pass/pass: 3 into 4, 4 into 3 → Skulker dies, Sergeant survives (healed), P1 keeps bfA, nobody scores; back to P1's main phase", async () => {
    const game = await charmLockedThenFlashResolved("battlefield-bfA");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["skulker", "flash"]));
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Branch Y: dest = P2's base, Flash home in response ───────────────────────────────────

  test("(c) with dest = base locked, Flash puts Skulker in P2's base first; when Charm resolves the move 'to where it already is' is impossible → ignored: Skulker stays put, ready (359.3.e.6, 355.4.a)", async () => {
    const game = await charmLockedThenFlashResolved("base");
    expect(game.state("skulker")).toMatchObject({ isReady: true, zone: "base" });
    await resolveCharm(game);
    expect(game.state("skulker")).toMatchObject({ controller: P2, isExhausted: false, owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("skulker");
    expect(game.p1.base()).not.toContain("skulker");
  });

  test("(c) Charm still counts as played and resolved: it is in P1's trash, the 1 energy + calm stay spent, chain empty, P1's open main phase (359.3.e.10)", async () => {
    const game = await charmLockedThenFlashResolved("base");
    await resolveCharm(game);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.p1.trash()).toEqual(["charm"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) no move happened → nothing is Contested or staged anywhere, no combat roles; bfB (empty) is uncontrolled, bfA untouched (453, 323.6)", async () => {
    const game = await charmLockedThenFlashResolved("base");
    await resolveCharm(game);
    expect(showdown(game)).toBeUndefined();
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: null });
    expect(game.state("skulker").combatRole).toBeNull();
    expect(game.state("sarge").combatRole).toBeNull();
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Branch Z: dest = P2's base, no response ──────────────────────────────────────────────

  test("(d) no response: Charm moves Skulker bfB → P2's base READY (an effect move does not exhaust, 420.3.a); Flash still in P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "skulker" });
    await game.p1.pick("base");
    await resolveCharm(game);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isExhausted: false, isReady: true, zone: "base" });
    expect(game.p2.base()).toContain("skulker");
    expect(game.p1.base()).toEqual(["scout"]);
    expect(game.zoneOf("flash")).toBe("hand");
  });

  test("(d) a base is not a battlefield: nothing Contested, no showdown; the following Open cleanup drops P2's control of the now-empty bfB (323.6); P1's open main phase", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "skulker" });
    await game.p1.pick("base");
    await resolveCharm(game);
    expect(showdown(game)).toBeUndefined();
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: null });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("(d) follow-up: P1 Standard-Moves Scout base → open bfB; the non-combat showdown passes → P1 conquers bfB and scores 1", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "skulker" });
    await game.p1.pick("base");
    await resolveCharm(game);
    expect(game.p1.can("standardMove")).toBe(true);
    await game.p1.move("scout", "bfB");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: false });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
