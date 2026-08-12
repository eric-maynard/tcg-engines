/**
 * Ruling e82783056f3594dc — Daughter of the Void (OGN-247 → ogn-247-298), Kai'Sa's Legend
 *   "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *   × [Deflect] "Opponents must pay [rainbow] to choose me with a spell or ability."
 *
 * Q: Can Kai'Sa's Legend ability pay a [Deflect] cost for a spell that targets a Deflect unit?
 * A: Yes. [Deflect] is a mandatory ADDITIONAL COST of playing that spell, so it is part of the spell's
 *    total cost — and the Legend's Power may be spent on playing a spell. Order of play: put the spell
 *    on the chain, choose targets, compute and pay the whole cost (Deflect included), then reactions.
 *    (Deflect is not a triggered ability, so nothing waits to be responded to.)
 * Rules: 809.1.c (Deflect = additional cost per choosing), 356 (additional costs fold into the total
 *        cost paid on play), 357 (Add abilities fund that payment).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KAISA_LEGEND = "ogn-247-298";
const GUST = "ogn-169-298"; // Reaction · 1 Energy, no Power — every Power it needs is the Deflect tax

/** P1 has Gust and the Legend, exactly 1 Energy and NO Power. P2 fields a Deflect Warden and a plain unit. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .legend(P1, KAISA_LEGEND, "kaisa")
    .unit(P2, "bf1", { keywords: ["Deflect"], might: 2, name: "Warden" }, "warden")
    .unit(P2, "bf1", { might: 2, name: "Footman" }, "footman")
    .hand(P1, GUST, "gust");
}

describe("Ruling e82783056f3594dc — Kai'Sa's [Add] pays a spell's [Deflect] surcharge", () => {
  test("with an empty Power pool the Deflect Warden is not an offerable target, while the plain Footman is", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options;
    expect((targets as string[][]).flat()).toEqual(["footman"]);
    const attempt = await game.p1.try((p) => p.cast("gust", { targets: "warden" }));
    expect(attempt.ok).toBe(false);
  });

  test("activating the Legend adds [rainbow] and exhausts it — that Power then covers the Deflect cost and Gust bounces the Warden", async () => {
    const game = await board().build();
    expect(game.state("kaisa").isReady).toBe(true);
    await game.p1.activate("kaisa");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("kaisa").isExhausted).toBe(true);
    // The Warden is now a legal choice — the surcharge is payable.
    const targets = game.p1.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options;
    expect((targets as string[][]).flat().sort()).toEqual(["footman", "warden"]);

    await game.p1.cast("gust", { targets: "warden" });
    // Cost (1 Energy) AND the Deflect surcharge (1 Power) are both taken as the spell is played.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the Legend's Power is not consumed by targeting the un-Deflected unit: choosing the Footman leaves the [rainbow] unspent", async () => {
    const game = await board().build();
    await game.p1.activate("kaisa");
    await game.p1.cast("gust", { targets: "footman" });
    expect(game.p1.power("rainbow")).toBe(1); // no surcharge was owed
    await game.settle();
    expect(game.zoneOf("footman")).toBe("hand");
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
  });
});
