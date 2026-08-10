/**
 * Ruling f246762efe6a0099 — Fiora, Worthy (SFD-180 → sfd-180-221) · 3 Might · "When a unit you control becomes [Mighty], you may
 *     pay [order] to ready it."
 *   × Fiora, Victorious (OGN-232 → ogn-232-298) · 4 Might · "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]."
 *   × Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3] · "As you play this, you may spend a buff as an additional cost. If
 *     you do, ignore this spell's cost. Give a unit +3 [Might] this turn."
 *
 * Q: A unit that is already Mighty loses Mighty and then gets it back — does Fiora, Worthy trigger?
 * A: Yes. Exhausted, buffed Fiora, Victorious (4+1 = 5, Mighty). Cast Call to Glory on her spending HER buff as the cost →
 *    she drops to 4 (not Mighty). Call to Glory resolves: +3 → 7, she BECOMES Mighty again → Fiora, Worthy triggers and you
 *    may pay [order] to ready her.
 * Rules: 709/710 (Mighty = 5+ Might; "becomes Mighty" is a transition from not-Mighty), 356 (additional cost paid as the
 *        spell is played, before it resolves), 383 (triggered ability).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA_WORTHY = "sfd-180-221";
const FIORA_VICTORIOUS = "ogn-232-298";
const CALL_TO_GLORY = "ogn-207-298";

/**
 * P1's turn. Fiora, Worthy ready in base; Fiora, Victorious in base EXHAUSTED and BUFFED (4+1 = 5 → Mighty).
 * P1 has NO energy (Call to Glory's [3] must be ignored via the buff) and exactly one [order] for Worthy's trigger.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", FIORA_WORTHY, "worthy")
    .unit(P1, "base", FIORA_VICTORIOUS, "vic", { buffed: true, exhausted: true })
    .hand(P1, CALL_TO_GLORY, "ctg");
}

/** Cast Call to Glory on Victorious, spending Victorious's own buff as the additional cost. */
async function castSpendingBuff(game: Game): Promise<void> {
  expect(game.state("vic")).toMatchObject({ isBuffed: true, isExhausted: true, might: 5 });
  expect(game.p1.can("cast", "ctg")).toBe(true); // affordable only through the buff
  await game.p1.cast("ctg", { payOptional: true, targets: "vic" }); // the only buff on the board is Victorious's own
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ctg", targets: ["vic"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } }); // cost ignored, [order] untouched
}

describe("Ruling f246762efe6a0099 — losing Mighty (buff spent) and regaining it (Call to Glory) re-triggers Fiora, Worthy", () => {
  test("paying Call to Glory's cost with Victorious's buff drops her from 5 to 4 — she is no longer Mighty while the spell is on the chain", async () => {
    const game = await board().build();
    await castSpendingBuff(game);
    expect(game.state("vic")).toMatchObject({ isBuffed: false, might: 4 });
    expect(game.state("vic").keywords).not.toContain("Shield"); // Victorious's "while I'm Mighty" is off
    // Nothing has triggered yet: only the spell is on the chain.
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctg"]);
  });

  test("Call to Glory resolves: 4 + 3 = 7 → Victorious BECOMES Mighty again → Fiora, Worthy's 'you may pay [order]' is offered to P1", async () => {
    const game = await board().build();
    await castSpendingBuff(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("vic").might).toBe(7);
    expect(game.state("vic").keywords).toContain("Shield"); // Mighty again
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "worthy" } });
  });

  test("accepting pays the [order] and, once the trigger resolves, readies the exhausted Victorious", async () => {
    const game = await board().build();
    await castSpendingBuff(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("order")).toBe(0); // paid at finalization
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "worthy", controller: P1, triggered: true })]);
    expect(game.state("vic").isExhausted).toBe(true); // not yet — the item must resolve
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("vic")).toMatchObject({ isReady: true, might: 7 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // (the harness `costPaid` invariant flags the ignored [3] as unpaid — expected for "ignore this spell's cost")
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("control: Call to Glory on an UNBUFFED exhausted Victorious (4 → 7) is a first-time become-Mighty and triggers Worthy just the same", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .unit(P1, "base", FIORA_WORTHY, "worthy")
      .unit(P1, "base", FIORA_VICTORIOUS, "vic", { exhausted: true })
      .hand(P1, CALL_TO_GLORY, "ctg")
      .build();
    await game.p1.cast("ctg", { targets: "vic" });
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "worthy" } });
  });

  test("contrast: a buffed Victorious that simply gets +3 (5 → 8) was ALREADY Mighty — no transition, Worthy does not trigger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .unit(P1, "base", FIORA_WORTHY, "worthy")
      .unit(P1, "base", FIORA_VICTORIOUS, "vic", { buffed: true, exhausted: true })
      .hand(P1, CALL_TO_GLORY, "ctg")
      .build();
    await game.p1.cast("ctg", { targets: "vic" }); // paying [3], keeping the buff
    expect(game.p1.energy()).toBe(0);
    expect(game.state("vic").isBuffed).toBe(true);
    await game.settle();
    expect(game.state("vic")).toMatchObject({ isExhausted: true, might: 8 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("order")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
