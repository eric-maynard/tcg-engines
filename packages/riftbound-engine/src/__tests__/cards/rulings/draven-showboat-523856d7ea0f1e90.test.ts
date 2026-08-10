/**
 * Ruling 523856d7ea0f1e90 — Draven, Showboat (OGN-028 → ogn-028-298) · 5+[fury] · 3 Might · "My Might is increased by your points."
 *   × Relentless Storm (ogn-249-298, Volibear Legend) "When you play a [Mighty] unit, you may exhaust me to channel 1 rune
 *     exhausted. (A unit is Mighty while it has 5+ [Might].)"
 *   × Sett, Brawler (ogn-164-298) · 5+[body] · 4 Might · "When I'm played and when I conquer, buff me. …"
 *
 * Q: Does playing Sett (4, buffs himself to 5 on play) trigger Volibear's legend?
 * A: No. Sett is played as a 4-Might unit; the legend checks Might at that moment and does not trigger. Sett's own play
 *    trigger only makes him 5 afterwards — too late. Draven, Showboat with 2+ points DOES trigger it, because his static
 *    bonus is already applied as he enters (3 + 2 = 5).
 * Rules: 376/383 (trigger conditions are checked when the event happens), 709/710 ([Mighty] = 5+ Might), statics apply
 *        continuously (Draven) vs a triggered buff resolving later (Sett).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const DRAVEN_SHOWBOAT = "ogn-028-298";
const RELENTLESS_STORM = "ogn-249-298";
const SETT_BRAWLER = "ogn-164-298";

/** P1's turn with the Volibear legend, `points` points, both champions in hand and resources for either (5 + fury + body). */
function board(points: number) {
  return scenario()
    .points(P1, points)
    .resources(P1, { energy: 5, power: { body: 1, fury: 1 } })
    .legend(P1, RELENTLESS_STORM, "storm")
    .runes(P1, "fury", 2)
    .hand(P1, SETT_BRAWLER, "sett")
    .hand(P1, DRAVEN_SHOWBOAT, "draven");
}

const isStormOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "storm";

/** Drive everything to P1's open main phase, answering YES to the legend if (and only if) it is ever offered; count offers. */
async function settleAcceptingStorm(game: Game): Promise<number> {
  let offers = 0;
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (isStormOffer(d)) {
      offers += 1;
      await game.p1.yes();
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  return offers;
}

describe("Ruling 523856d7ea0f1e90 — Relentless Storm checks [Mighty] as the unit is played: Sett, Brawler (4→5 later) no; Draven, Showboat at 2 points (enters as 5) yes", () => {
  test("Sett, Brawler is played as a 4: the legend is NEVER offered; Sett's own trigger then buffs him to 5 — Storm stays ready, no rune channeled", async () => {
    const game = await board(2).build();
    const runes0 = game.p1.runes().length;
    await game.p1.play("sett");
    expect(game.zoneOf("sett")).toBe("base");
    // Right after the play: Sett is (still) 4 — not Mighty — and only HIS play trigger is around; nothing from the legend.
    expect(game.state("sett").might).toBe(4);
    expect(isStormOffer(game.decision())).toBe(false);
    expect(game.chain().some((c) => c.cardId === "storm")).toBe(false);
    const offers = await settleAcceptingStorm(game);
    expect(offers).toBe(0);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 }); // Mighty now — but the moment has passed
    expect(game.state("storm").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runes0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Draven, Showboat with 2 points enters as 3 + 2 = 5 (static already applied): the legend IS offered (P1 yes/no from Storm); accepting exhausts Storm and channels 1 rune exhausted", async () => {
    const game = await board(2).build();
    const runes0 = game.p1.runes().length;
    const exhausted0 = game.p1.runes({ ready: false }).length;
    await game.p1.play("draven");
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.state("draven").might).toBe(5);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "storm" }, timing: "FIN" });
    const offers = await settleAcceptingStorm(game);
    expect(offers).toBe(1);
    expect(game.state("storm").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(exhausted0 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Draven at only 1 point enters as a 4 — not Mighty — and the legend is not offered", async () => {
    const game = await board(1).build();
    await game.p1.play("draven");
    expect(game.state("draven").might).toBe(4);
    const offers = await settleAcceptingStorm(game);
    expect(offers).toBe(0);
    expect(game.state("storm").isExhausted).toBe(false);
  });
});
