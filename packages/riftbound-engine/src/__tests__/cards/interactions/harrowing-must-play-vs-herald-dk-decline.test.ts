/**
 * Interaction: The Harrowing (ogn-198-298) × Rift Herald (unl-179-219) — zone-privacy matrix for two near-identical
 * "play a unit from <zone>" instructions, neither of which says "may".
 *
 *   The Harrowing — Spell · Chaos · 6 + [chaos][chaos] · Action
 *     "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *   Rift Herald — Unit · Order · 8 · 7 Might
 *     "[Deathknell][>] Play a unit from your hand to your base, ignoring its Energy cost. (… You must still pay its
 *      Power cost.)"
 *   T = "Trash Titan" (inline unit, 4 energy + [fury], 3 Might) in P1's TRASH; H = "Hand Hopper" (inline unit, 3 energy,
 *   2 Might) in P1's HAND. Vengeance (ogn-229-298, "Kill a unit.") is P1's neutral way to kill its own Herald.
 *
 * Rules: 108.1.b (the chain is public), 108.2.d / 355.10.a.1 (the trash is a Public zone → "a unit from your trash" is
 * a TARGET, 355.10.a, chosen and announced as the spell is played), 108.7.c / 108.7.e (the hand is Private; only its
 * COUNT is public), 128.4 / 128.6 / 128.6.a (an instruction that names a card TYPE in a PRIVATE zone may be ignored by
 * its player even without "may" — nobody can verify the hand), 355.10.a (hand cards are not targets: chosen on
 * resolution), 419.3.c (an ignored/impossible limited play simply does nothing).
 *
 * Question: (a) P1 casts The Harrowing: is T chosen at finalization, does P2's view of the chain item name T, may P1
 * resolve it choosing nothing while T is legal and affordable? (b) Rift Herald dies and its Deathknell resolves: is H
 * chosen at finalization or resolution, does P2's view of the Decision list H, may P1 decline with H in hand?
 * (c) P1's hand holds no unit at all — is P2's observable identical to (b)-declined?
 *
 * Expected: (a) T is a play-time TARGET (required `targets` field offering exactly T); the chain item — in P2's view
 * too — carries targets [T]; on resolution there is no "none": the only prompt is WHERE T goes (no decline), T lands on
 * the board and its [fury] is paid. (b) The Deathknell finalizes with NO card choice (chain item has no targets); P2's
 * priority window shows only "Rift Herald"; after both pass a pick is surfaced to P1 alone — P2.view().decision is a
 * bare summary (seat/kind/prompt, no options), P2.decision() is null, H's face appears nowhere in P2's view; "decline"
 * is legal with H in hand → H stays in hand unrevealed, nothing paid, no violation. (c) No unit in hand → the engine
 * skips the prompt (or offers only "none"); P2 sees exactly what it saw in (b)-declined: hand count unchanged, no
 * reveal, empty chain, P1's open main phase.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_HARROWING = "ogn-198-298";
const RIFT_HERALD = "unl-179-219";
const VENGEANCE = "ogn-229-298"; // 4 + [order][order] · "Kill a unit."

const HAND_UNIT_NAME = "Hand Hopper";

/**
 * P1's turn, open main phase. P1: Rift Herald alone at bf1 (P1 controls it), Trash Titan (4 + [fury], 3) in the trash,
 * The Harrowing + Vengeance in hand (+ Hand Hopper unless `handUnit: false`), and exactly enough to cast both spells and
 * pay one [fury]: 10 energy, 2 chaos, 2 order, 1 fury. P2: a bystander in base.
 */
function board(opts: { handUnit?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 10, power: { chaos: 2, fury: 1, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RIFT_HERALD, "herald")
    .trash(P1, { cardType: "unit", energyCost: 4, might: 3, name: "Trash Titan", powerCost: ["fury"] }, "titan")
    .hand(P1, THE_HARROWING, "harrowing")
    .hand(P1, VENGEANCE, "vengeance")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe");
  if (opts.handUnit ?? true) {
    s.hand(P1, { cardType: "unit", energyCost: 3, might: 2, name: HAND_UNIT_NAME }, "hopper");
  }
  return s;
}

/** Card ids a `targets` field offers. */
function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Number of (hidden) hand entries P2's view lists for P1 — the only public fact about a hand (108.7.e). */
function p1HandCountSeenByP2(game: Game): number {
  return (game.p2.view().zones.hand ?? []).filter((c) => (c as { owner?: string }).owner === P1).length;
}

/** P1 Vengeances its own Herald; both pass so it resolves; Herald dies and its Deathknell is the lone chain item with P1 on priority. */
async function killHerald(game: Game): Promise<void> {
  await game.p1.cast("vengeance", { targets: "herald" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("herald")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
}

describe("(a) The Harrowing — 'a unit from your trash' is a public-zone TARGET and the play is compulsory", () => {
  test("T is chosen as the spell is played: the cast option has a REQUIRED `targets` field offering exactly the trash unit (355.10.a / 355.10.a.1)", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "harrowing")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 1, min: 1, required: true });
    expect(targetsOffered(game, "harrowing")).toEqual(["titan"]);
    // Herald (board) and Hopper (hand) are units too, but not in the trash → never offered.
    expect(targetsOffered(game, "harrowing")).not.toContain("herald");
    expect(targetsOffered(game, "harrowing")).not.toContain("hopper");
  });

  test("once finalized the chain item publicly names T: the spectator view AND P2's own view show targets ['titan'] (108.1.b); 6 energy + 2 chaos are paid, T is still in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("harrowing", { targets: "titan" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "harrowing", controller: P1, targets: ["titan"], type: "spell" })]);
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "harrowing", name: "The Harrowing", targets: ["titan"] })]);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 0, fury: 1, order: 2 } });
    expect(game.zoneOf("titan")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("no 'none' at resolution: with T legal and its [fury] affordable the only prompt is WHERE T goes (destination, no decline) — declining is rejected, T must be played (128.6 does not apply to a public zone)", async () => {
    const game = await board().build();
    await game.p1.cast("harrowing", { targets: "titan" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, semantics: "destination" });
    expect(d?.kind === "pick" && d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.state("titan")).toMatchObject({ controller: P1, isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 0, fury: 0, order: 2 } }); // Energy ignored, [fury] paid
    expect(game.zoneOf("harrowing")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Rift Herald's Deathknell — 'a unit from your hand' is a private-zone choice made on resolution, and declinable", () => {
  test("finalized with NO card choice: the Deathknell chain item carries no targets, and P2's priority window shows just 'Rift Herald' — H is not named anywhere P2 can see (355.10.a, 108.7.c)", async () => {
    const game = await board().build();
    await killHerald(game);
    expect(game.chain()[0]?.targets).toBeUndefined();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const p2v = game.p2.view();
    expect(p2v.chain).toEqual([expect.objectContaining({ cardId: "herald", name: "Rift Herald", triggered: true })]);
    expect(p2v.chain[0]?.targets).toBeUndefined();
    expect(JSON.stringify(p2v)).not.toContain(HAND_UNIT_NAME);
    expect(game.zoneOf("hopper")).toBe("hand");
  });

  test("at resolution a pick is surfaced to P1 ONLY: P1's Decision lists H by name with a legal decline; P2.view().decision is a bare summary (seat/kind/prompt — no options, no card ids) and P2.decision() is null", async () => {
    const game = await board().build();
    await killHerald(game);
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", min: 0, seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => [o.card, o.label])).toEqual([["hopper", `${HAND_UNIT_NAME} [hopper]`]]);

    const seen = game.p2.view().decision;
    expect(seen).toMatchObject({ kind: "pick", seat: P1 });
    expect(seen).not.toHaveProperty("options");
    expect(JSON.stringify(seen)).not.toContain("hopper");
    expect(JSON.stringify(seen)).not.toContain(HAND_UNIT_NAME);
    expect(game.p2.decision()).toBeNull();
    // P2's view of P1's hand: two face-down entries (Harrowing + Hopper), no identities.
    expect(game.p2.view().zones.hand?.every((c) => (c as { hidden?: boolean }).hidden === true)).toBe(true);
    expect(p1HandCountSeenByP2(game)).toBe(2);
    expect(JSON.stringify(game.p2.view().zones)).not.toContain(HAND_UNIT_NAME);
  });

  test("128.6 / 128.6.a: P1 may DECLINE even while holding H — legal, no violation; H stays in hand unrevealed, nothing is paid, the Deathknell just does nothing (419.3.c); back to P1's open main phase", async () => {
    const game = await board().build();
    await killHerald(game);
    await game.settle();
    const before = game.p1.resources();
    expect((await game.p1.try((p) => p.decline())).ok).toBe(true);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("hopper")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["harrowing", "hopper"]);
    expect(game.p1.resources()).toEqual(before);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.publicReveals ?? []).toEqual([]);
    expect(JSON.stringify(game.p2.view().zones)).not.toContain(HAND_UNIT_NAME);
    expect(p1HandCountSeenByP2(game)).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: accepting instead plays H to P1's BASE for 0 energy (it has no Power cost) — the instruction works, declining was a choice, not an impossibility", async () => {
    const game = await board().build();
    await killHerald(game);
    await game.settle();
    await game.p1.pick("hopper");
    await game.settle();
    expect(game.state("hopper")).toMatchObject({ controller: P1, zone: "base" });
    expect(game.p1.energy()).toBe(6); // 10 − 4 (Vengeance); Hopper's 3 ignored
    expect(p1HandCountSeenByP2(game)).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — P1's hand holds no unit at all", () => {
  test("the Deathknell resolves into nothing: no pick is surfaced to anyone (or only a bare 'none'), and P2's observable is identical to (b)-declined — P1's public hand COUNT unchanged (108.7.e), no reveal, empty chain, P1's open main phase", async () => {
    const game = await board({ handUnit: false }).build();
    await killHerald(game);
    const handBefore = p1HandCountSeenByP2(game);
    expect(handBefore).toBe(1); // just The Harrowing (a spell)
    const s = await game.settle();
    if (s.reason === "unanswered") {
      // Tolerated shape: an empty, declinable prompt for P1 — still nothing for P2 to read.
      const d = game.decision();
      expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
      expect(d?.kind === "pick" && d.options).toEqual([]);
      expect(game.p2.view().decision).not.toHaveProperty("options");
      await game.p1.decline();
      await game.settle();
    } else {
      expect(s.reason).toBe("open");
    }
    expect(p1HandCountSeenByP2(game)).toBe(handBefore);
    expect(game.p2.view().zones.hand?.every((c) => (c as { hidden?: boolean }).hidden === true)).toBe(true);
    expect(game.gameState.publicReveals ?? []).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.p2.view().decision).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("side by side: what P2 can observe after (b)-declined and after (c) is the same modulo the pre-existing hand count — same chain, same decision summary, same trash contents, no reveal in either", async () => {
    const declined = await board().build();
    await killHerald(declined);
    await declined.settle();
    await declined.p1.decline();
    await declined.settle();

    const empty = await board({ handUnit: false }).build();
    await killHerald(empty);
    await empty.settle();
    if (empty.decision()?.kind === "pick") {
      await empty.p1.decline();
      await empty.settle();
    }

    const a = declined.p2.view();
    const b = empty.p2.view();
    expect(a.chain).toEqual(b.chain);
    expect({ ...a.decision, id: undefined }).toEqual({ ...b.decision, id: undefined });
    expect((a.zones.trash ?? []).map((c) => (c as { id?: string }).id).sort()).toEqual((b.zones.trash ?? []).map((c) => (c as { id?: string }).id).sort());
    expect(p1HandCountSeenByP2(declined)).toBe(2);
    expect(p1HandCountSeenByP2(empty)).toBe(1);
    expect(declined.gameState.publicReveals ?? []).toEqual(empty.gameState.publicReveals ?? []);
  });
});
