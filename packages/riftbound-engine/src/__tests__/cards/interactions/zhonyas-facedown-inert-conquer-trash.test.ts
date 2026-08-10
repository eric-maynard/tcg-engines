/**
 * Interaction: Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and
 *      recall it."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 Might (vanilla)
 *   × Playful Phantom  (ogn-049-298) · Unit · Calm  · 5 Might (vanilla)
 *
 * Question: P1 controls bf1 with Vanguard Sergeant (4) and hid Zhonya's Hourglass facedown there on
 * a previous turn. On P2's turn P2 moves Playful Phantom (5) into bf1 and a combat showdown opens.
 *   (a) If P1 never flips it, does the FACEDOWN Zhonya's replace Sergeant's combat death? After P2
 *       conquers, where does the facedown card go (hand / trash / stays) and is its identity revealed?
 *   (b) Can P1 flip Zhonya's for [0] during the showdown on P2's turn; where does the gear enter
 *       (base or bf1) and what happens at combat damage?
 *   (c) Variant: P2 attacks with a 3-Might unit so Sergeant survives; P1 flipped Zhonya's anyway —
 *       where is the unattached gear after the combat cleanup?
 *   (d) Could P1 have flipped it on the same turn it was hidden?
 *
 * Rules: 421.3 (a facedown card only has the properties the hiding effect grants — its printed
 * replacement ability is NOT active), 107.3.e/f (Facedown Zone is not a location; the card is
 * private, not a gear on the board), 466.3.a / 466.5 (sole side wins → conquer), 466.5.c + 323.7 +
 * 107.3.d (hidden card that no longer shares a controller with the battlefield is removed to its
 * OWNER's trash), 421.4 (revealed as it changes zones), 811.1.b / 811.6 / 813.1.c.1 (from the next
 * turn a Hidden card has [Reaction] and plays for 0 — also in the opponent's combat showdown),
 * 811.1.d.1 / 811.1.d.1.a / 152.2 (a hidden permanent — gear included — is played TO that
 * battlefield), 323.7 (unattached non-unit gear at a battlefield is recalled to base at the next
 * cleanup), 811.1.b "Beginning on the next turn" (no flip on the hide turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SERGEANT = "ogn-219-298"; // 4 Might
const PHANTOM = "ogn-049-298"; // 5 Might

/** Turn 3, P2 to act. P1 holds bf1 with Sergeant + facedown Zhonya's (hidden earlier). */
function board(attacker: "phantom" | "small" = "phantom") {
  const b = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 0 })
    .resources(P2, { energy: 0 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SERGEANT, "sergeant")
    .facedown(P1, "bf1", ZHONYAS, "zh");
  return attacker === "phantom"
    ? b.unit(P2, "base", PHANTOM, "phantom")
    : b.unit(P2, "base", { might: 3, name: "Small Raider" }, "small");
}

/** P2 attacks bf1 with `unit`, passes Focus; P1 flips the facedown Hourglass. */
async function attackAndFlip(unit: "phantom" | "small"): Promise<Game> {
  const game = await board(unit).build();
  await game.p2.move(unit, "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "zh")).toBe(true);
  await game.p1.reveal("zh");
  return game;
}

describe("Zhonya's Hourglass facedown × combat at its battlefield — inert while hidden, trashed on conquer, live when flipped", () => {
  // ── (a) never flipped ─────────────────────────────────────────────────────────────────────

  test("(a) the FACEDOWN Hourglass is not a gear in play: Sergeant takes 5 and dies, Phantom survives and conquers bf1 for P2 (421.3, 466.5)", async () => {
    const game = await board().build();
    await game.p2.move("phantom", "bf1");
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(0); // 4 marked, healed at the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("(a) after P2 conquers, the hidden card no longer shares a controller with bf1 → it is put in its OWNER's (P1's) trash, not returned to hand, and is no longer hidden (466.5.c, 323.7, 107.3.d, 421.4)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p2.move("phantom", "bf1");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.trash()).toContain("zh");
    expect(game.p2.trash()).not.toContain("zh");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) flipped during P2's combat showdown ───────────────────────────────────────────────

  test("(b) once P2 passes Focus, P1 may play the facedown Hourglass for [0] on P2's turn inside the combat showdown (811.1.b, 811.6, 813.1.c.1)", async () => {
    const game = await board().build();
    await game.p2.move("phantom", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // base cost ignored
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.p1.facedown("bf1")).toEqual([]);
  });

  test("(b) the flip is a permanent play to bf1 (811.1.d.1.a, 152.2): no chain is left open, the face-up gear is P1's, ready, and — being unattached at a battlefield — is recalled to P1's base by the cleanup that follows the play (319.6, 323.7) while the showdown is still open", async () => {
    const game = await attackAndFlip("phantom");
    expect(game.chain()).toEqual([]);
    expect(game.state("zh")).toMatchObject({ cardType: "gear", controller: P1, isHidden: false, isReady: true });
    // Not observable at bf1: the 319.6 cleanup runs inside the same step and 323.7 recalls it.
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.gear()).toContain("zh");
    // Combat has not resolved yet — the showdown is still open. rule 347.1.a /
    // 346: playing a card with Focus is a Focus action, so when the chain it
    // opened closes Focus passes to the next player in turn order — P2 acts.
    expect(game.zoneOf("sergeant")).toBe("battlefield-bf1");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(b) at combat damage Sergeant would die → the Hourglass is killed instead (P1's trash); Sergeant is healed, exhausted and recalled to base", async () => {
    const game = await attackAndFlip("phantom");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.trash()).toContain("zh");
    expect(game.zoneOf("sergeant")).toBe("base");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("(b) with Sergeant recalled Phantom is alone at bf1 → P2 wins the combat and conquers bf1 (+1)", async () => {
    const game = await attackAndFlip("phantom");
    await game.settle();
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) flipped but nothing dies on P1's side ─────────────────────────────────────────────

  test("(c) 3-Might attacker: Sergeant (4) kills it and survives on 3 damage (healed at cleanup); P1 keeps bf1 and the Hourglass is NOT consumed", async () => {
    const game = await attackAndFlip("small");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("sergeant")).toBe("battlefield-bf1");
    expect(game.state("sergeant").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("zh")).not.toBe("trash");
  });

  test("(c) after the combat cleanup the flipped, unattached Hourglass sits in P1's BASE (323.7) — not trashed, not at the battlefield, not facedown", async () => {
    const game = await attackAndFlip("small");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.gear()).toContain("zh");
    expect(game.state("zh")).toMatchObject({ controller: P1, isHidden: false });
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) hide turn ─────────────────────────────────────────────────────────────────────────

  test("(d) on the turn it is hidden the Hourglass cannot be flipped — 'Beginning on the next turn' (811.1.b); it becomes playable once the turn passes", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SERGEANT, "sergeant")
      .unit(P2, "base", PHANTOM, "phantom")
      .hand(P1, ZHONYAS, "zh")
      .build();
    await game.p1.hide("zh", "bf1");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.p1.resources().power.rainbow ?? 0).toBe(0);
    expect(game.p1.can("reveal", "zh")).toBe(false);
    expect((await game.p1.try((p) => p.reveal("zh"))).ok).toBe(false);
    // Next turn (P2's): P2 attacks, passes Focus — now the flip is listed.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("phantom", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "zh")).toBe(true);
  });
});
