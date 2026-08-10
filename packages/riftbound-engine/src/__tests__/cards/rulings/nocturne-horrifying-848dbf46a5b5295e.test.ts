/**
 * Ruling 848dbf46a5b5295e — Nocturne, Horrifying (OGN-194 → ogn-194-298) × Bullet Time (OGN-268 → ogn-268-298)
 *   Nocturne: "As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me
 *   for [rainbow]."   Bullet Time: "Pay any amount of [rainbow] to deal that much damage to all enemy units at a
 *   battlefield."
 *
 * Q: While resolving an effect that makes me pay a cost (Nocturne's [rainbow], Bullet Time's X [rainbow]) can I
 *    float a DIFFERENT resource (e.g. tap a rune for energy while the cost is power)?
 * A: Yes. Reaction [Add] abilities may be activated any time resources are being paid during resolution — any
 *    resource, not just the one being paid. The floated resource stays in the pool until used / end of turn.
 * Rules: 429.3 / 429.3.a, 444.2.c (Add Reactions during a Pay), 160 (pool empties at end of turn, not sooner).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const BULLET_TIME = "ogn-268-298";
const STACKED_DECK = "ogn-183-298";
const SKULKER = "ogn-175-298";

const payActions = (d: Decision | null): string[] =>
  d && (d.kind === "integer" || d.kind === "yes-no" || d.kind === "pick") ? (d.actions ?? []).map((a) => a.verb) : [];

describe("Ruling 848dbf46a5b5295e — floating a different resource while paying a resolution-time cost", () => {
  test("Bullet Time: at the pay-X [rainbow] prompt P1 may TAP a rune for energy (a different resource), then pay power; the floated energy stays in the pool", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .runes(P1, "fury", 2)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .hand(P1, BULLET_TIME, "bt")
      .build();
    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.p1.energy()).toBe(0);
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" }, unit: "rainbow" });
    // 444.2.c: Add-Reactions are offered alongside the payment — including tapRune (energy), not only recycle (power).
    expect(payActions(d)).toContain("tapRune");
    expect(payActions(d)).toContain("recycleRune");
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1); // floated energy
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 }); // still paying
    await game.p1.chooseX(2);
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p1.power()).toBe(0);
    expect(game.p1.energy()).toBe(1); // the floated energy remains available
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // rule 429.3 / 444.2.c — the "play me for [rainbow]?" confirm carries that play's Pay step, so Add-Reactions
  // (tapRune / recycleRune) ride alongside the offer and a resource floated there survives the payment.
  test("ruling 848dbf46a5b5295e — Nocturne's pay-[rainbow] offer exposes Add-Reaction actions (tap a rune for energy while paying power)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .runes(P1, "fury", 2)
      .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "s1", "s2"])
      .hand(P1, STACKED_DECK, "sd")
      .build();
    await game.p1.cast("sd");
    await game.settle();
    // "you may banish me"
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    await game.p1.yes();
    expect(game.zoneOf("noc")).toBe("banishment");
    await game.settle();
    const offer = game.decision();
    expect(offer).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    expect(payActions(offer)).toContain("tapRune");
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    await game.p1.yes();
    // finish Stacked Deck (put 1 in hand, recycle rest) and any placement prompt
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options[0]?.key as string);
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else {
        break;
      }
    }
    expect(["base"]).toContain(game.zoneOf("noc"));
    expect(game.p1.power("rainbow")).toBe(0); // paid the alternative cost in power
    expect(game.p1.energy()).toBe(1); // the energy floated during the payment is still there
  });
});
