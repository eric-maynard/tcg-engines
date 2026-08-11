/**
 * Interaction: one death, two same-controller triggers whose ORDER decides a Level threshold.
 *   Rift Herald (unl-179-219) · Unit · Order · 8 + [order] · 7 Might
 *     "[Deathknell][>] Play a unit from your hand to your base, ignoring its Energy cost. (You must still
 *      pay its Power cost.)"
 *   × Vicious Snapjaws (unl-129-219) · Unit · Chaos · 5 · 5 Might — "When another friendly unit dies, gain 1 XP."
 *   × Bandle Soldier (unl-151-219) · Unit · Order · 4 + [order] · 5 Might — "[Level 3][>] I enter ready."
 *   (+ Vengeance ogn-229-298 "Kill a unit." as the kill)
 *
 * Rules: 383.3.d (same-controller simultaneous triggers → that player orders them), 340 (LIFO), 808.1.d.2 /
 * 808.1.d.3 (Deathknell queued/noted before the Herald hits the trash), 824.1.c / 824.1.d / 727.1.b.2 (a
 * Level ability is active exactly while its controller has ≥ N XP), 369.3 ("I enter ready" replaces the
 * entering event only), 356.1.b (energy ignored, power still paid).
 *
 * Question: P1 has exactly 2 XP, Rift Herald (P1) at bf1, Vicious Snapjaws in P1's base, Bandle Soldier in
 * hand with 1 [order] pooled. The Herald is killed (Vengeance — on P2's turn, or P1's own).
 *   (a) Is P1 offered the order, and does it change READY vs EXHAUSTED? Order 1 (Snapjaws on top): XP 2→3
 *       first, then the Soldier is played at Level 3 → READY. Order 2 (Herald DK on top): Soldier played at
 *       2 XP → EXHAUSTED, then XP 3.
 *   (b) In order 2 the Soldier does NOT become ready retroactively when XP reaches 3 in the same chain.
 *   (c) Controls: already 3 XP → ready either way (XP 4); 1 XP → exhausted either way (XP 2).
 *   Throughout: Herald → trash, Soldier's energy ignored but its [order] paid.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIFT_HERALD = "unl-179-219";
const VICIOUS_SNAPJAWS = "unl-129-219";
const BANDLE_SOLDIER = "unl-151-219";
const VENGEANCE = "ogn-229-298";

/**
 * P2's turn 2. P1: `xp` XP, Herald at bf1, Snapjaws in base, Bandle Soldier in hand, 0 energy + 1 [order].
 * P2: Vengeance and exactly its cost (4 + [order][order]).
 */
function board(xp = 2) {
  return scenario()
    .active(P2)
    .xp(P1, xp)
    .resources(P1, { energy: 0, power: { order: 1 } })
    .resources(P2, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RIFT_HERALD, "herald")
    .unit(P1, "base", VICIOUS_SNAPJAWS, "snapjaws")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, BANDLE_SOLDIER, "bandle")
    .hand(P2, VENGEANCE, "vengeance");
}

/** P2 Vengeances the Herald; both pass → it resolves, the Herald dies, P1's two triggers are queued. */
async function heraldKilled(xp = 2): Promise<Game> {
  const game = await board(xp).build();
  await game.p2.cast("vengeance", { targets: "herald" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("vengeance")).toBe("trash");
  expect(game.zoneOf("herald")).toBe("trash");
  return game;
}

/** Chain-item key of the Herald's Deathknell / the Snapjaws trigger in P1's order offer. */
function keyOf(game: Game, card: "herald" | "snapjaws"): string {
  const d = game.decision();
  const item = d?.kind === "order" ? d.items.find((i) => i.card === card) : undefined;
  expect(item).toBeDefined();
  return item!.key;
}

/** Chain bottom→top as card ids. */
const chainCards = (game: Game): string[] => game.chain().map((c) => c.cardId);

/**
 * Put `top` on top of the chain, resolve: when the Herald's Deathknell asks, play Bandle Soldier.
 * Returns once the chain is empty and the game is back in P2's open main phase.
 */
async function resolveWith(game: Game, top: "herald" | "snapjaws"): Promise<void> {
  const bottom = top === "herald" ? "snapjaws" : "herald";
  await game.p1.order([keyOf(game, bottom), keyOf(game, top)]); // last key = top → resolves first
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "herald" } });
  await game.p1.pick("bandle");
  const done = await game.settle();
  expect(done.reason).toBe("open");
  expect(game.chain()).toEqual([]);
}

describe("(a) the order decision exists and is outcome-relevant", () => {
  test("one death → two P1 triggers (Herald Deathknell 'play a unit', Snapjaws 'gain 1 XP'); P1 — not P2 — is offered their order (383.3.d); the Herald is already in the trash (808.1.d.2/.d.3)", async () => {
    const game = await heraldKilled();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "snapjaws", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "herald", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["herald", "snapjaws"]);
    expect((await game.p2.try((p) => p.order([keyOf(game, "herald"), keyOf(game, "snapjaws")]))).ok).toBe(false);
    expect(game.p1.xp()).toBe(2); // nothing resolved yet
  });

  test("ORDER 1 — Snapjaws placed last (on top): it resolves first → XP 2 → 3 BEFORE the Deathknell asks for the unit", async () => {
    const game = await heraldKilled();
    await game.p1.order([keyOf(game, "herald"), keyOf(game, "snapjaws")]);
    expect(chainCards(game)).toEqual(["herald", "snapjaws"]);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "herald", pendingChoiceType: "reveal-and-pick" } });
    expect(game.p1.xp()).toBe(3);
    expect(chainCards(game)).not.toContain("snapjaws"); // already resolved and gone
  });

  test("ORDER 1 → Bandle Soldier is played to P1's base at 3 XP: '[Level 3] I enter ready' is active (824.1.c, 369.3) → it enters READY; energy ignored, the [order] paid (356.1.b)", async () => {
    const game = await heraldKilled();
    await resolveWith(game, "snapjaws");
    expect(game.state("bandle")).toMatchObject({ controller: P1, isReady: true, location: "base", zone: "base" });
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0);
  });

  test("ORDER 2 — Herald Deathknell on top: the Soldier is played while P1 still has 2 XP → Level 3 inactive (824.1.d) → it enters EXHAUSTED; Snapjaws resolves afterwards → XP 3", async () => {
    const game = await heraldKilled();
    await game.p1.order([keyOf(game, "snapjaws"), keyOf(game, "herald")]);
    expect(chainCards(game)).toEqual(["snapjaws", "herald"]);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.p1.xp()).toBe(2); // Snapjaws still waiting underneath
    expect(chainCards(game)).toEqual(["snapjaws"]);
    await game.p1.pick("bandle");
    expect(game.state("bandle")).toMatchObject({ isExhausted: true, zone: "base" });
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.power("order")).toBe(0);
  });

  test("same two triggers, different board: READY in order 1, EXHAUSTED in order 2 — the order decision is the game state", async () => {
    const one = await heraldKilled();
    await resolveWith(one, "snapjaws");
    const two = await heraldKilled();
    await resolveWith(two, "herald");
    expect([one.state("bandle").isReady, two.state("bandle").isReady]).toEqual([true, false]);
    expect([one.p1.xp(), two.p1.xp()]).toEqual([3, 3]);
  });

  test("the same holds on P1's OWN turn (P1 Vengeances its own Herald): Snapjaws on top → READY Soldier", async () => {
    const game = await scenario()
      .xp(P1, 2)
      .resources(P1, { energy: 4, power: { order: 3 } }) // Vengeance 4+[order][order] + the Soldier's [order]
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RIFT_HERALD, "herald")
      .unit(P1, "base", VICIOUS_SNAPJAWS, "snapjaws")
      .hand(P1, BANDLE_SOLDIER, "bandle")
      .hand(P1, VENGEANCE, "vengeance")
      .build();
    await game.p1.cast("vengeance", { targets: "herald" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    await game.p1.order([keyOf(game, "herald"), keyOf(game, "snapjaws")]);
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    await game.p1.pick("bandle");
    await game.settle();
    expect(game.state("bandle")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});

describe("(b) no retroactive readying", () => {
  test("order 2: the Soldier entered exhausted at 2 XP; Snapjaws then takes P1 to 3 XP in the same chain — the Soldier STAYS exhausted (369.3: 'enter ready' only replaces the entering event)", async () => {
    const game = await heraldKilled();
    await resolveWith(game, "herald");
    expect(game.p1.xp()).toBe(3);
    expect(game.state("bandle").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("…and it is still exhausted after P2's turn ends and P1's next turn begins only because the Awaken step readies it — not the Level text (sanity: it readies with everything else)", async () => {
    const game = await heraldKilled();
    await resolveWith(game, "herald");
    expect(game.state("bandle").isExhausted).toBe(true);
    await game.advanceTurn(); // P2 ends → P1's turn: Awaken readies P1's permanents
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("bandle").isReady).toBe(true);
    expect(game.state("snapjaws").isReady).toBe(true);
  });
});

describe("(c) controls — the threshold, not the order, is what matters", () => {
  test("already at 3 XP: READY in either order; XP ends at 4", async () => {
    const one = await heraldKilled(3);
    await resolveWith(one, "snapjaws");
    const two = await heraldKilled(3);
    await resolveWith(two, "herald");
    expect([one.state("bandle").isReady, two.state("bandle").isReady]).toEqual([true, true]);
    expect([one.p1.xp(), two.p1.xp()]).toEqual([4, 4]);
  });

  test("at 1 XP: EXHAUSTED in either order; XP ends at 2", async () => {
    const one = await heraldKilled(1);
    await resolveWith(one, "snapjaws");
    const two = await heraldKilled(1);
    await resolveWith(two, "herald");
    expect([one.state("bandle").isExhausted, two.state("bandle").isExhausted]).toEqual([true, true]);
    expect([one.p1.xp(), two.p1.xp()]).toEqual([2, 2]);
  });

  test("in every branch: Herald in its owner's trash, Bandle Soldier in P1's base under P1's control, the [order] pip spent and no energy ever needed", async () => {
    for (const [xp, top] of [[1, "herald"], [2, "snapjaws"], [3, "herald"]] as const) {
      const game = await heraldKilled(xp);
      await resolveWith(game, top);
      expect(game.zoneOf("herald")).toBe("trash");
      expect(game.p1.trash()).toContain("herald");
      expect(game.state("bandle")).toMatchObject({ controller: P1, location: "base", might: 5 });
      expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
      expect(game.p1.hand()).toEqual([]);
    }
  });

  test("no [order] pooled: the Deathknell's play cannot be paid for (power is still due) → nothing is offered to play, the Soldier stays in hand; Snapjaws still grants its XP", async () => {
    const game = await board(2).resources(P1, { energy: 0, power: { order: 0 } }).build();
    await game.p2.cast("vengeance", { targets: "herald" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // a bare, declinable offer with no affordable card is tolerable only if the Soldier is NOT in it
      expect(d.options.map((o) => o.card)).not.toContain("bandle");
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("bandle")).toBe("hand");
    expect(game.p1.xp()).toBe(3);
    expect(game.chain()).toEqual([]);
  });
});
