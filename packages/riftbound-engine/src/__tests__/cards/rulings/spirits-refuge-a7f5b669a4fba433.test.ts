/**
 * Ruling a7f5b669a4fba433 — Spirit's Refuge (OGN-063 → ogn-063-298) · Gear · Calm · [2][calm]
 *     "When you play this, buff a friendly unit. Friendly buffed units have [Deflect] if they didn't already."
 *
 * Q: Does Spirit's Refuge give its buff when played from hand, or each time you "activate" the gear?
 * A: The buff is a one-time TRIGGERED ability ("When you play this"). The second sentence is a PASSIVE ability that is on
 *    as long as the gear is on the board — it needs no activation and does not care whether the gear is exhausted.
 * Rules: 383 (triggered "when you play"), 376–378 (passive abilities), 702 (buff), 809 (Deflect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REFUGE = "ogn-063-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Other" }, "other")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, REFUGE, "refuge");
}

describe("Ruling a7f5b669a4fba433 — Spirit's Refuge: one play trigger for the buff, an always-on passive for Deflect", () => {
  test("playing it from hand puts a TRIGGERED item on the chain whose chosen friendly unit gets the buff (Ally 2 → 3, buffed)", async () => {
    const game = await board().build();
    await game.p1.play("refuge");
    // the play trigger: either its target is asked at once (FIN) or after the gear resolves — answer Ally when asked
    let sawTrigger = false;
    for (let i = 0; i < 10; i++) {
      if (game.chain().some((c) => c.cardId === "refuge" && c.triggered)) {
        sawTrigger = true;
      }
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["ally", "other"]);
        await game.p1.pick("ally");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(sawTrigger).toBe(true);
    expect(game.zoneOf("refuge")).toBe("base");
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("other")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("the gear has NO activated ability to 'use each turn' — nothing to activate, so no repeated buffs", async () => {
    const game = await scenario().gear(P1, REFUGE, "refuge").unit(P1, "base", { might: 2, name: "Ally" }, "ally").resources(P1, { energy: 5, power: { calm: 2 } }).build();
    expect(game.p1.can("activate", "refuge")).toBe(false);
    expect(game.p1.legal().filter((o) => o.card === "refuge")).toEqual([]);
    expect(game.state("ally")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("the passive is on simply because the gear is on the board: a friendly unit buffed by ANY means has Deflect (never 'played' this game), an unbuffed one and a buffed enemy do not", async () => {
    const game = await scenario()
      .gear(P1, REFUGE, "refuge")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Other" }, "other")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe", { buffed: true })
      .build();
    expect(game.state("ally").keywords).toContain("Deflect");
    expect(game.state("other").keywords).not.toContain("Deflect");
    expect(game.state("foe").keywords).not.toContain("Deflect");
  });

  test("…and it does not require the gear to be ready: with Spirit's Refuge EXHAUSTED the buffed Ally still has Deflect", async () => {
    const game = await scenario()
      .gear(P1, REFUGE, "refuge", { exhausted: true })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { buffed: true })
      .build();
    expect(game.state("refuge").isExhausted).toBe(true);
    expect(game.state("ally").keywords).toContain("Deflect");
  });

  test("…but it ends when the gear leaves the board: no Refuge ⇒ a buffed friendly unit has no Deflect", async () => {
    const game = await scenario().unit(P1, "base", { might: 2, name: "Ally" }, "ally", { buffed: true }).build();
    expect(game.state("ally").keywords).not.toContain("Deflect");
  });
});
