/**
 * Interaction: Caitlyn, Patrolling (ogn-068-298) · Champion Unit · Calm · 3 Might
 *     "I must be assigned combat damage last.
 *      [Exhaust]: Deal damage equal to my Might to a unit at a battlefield. Use this ability only
 *      while I'm at a battlefield."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 + [chaos] · Action
 *     "Move a friendly unit and ready it."
 *
 * Question: Caitlyn is READY in P1's base; P1 controls bf1 (empty); P2 holds bf2 with a 3-Might unit.
 *   (a) In base, is her [Exhaust] ability listed?
 *   (b) P1 Standard-Moves her base→bf1 (no showdown). She is 'at a battlefield' — is the ability listed?
 *       Is a second Standard Move (bf1→base) listed?
 *   (c) Instead, P1 plays Ride the Wind on ready Caitlyn: base→bf1 'and ready it'. State after
 *       resolution, is the ability listed, and what does activating it at P2's unit at bf2 do?
 *   (d) After (b), Ride the Wind bf1→base + ready: ability listed (ready, in base)? Standard Move again
 *       to bf1 — ability listed after that?
 *
 * Rules: 144.2 / 420.3.a (Standard Move's COST is exhausting the unit), 414.1.b (an exhausted object
 * cannot be exhausted), 414.4 (an exhaust cost that cannot be completed cannot be paid), 414.5 ([Exhaust]
 * = "exhaust me"), 402.3 (no legal options → not legal to activate), 415.1.c (readying a ready unit does
 * nothing additional), 381 (activated abilities: controller's turn, Open State).
 *
 * Expected: (a) not listed — location restriction. (b) she arrives EXHAUSTED → [Exhaust] cost unpayable →
 * NOT listed although the location condition is now true; a second Standard Move is not listed either.
 * (c) effect-move, no exhaust; 'ready it' on a ready unit is a no-op; Caitlyn READY at bf1 → ability IS
 * listed; activating exhausts her and deals 3 to P2's 3-Might unit at bf2 → it dies. (d) READY in base →
 * not listed (location); she may Standard-Move again → arrives exhausted → again not listed.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CAITLYN = "ogn-068-298";
const RIDE_THE_WIND = "ogn-173-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CAITLYN, "cait")
    .unit(P2, "bf2", { might: 3, name: "Target" }, "target")
    .hand(P1, RIDE_THE_WIND, "rtw1")
    .hand(P1, RIDE_THE_WIND, "rtw2");
}

/** Unit ids that some Standard Move variant to `dest` would move. */
function moversTo(game: Game, dest: string): string[] {
  const opt = game.p1.legal().find((o) => o.key === `standardMove:to:${dest}`);
  return [...new Set((opt?.variants ?? []).flatMap((v) => (v.params.unitIds as string[] | undefined) ?? []))];
}

const abilityListed = (game: Game) => game.p1.legal().some((o) => o.key.startsWith("activateAbility:cait#"));

/** Cast Ride the Wind on Caitlyn, resolve it and send her to `dest`. */
async function rideTo(game: Game, spell: string, dest: "bf1" | "base"): Promise<void> {
  await game.p1.cast(spell, { targets: "cait" });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(dest === "base" ? "base" : `battlefield-${dest}`);
  await game.settle();
}

describe("Caitlyn, Patrolling — Standard Move exhaust cost vs her [Exhaust] ability; Ride the Wind as the way to arrive ready", () => {
  test("(a) READY in base, P1's Main Phase Open State: the [Exhaust] ability is NOT listed (location restriction, 402.3) — but a Standard Move to bf1 is", async () => {
    const game = await board().build();
    expect(game.state("cait")).toMatchObject({ isReady: true, location: "base", might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(abilityListed(game)).toBe(false);
    expect(game.p1.can("activate", "cait")).toBe(false);
    expect(moversTo(game, "bf1")).toContain("cait");
  });

  test("(b) Standard Move base→bf1 pays its cost by exhausting her (144.2, 420.3.a): she is at bf1 EXHAUSTED, no showdown opened, still P1's open Main Phase", async () => {
    const game = await board().build();
    await game.p1.move("cait", "bf1");
    await game.settle();
    expect(game.locationOf("cait")).toBe("bf1");
    expect(game.state("cait").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) at bf1 but exhausted: the [Exhaust] cost cannot be paid (414.1.b, 414.4) → the ability is NOT listed and activating is refused", async () => {
    const game = await board().build();
    await game.p1.move("cait", "bf1");
    await game.settle();
    expect(abilityListed(game)).toBe(false);
    expect(game.p1.can("activate", "cait")).toBe(false);
    await expect(game.p1.activate("cait", undefined, { targets: "target" })).rejects.toThrow();
    expect(game.state("target").damage).toBe(0);
  });

  test("(b) a second Standard Move bf1→base is NOT listed for exhausted Caitlyn (same unpayable exhaust cost)", async () => {
    const game = await board().build();
    await game.p1.move("cait", "bf1");
    await game.settle();
    expect(moversTo(game, "base")).not.toContain("cait");
    expect(moversTo(game, "bf1")).not.toContain("cait");
    await expect(game.p1.move("cait", "base")).rejects.toThrow();
    expect(game.locationOf("cait")).toBe("bf1");
  });

  test("(c) Ride the Wind on READY Caitlyn base→bf1: an effect-move with no exhaust cost; 'ready it' on a ready unit is a silent no-op (415.1.c) — she is at bf1 READY, spell in trash, chain empty", async () => {
    const game = await board().build();
    await rideTo(game, "rtw1", "bf1");
    expect(game.zoneOf("rtw1")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    expect(game.locationOf("cait")).toBe("bf1");
    expect(game.state("cait")).toMatchObject({ damage: 0, isReady: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) …and now the ability IS listed (P1's turn, Open State, at a battlefield, ready — 381); P2's unit at bf2 is an offered target", async () => {
    const game = await board().build();
    await rideTo(game, "rtw1", "bf1");
    expect(abilityListed(game)).toBe(true);
    expect(game.p1.can("activate", "cait")).toBe(true);
    const targets = game.p1.option("activate", "cait")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    const flat = targets.flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]);
    expect(flat).toContain("target");
  });

  test("(c) activating: cost paid → Caitlyn exhausted with the ability on the chain; on resolution 3 damage to P2's 3-Might unit at bf2 → it dies", async () => {
    const game = await board().build();
    await rideTo(game, "rtw1", "bf1");
    await game.p1.activate("cait", undefined, { targets: "target" });
    expect(game.state("cait").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cait", controller: P1 })]);
    expect(game.zoneOf("target")).toBe("battlefield-bf2");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.p2.trash()).toContain("target");
    expect(game.locationOf("cait")).toBe("bf1");
    expect(abilityListed(game)).toBe(false); // exhausted again
  });

  test("(d) after the Standard Move, Ride the Wind bf1→base + ready: Caitlyn READY in base → ability NOT listed (location restriction, not cost)", async () => {
    const game = await board().build();
    await game.p1.move("cait", "bf1");
    await game.settle();
    expect(game.state("cait").isExhausted).toBe(true);
    await rideTo(game, "rtw1", "base");
    expect(game.locationOf("cait")).toBe("base");
    expect(game.state("cait").isReady).toBe(true);
    expect(abilityListed(game)).toBe(false);
    expect(game.p1.can("activate", "cait")).toBe(false);
  });

  test("(d) …ready again, so a Standard Move base→bf1 IS listed; taking it exhausts her once more → at bf1 exhausted → ability again NOT listed", async () => {
    const game = await board().build();
    await game.p1.move("cait", "bf1");
    await game.settle();
    await rideTo(game, "rtw1", "base");
    expect(moversTo(game, "bf1")).toContain("cait");
    await game.p1.move("cait", "bf1");
    await game.settle();
    expect(game.locationOf("cait")).toBe("bf1");
    expect(game.state("cait").isExhausted).toBe(true);
    expect(abilityListed(game)).toBe(false);
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.violations()).toEqual([]);
  });

  test("net contrast: arriving by Standard Move (exhausted) leaves the ability unlisted; arriving by Ride the Wind (ready) lists it the same turn", async () => {
    const viaMove = await board().build();
    await viaMove.p1.move("cait", "bf1");
    await viaMove.settle();
    expect(abilityListed(viaMove)).toBe(false);

    const viaSpell = await board().build();
    await rideTo(viaSpell, "rtw1", "bf1");
    expect(abilityListed(viaSpell)).toBe(true);
  });
});
