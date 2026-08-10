/**
 * Ruling 4c9870d5c9f36285 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this
 *   instead. Heal that unit, exhaust it, and recall it."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment (+1) · "If I would die, kill Guardian Angel instead. Heal me,
 *   exhaust me, and recall me."
 *   (+ Irelia, Fervent sfd-057-221 "When you choose or ready me, give me +1 [Might] this turn" as the "was I chosen?" probe.)
 *
 * Q: If my unit would die and Zhonya's / Guardian Angel saves it, does that count as choosing the unit?
 * A: No. Replacement effects don't target/choose — the unit is only part of their condition; nothing that cares about
 *    being "chosen" triggers. With BOTH on the same unit, its controller picks which replacement applies; the other is
 *    not used up because the unit then never died.
 * Rules: 352.10.c (objects in a replacement's condition are not targets), 366.1 ("instead"), 372/373 (controller
 *        orders/assigns competing replacements).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const IRELIA = "sfd-057-221"; // 4 Might, Deflect, "When you choose or ready me, give me +1 [Might] this turn."

/** P2's turn. P1 holds bf1 with Irelia; P2's 9-might Bruiser in base will attack and deal lethal combat damage. */
function board(opts: { zhonyas?: boolean; ga?: boolean }) {
  let s = scenario().turn(3).active(P2).battlefield("bf1", { controller: P1 });
  s = opts.ga
    ? s
        .unit(P1, "bf1", IRELIA, "irelia", { equippedWith: ["ga"] })
        .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "irelia" }, owner: P1, zone: "bf1" })
    : s.unit(P1, "bf1", IRELIA, "irelia");
  if (opts.zhonyas) {
    s = s.gear(P1, ZHONYAS, "zhonyas");
  }
  return s.unit(P2, "base", { might: 9, name: "Bruiser" }, "bruiser");
}

describe("Ruling 4c9870d5c9f36285 — being saved by Zhonya's / Guardian Angel is not being 'chosen'", () => {
  test("Zhonya's alone: Irelia takes lethal combat damage → Zhonya's dies instead; Irelia is healed, exhausted, recalled — and her 'when you choose me' trigger does NOT fire (no +1 Might, nothing on the chain)", async () => {
    const game = await board({ zhonyas: true }).build();
    expect(game.state("irelia").might).toBe(4);
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ damage: 0, isExhausted: true, might: 4, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the Bruiser conquered the vacated battlefield
    expect(game.violations()).toEqual([]);
  });

  test("Guardian Angel alone: same — GA is killed instead, Irelia survives in base exhausted, and was never 'chosen' (+1 from GA gone, no trigger bonus)", async () => {
    const game = await board({ ga: true }).build();
    expect(game.state("irelia").might).toBe(5); // 4 + GA's +1
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
  });

  test("both on the same unit: Irelia's controller (P1) is asked which replacement applies — a choice between EFFECTS, not a targeting of Irelia", async () => {
    const game = await board({ ga: true, zhonyas: true }).build();
    await game.p2.move("bruiser", "bf1");
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order" });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["ga", "zhonyas"]);
    // Irelia is still on the battlefield, undecided, and has not been "chosen" by anything.
    expect(game.zoneOf("irelia")).toBe("battlefield-bf1");
    expect(game.state("irelia").mightModifier).toBe(0);
  });

  test("…choosing Zhonya's: it is killed instead, Irelia is saved still wearing Guardian Angel (unused — she never died), and still no 'chosen' trigger", async () => {
    const game = await board({ ga: true, zhonyas: true }).build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    await game.p1.pick("zhonyas");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia").attachments).toEqual(["ga"]);
    expect(game.zoneOf("ga")).not.toBe("trash");
    expect(game.state("irelia")).toMatchObject({ damage: 0, isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
  });

  test("…choosing Guardian Angel instead: GA is killed, Zhonya's stays on the board unused", async () => {
    const game = await board({ ga: true, zhonyas: true }).build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    await game.p1.pick("ga");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("base");
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
