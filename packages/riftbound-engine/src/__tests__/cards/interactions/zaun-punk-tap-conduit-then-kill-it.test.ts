/**
 * Interaction: Zaun Punk (sfd-160-221) · Unit · Order · 3 · 3 Might
 *     "You may kill a friendly gear as an additional cost to play me.
 *      When you play me, if you paid the additional cost, kill a gear."
 *   × Energy Conduit (ogn-098-298) · Gear · Mind · 3 — "[Exhaust]: [Reaction] — [Add] [1]."
 *   × Seal of Focus (ogn-081-298) · Gear · Calm · 0 — "[Exhaust]: [Reaction] — [Add] [calm]." (P2's only gear)
 *
 * The 358.2 seam: an [Add] source that is ALSO the object consumed by an optional additional cost.
 *
 * Rules: 355.1.a (opting into an optional additional cost is a step-2 choice) · 355.16 / 357.3 (no choice that
 * deterministically makes a later step illegal) · 356.2.b.1 (kill-a-friendly-gear added to the total cost) ·
 * 357.1 / 357.1.a (pay resources; Reaction [Add] abilities may be used during payment) · 357.2 (non-standard
 * costs paid in any order relative to the resources) · 358.2 / 358.5 (all costs paid, else everything undone) ·
 * 419.2.a (a card is playable while resources + legal choices exist) · 337.2 (a unit resolves immediately) ·
 * 359.2.c (enters exhausted) · 402.4 (a trigger with a false "if" / no legal choice does nothing) · 355.9.a.1
 * ("a gear" = a gear on the board).
 *
 * DESIGN (DESIGN.md §Paying costs): paying is MANUAL — the 357.1.a "Add during payment" sub-step is deliberately
 * not implemented; a play is OFFERED only when the CURRENT pool covers its total, ready [Add] sources are never
 * credited. So the rules' one-step "exhaust Conduit for [1] inside step 4, then kill it as the cost" is played
 * out as two player actions: activate the Conduit (Add resolves at once, 337.2), THEN play the Punk killing the
 * now-exhausted Conduit. The end state is the one the rules prescribe.
 *
 * Board: P1's turn, Neutral Open. P1: Zaun Punk in hand, Energy Conduit as the ONLY gear. P2: Seal of Focus
 * (only enemy gear) + a bystander.
 *   (a) 2 energy, Conduit READY → (design) not offered until the Conduit is tapped; then offered with and
 *       without the kill; kill-Conduit line completes: Punk in base exhausted, Conduit in trash, pool 0, the
 *       play trigger targets the Seal (its only legal object) and kills it.
 *   (b) 2 energy, Conduit EXHAUSTED → not offered in any form.
 *   (c) 3 energy, cost declined → Punk enters for 3, no prompt, Seal survives, Conduit untouched and ready.
 *   (d) raw {play Punk, kill Conduit} on board (b) → refused atomically, nothing changes.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_PUNK = "sfd-160-221";
const ENERGY_CONDUIT = "ogn-098-298";
const SEAL_OF_FOCUS = "ogn-081-298";

function board(o: { energy?: number; conduitExhausted?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: o.energy ?? 2 })
    .gear(P1, ENERGY_CONDUIT, "conduit", o.conduitExhausted ? { exhausted: true } : undefined)
    .gear(P2, SEAL_OF_FOCUS, "seal")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, ZAUN_PUNK, "punk");
}

/** `[payOptional, sacrificeId | null]` per offered playUnit:punk variant. */
function punkVariants(game: Game): [boolean, string | null][] {
  return (game.p1.option("play", "punk")?.variants ?? [])
    .map((v) => [v.params.paidAdditionalCost === true, (v.params.sacrificeId as string | undefined) ?? null] as [boolean, string | null])
    .sort((a, b) => Number(a[0]) - Number(b[0]));
}

const cardsPlayed = (game: Game): number => game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;

describe("Zaun Punk × Energy Conduit — tap the Conduit for the last [1], then kill it as the additional cost", () => {
  // ── (a) YES side: 2 energy + READY Conduit ─────────────────────────────────────────────────────

  test("(a) premise: Neutral Open on P1's turn, pool 2, Conduit ready and P1's only gear, Seal of Focus is P2's only gear", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.gear()).toEqual(["conduit"]);
    expect(game.state("conduit").isReady).toBe(true);
    expect(game.p2.gear()).toEqual(["seal"]);
    expect(game.chain()).toEqual([]);
  });

  // DESIGN (DESIGN.md §Paying costs — deviation from 357.1.a / 419.2.a): with 2 in the pool the 3-cost Punk is
  // NOT on the menu even though the ready Conduit could Add the missing [1] during payment; the Conduit's own
  // [Reaction] Add activation IS on the menu. The rules answer ("offered") is reached by tapping first.
  test("(a) DESIGN: with 2 in the pool and the Conduit merely ready, Zaun Punk is not yet offered (pool-only affordability); the Conduit's [Add] activation is", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "punk")).toBe(false);
    expect(punkVariants(game)).toEqual([]);
    expect(game.p1.can("activate", "conduit")).toBe(true);
    expect((await game.p1.try((p) => p.do("playUnit", { cardId: "punk", costs: { paid: { kill: { objects: ["conduit"] } } }, location: "base", paidAdditionalCost: true, sacrificeId: "conduit" }))).ok).toBe(false);
    expect(game.zoneOf("punk")).toBe("hand");
    expect(game.zoneOf("conduit")).toBe("base");
  });

  test("(a) exhausting the Conduit Adds [1] at once (337.2 — no chain item): pool 3, Conduit exhausted but still on the board; NOW the Punk is offered both plain and with 'kill Conduit' — an exhausted gear is a perfectly good cost object", async () => {
    const game = await board().build();
    await game.p1.activate("conduit");
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("conduit")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.can("play", "punk")).toBe(true);
    expect(punkVariants(game)).toEqual([
      [false, null],
      [true, "conduit"],
    ]);
    const sac = game.p1.option("play", "punk")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options).toContain("conduit");
    expect(sac?.options).not.toContain("seal"); // friendly gear only
  });

  test("(a) the kill-Conduit line completes (358.1–358.4 all pass): 3 paid → pool 0, Conduit in P1's trash, Zaun Punk in base EXHAUSTED (359.2.c) — resolved immediately, never a respondable item (337.2)", async () => {
    const game = await board().build();
    await game.p1.activate("conduit");
    await game.p1.play("punk", { sacrifice: "conduit" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("conduit")).toBe("trash");
    expect(game.p1.trash()).toEqual(["conduit"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("punk")).toBe("base");
    expect(game.state("punk")).toMatchObject({ controller: P1, isExhausted: true, might: 3, zone: "base" });
    expect(game.chain().some((i) => i.cardId === "punk" && !i.triggered)).toBe(false); // no unit item lingers
    expect(cardsPlayed(game)).toBe(1);
  });

  test("(a) 'When you play me, if you paid the additional cost, kill a gear' goes on the chain with its ONLY legal object — P2's Seal (the Conduit is already in the trash, 355.9.a.1) — and P1, not P2, holds priority first", async () => {
    const game = await board().build();
    await game.p1.activate("conduit");
    await game.p1.play("punk", { sacrifice: "conduit" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "punk", controller: P1, targets: ["seal"], triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("seal")).toBe("base"); // nothing resolved yet
  });

  test("(a) both pass → the trigger resolves: Seal of Focus is killed into P2's trash; back to P1's open main phase with Punk in base, Conduit in trash, pool 0", async () => {
    const game = await board().build();
    await game.p1.activate("conduit");
    await game.p1.play("punk", { sacrifice: "conduit" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("seal")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
    expect(game.zoneOf("punk")).toBe("base");
    expect(game.zoneOf("conduit")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) order matters only for the player, not the outcome: tapping the Conduit and then playing the Punk PLAIN (cost declined) is also legal — pool 0, Conduit stays on the board exhausted, no trigger, Seal alive", async () => {
    const game = await board().build();
    await game.p1.activate("conduit");
    await game.p1.play("punk");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("punk")).toBe("base");
    expect(game.state("conduit")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
  });

  // ── (b) NO side: 2 energy + EXHAUSTED Conduit ──────────────────────────────────────────────────

  test("(b) Conduit already exhausted, pool 2: Zaun Punk is absent from seat.legal() in EVERY form — base 3 is unpayable, no Add is available, and killing the Conduit adds nothing (355.16, 358.2)", async () => {
    const game = await board({ conduitExhausted: true }).build();
    expect(game.state("conduit").isExhausted).toBe(true);
    expect(game.p1.can("play", "punk")).toBe(false);
    expect(punkVariants(game)).toEqual([]);
    expect(game.p1.legal().some((o) => o.card === "punk")).toBe(false);
    expect(game.p1.can("activate", "conduit")).toBe(false);
    expect(
      game.p1
        .legal()
        .map((o) => o.verb)
        .sort(),
    ).toEqual(["concede", "endTurn"]);
  });

  // ── (c) 3 energy, ready Conduit, cost DECLINED ─────────────────────────────────────────────────

  test("(c) 3 energy and the optional cost declined: Punk enters base for exactly 3; the 'if you paid' trigger's condition is false so NOTHING is put on the chain and nobody is prompted for a gear (402.4)", async () => {
    const game = await board({ energy: 3 }).build();
    expect(punkVariants(game)).toEqual([
      [false, null],
      [true, "conduit"],
    ]);
    await game.p1.play("punk");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("punk")).toBe("base");
    expect(game.state("punk").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no pick, no priority window
  });

  test("(c) …P2's Seal survives, and the Conduit is untouched and still READY (its Add remains available)", async () => {
    const game = await board({ energy: 3 }).build();
    await game.p1.play("punk");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.state("conduit")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.can("activate", "conduit")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("(c) contrast on the same 3-energy board: electing the cost with a READY Conduit kills it untapped (its [1] is simply forgone), Punk lands, trigger kills the Seal", async () => {
    const game = await board({ energy: 3 }).build();
    await game.p1.play("punk", { sacrifice: "conduit" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("conduit")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("trash");
    expect(game.zoneOf("punk")).toBe("base");
  });

  // ── (d) rollback probe on board (b) ────────────────────────────────────────────────────────────

  test("(d) raw {playUnit punk → base, kill Conduit} on board (b) is refused ATOMICALLY (358.2 → 358.5): Conduit still on the board and still exhausted (not in trash), pool still 2, Punk still in hand, chain empty, Seal alive, no play counted", async () => {
    const game = await board({ conduitExhausted: true }).build();
    const legacy = await game.p1.try((p) => p.do("playUnit", { cardId: "punk", location: "base", paidAdditionalCost: true, sacrificeId: "conduit" }));
    expect(legacy.ok).toBe(false);
    const viaCosts = await game.p1.try((p) => p.do("playUnit", { cardId: "punk", costs: { paid: { kill: { objects: ["conduit"] } } }, location: "base" }));
    expect(viaCosts.ok).toBe(false);
    const plain = await game.p1.try((p) => p.do("playUnit", { cardId: "punk", location: "base" }));
    expect(plain.ok).toBe(false);

    expect(game.zoneOf("conduit")).toBe("base");
    expect(game.state("conduit").isExhausted).toBe(true);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("punk")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("seal")).toBe("base");
    expect(cardsPlayed(game)).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) same probe on board (a) BEFORE tapping (pool 2, Conduit ready): also refused with nothing consumed — the Conduit is neither exhausted nor killed by a failed play, pool 2, Punk in hand", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.do("playUnit", { cardId: "punk", costs: { paid: { kill: { objects: ["conduit"] } } }, location: "base", paidAdditionalCost: true, sacrificeId: "conduit" }));
    expect(r.ok).toBe(false);
    expect(game.state("conduit")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("punk")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(cardsPlayed(game)).toBe(0);
  });
});
