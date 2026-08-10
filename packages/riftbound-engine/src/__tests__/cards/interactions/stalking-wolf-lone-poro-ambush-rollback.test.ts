/**
 * Interaction: Stalking Wolf (unl-166-219) · Unit · Order · 4 + [order] · 6 Might
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *      As an additional cost to play me, kill a Bird, Cat, Dog, or Poro you control. You may play me
 *      to its battlefield (even if you don't have other units there)."
 *   × Stalwart Poro (ogn-052-298) · Unit · Calm · 2 · 2 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *   × Bird token (unl-t02) · 1 Might · Bird · [Deflect]
 *
 * Rules: 822.1.b (Ambush = "I may be played to a battlefield where you control Units" + "I have
 * [Reaction] AS LONG AS I'm being played to a battlefield where you control Units"), 822.3 (no units at
 * the chosen location before Finalization completes → not valid by Ambush), 822.3.a (other permissions —
 * the Wolf's own "you may play me to its battlefield" — keep the LOCATION valid), 813.4 / 813.4.b (a
 * conditionally granted Reaction that is not fulfilled at step 5 → everything undone, card back to hand),
 * 813.3.a, 358.4 / 358.5 (Check Legality: timing permission; failure undoes the actions), 356.2.a.1
 * (mandatory additional cost), 357 (pay costs — the kill happens in step 4), 355.2.a / 355.2.b (valid
 * locations), 343.1.a (no plays in a Showdown state by default), 310.1.a (own turn Neutral Open needs no
 * permission), 337.2 (a unit resolves immediately once finalized), 323.2.a (late arrival gains Defender at
 * the next Cleanup), 323.6 (control of an emptied battlefield is lost only at a Cleanup in an Open state).
 *
 * Q: P2's turn. P1 controls bf1 with a LONE Stalwart Poro; P1 holds the Wolf with exactly 4 + [order].
 *    P2 attacks bf1 with A (4 Might), passes Focus → P1 has Focus.
 *   (a) NO: the Poro is P1's only pet. Killing it empties bf1 before Finalization → Ambush's Reaction is
 *       void at Check Legality → the whole play is undone (Poro alive, runes unspent, Wolf in hand). A
 *       correct engine does not even offer Wolf→bf1 with the Poro as the cost; Wolf→base is illegal too
 *       (no Reaction). Combat: A 4 vs Poro 3 (Shield) → Poro dies, P2 conquers bf1.
 *   (b) YES: + a Bird token in P1's base. Kill the BIRD, Ambush the Wolf to bf1 (Poro still there) →
 *       Wolf enters exhausted, defends; 4 vs 3+6 → A dies, P1 holds. Poro-as-cost for bf1 stays illegal.
 *   (c) YES-2: no Bird, but a second non-pet 2-Might unit at bf1 → killing the Poro is fine (units remain
 *       there) → Wolf enters bf1; 4 vs 2+6 → A dies.
 *   (d) Own turn, Neutral Open, lone Poro at bf1 → legal (310.1.a; location valid per 355.2.a / 822.3.a):
 *       Poro in trash, Wolf exhausted at bf1, P1 still controls bf1.
 *   (Ruling 57b3e2849ef0109a: "not legal on the battlefield where the Poro is; legal to a different one".)
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STALKING_WOLF = "unl-166-219";
const STALWART_PORO = "ogn-052-298";
const BIRD = "unl-t02";
const COST = { energy: 4, power: { order: 1 } };

/** P2's turn; P1 controls bf1 with a lone Stalwart Poro and holds the Wolf with exactly its cost; P2's A (4) in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, COST)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", STALWART_PORO, "poro")
    .unit(P2, "base", { might: 4, name: "Raider A" }, "a")
    .hand(P1, STALKING_WOLF, "wolf");
}

/** A attacks bf1, P2 passes Focus → P1 holds Focus in the combat showdown. */
async function attackAndPassFocus(game: Game): Promise<void> {
  await game.p2.move("a", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

const bf = (loc: unknown): string => String(loc).replace(/^battlefield-/, "");

/** Every (destination, sacrifice) pair the engine offers P1 for playing the Wolf right now. */
function wolfLines(game: Game): { to: string; sacrifice: string | undefined }[] {
  const opt = game.p1.option("play", "wolf");
  return (opt?.variants ?? []).map((v) => ({
    sacrifice: v.params.sacrificeId as string | undefined,
    to: bf(v.params.location ?? v.params.battlefieldId ?? v.params.toBattlefield),
  }));
}

function wolfDestinations(game: Game): string[] {
  return [...new Set(wolfLines(game).map((l) => l.to))].sort();
}

describe("Stalking Wolf × lone Stalwart Poro — Ambush whose cost empties the battlefield", () => {
  // ── (a) NO-side: the Poro at bf1 is P1's only pet ───────────────────────────────────────────────
  test("(a) before Focus passes P1 cannot act at all in P2's showdown (343.1.a)", async () => {
    const game = await board().build();
    await game.p2.move("a", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("play", "wolf")).toBe(false);
  });

  // Expected: no (bf1, poro) line — paying the cost empties bf1 before Finalization, so the Ambush-granted
  // Reaction is not fulfilled at step 5 and the play cannot stand (822.3, 813.4.b, 358.4/358.5); with no
  // other pet the Wolf is simply unplayable now.
  test("(a) with Focus, Wolf → bf1 paying with THAT Poro is not a legal line — killing it leaves no friendly unit at bf1, so Ambush's Reaction is void at Check Legality (822.1.b, 822.3, 813.4.b, 358.4)", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    expect(wolfLines(game)).not.toContainEqual({ sacrifice: "poro", to: "bf1" });
    expect(game.p1.can("play", "wolf")).toBe(false);
    expect((await game.p1.try((p) => p.play("wolf", { sacrifice: "poro", to: "bf1" }))).ok).toBe(false);
  });

  test("(a) Wolf → base is illegal as well: no Reaction when not being played to a battlefield with friendly units (813.3.a, 343.1.a)", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    expect(wolfDestinations(game)).not.toContain("base");
    expect((await game.p1.try((p) => p.play("wolf", { sacrifice: "poro", to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("wolf")).toBe("hand");
  });

  // rule 358.5 / 813.4.b: every action taken while playing is undone — Poro back at bf1 undamaged,
  // runes/energy unspent, Wolf back in hand (ruling 57b3e2849ef0109a).
  test("(a) whatever the engine let P1 start, after the attempt NOTHING has happened: the Poro is alive and undamaged at bf1, 4 energy + [order] unspent, the Wolf is in hand, chain empty (358.5 / 813.4.b rollback)", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    await game.p1.try((p) => p.play("wolf", { sacrifice: "poro", to: "bf1" }));
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro").damage).toBe(0);
    expect(game.p1.resources()).toEqual(COST);
    expect(game.zoneOf("wolf")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["poro"]);
  });

  test("(a) combat then runs A 4 vs Poro 3 ([Shield] as defender) → the Poro dies and P2 conquers bf1 (+1)", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("wolf")).toBe("hand");
    expect(game.p1.resources()).toEqual(COST);
  });

  // ── (b) YES-side: a Bird token in P1's base ─────────────────────────────────────────────────────
  test("(b) with a Bird token in base the Wolf IS playable with Focus — Wolf → bf1 killing the Bird is offered; base is still not a destination (813.3.a)", async () => {
    const game = await board().unit(P1, "base", BIRD, "bird").build();
    await attackAndPassFocus(game);
    expect(game.p1.can("play", "wolf")).toBe(true);
    expect(wolfLines(game)).toContainEqual({ sacrifice: "bird", to: "bf1" });
    expect(wolfDestinations(game)).toEqual(["bf1"]);
  });

  // Only the Bird choice keeps bf1 a Reaction-legal destination; (bf1, poro) is absent and rejected.
  test("(b) even with the Bird available, choosing the PORO as the cost for Wolf → bf1 is illegal (it would empty bf1 before Finalization — 822.3, 813.4.b)", async () => {
    const game = await board().unit(P1, "base", BIRD, "bird").build();
    await attackAndPassFocus(game);
    expect(wolfLines(game)).not.toContainEqual({ sacrifice: "poro", to: "bf1" });
    expect((await game.p1.try((p) => p.play("wolf", { sacrifice: "poro", to: "bf1" }))).ok).toBe(false);
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.zoneOf("wolf")).toBe("hand");
  });

  test("(b) kill the Bird, pay 4 + [order]: the Wolf finalizes and resolves at once (337.2) — exhausted at bf1 beside the still-living Poro; the Bird token ceased to exist", async () => {
    const game = await board().unit(P1, "base", BIRD, "bird").build();
    await attackAndPassFocus(game);
    await game.p1.play("wolf", { sacrifice: "bird", to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("bird")).toBe("gone");
    expect(game.zoneOf("wolf")).toBe("battlefield-bf1");
    expect(game.state("wolf")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
  });

  test("(b) the Wolf becomes a Defender by the next Cleanup (323.2.a); combat 4 vs 3 + 6 → A dies, the Wolf survives, P1 keeps bf1, P2 scores nothing", async () => {
    const game = await board().unit(P1, "base", BIRD, "bird").build();
    await attackAndPassFocus(game);
    await game.p1.play("wolf", { sacrifice: "bird", to: "bf1" });
    expect(game.state("wolf").combatRole).toBe("defender");
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // Focus moved on
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("wolf")).toBe("battlefield-bf1");
    expect(game.state("wolf").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) YES-2: a second non-pet unit stands with the Poro at bf1 ────────────────────────────────
  test("(c) with a non-pet 2-Might buddy also at bf1, killing the Poro still leaves 'a battlefield where you control units' → Wolf → bf1 with the Poro as cost IS offered and legal", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy").build();
    await attackAndPassFocus(game);
    expect(game.p1.can("play", "wolf")).toBe(true);
    expect(wolfLines(game)).toContainEqual({ sacrifice: "poro", to: "bf1" });
    expect(wolfLines(game).map((l) => l.sacrifice)).not.toContain("buddy"); // untagged: never a legal cost
    expect(wolfDestinations(game)).toEqual(["bf1"]); // still no base at Reaction speed
    await game.p1.play("wolf", { sacrifice: "poro", to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("wolf")).toBe("battlefield-bf1");
    expect(game.state("wolf").isExhausted).toBe(true);
  });

  test("(c) combat 4 vs 2 + 6 → A dies, P1 keeps bf1", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy").build();
    await attackAndPassFocus(game);
    await game.p1.play("wolf", { sacrifice: "poro", to: "bf1" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("wolf")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Own-turn contrast ───────────────────────────────────────────────────────────────────────
  test("(d) on P1's own turn in Neutral Open no permission is needed (310.1.a): Wolf → bf1 killing the lone Poro there is offered (bf1 is controlled when chosen, 355.2.a; and 'its battlefield', 822.3.a) alongside base", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", STALWART_PORO, "poro")
      .hand(P1, STALKING_WOLF, "wolf")
      .build();
    expect(game.p1.can("play", "wolf")).toBe(true);
    expect(wolfLines(game)).toContainEqual({ sacrifice: "poro", to: "bf1" });
    expect(wolfLines(game)).toContainEqual({ sacrifice: "poro", to: "base" });
  });

  test("(d) result: Poro in trash, 4 + [order] spent, Wolf exhausted at bf1, and P1 STILL controls bf1 (the Wolf resolved onto it before any Open-state Cleanup could strip control, 323.6 / 337.2)", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", STALWART_PORO, "poro")
      .hand(P1, STALKING_WOLF, "wolf")
      .build();
    await game.p1.play("wolf", { sacrifice: "poro", to: "bf1" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("wolf")).toMatchObject({ isExhausted: true, might: 6, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
