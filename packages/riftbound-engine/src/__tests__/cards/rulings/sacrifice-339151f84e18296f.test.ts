/**
 * Ruling 339151f84e18296f — Sacrifice (UNL-173 → unl-173-219) · Reaction · [1] · "As an additional cost to play this, kill a
 *     friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] · "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: A unit is Mighty at exactly 5; its controller plays Sacrifice as a reaction. If I Stupefy it, does Sacrifice fizzle?
 * A: No. The kill is a COST, paid while playing the card — before Sacrifice is even on the chain and before anyone can
 *    react. By the time you hold priority the unit is already in the trash (untargetable) and Sacrifice resolves
 *    normally. Stupefying it beforehand (in an open state) only means they don't pick that unit / don't play Sacrifice.
 * Rules: 354.2 / 356.7 / 357 (additional costs are paid during the play, before finalization), 336–339 (priority only
 *        after the item is finalized), 709/710 (Mighty = 5+ Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const STUPEFY = "ogn-095-298";
const SKULKER = "ogn-175-298";

/** P1's turn. P1: Brute (exactly 5 → Mighty), Other (6), Tiny (2), Sacrifice + [1], deck d1,d2. P2: Stupefy + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 6, name: "Other" }, "other")
    .unit(P1, "base", { might: 2, name: "Tiny" }, "tiny")
    .hand(P1, SACRIFICE, "sac")
    .hand(P2, STUPEFY, "stup")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"]);
}

const sacrificeChoices = (game: Game) =>
  [...((game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options ?? []) as string[])].sort();
const stupefyTargets = (game: Game) =>
  (game.p2.option("cast", "stup")?.fields.find((f) => f.name === "targets")?.options ?? []).flat().sort();

describe("Ruling 339151f84e18296f — Sacrifice's kill is a cost paid before any reaction window; Stupefy cannot make it fizzle", () => {
  test("premise: exactly-5 Brute is Mighty and is offered (with the 6-Might Other) as Sacrifice's cost; the 2-Might Tiny is not", async () => {
    const game = await board().build();
    expect(game.state("brute").might).toBe(5);
    expect(sacrificeChoices(game)).toEqual(["brute", "other"]);
  });

  test("steps 1–3: announcing Sacrifice and paying its costs is one uninterruptible act — the Brute is in the trash and [1] is spent BEFORE Sacrifice sits on the chain awaiting responses; P1 (not P2) holds the first priority", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "brute" });
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sac", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]); // P2 has had no window yet
  });

  test("ruling: when P2 finally gets priority the sacrificed Brute is no longer a Stupefy target at all — only the surviving units are offered", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "brute" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(stupefyTargets(game)).toEqual(["other", "tiny"]);
    const r = await game.p2.try((p) => p.cast("stup", { targets: "brute" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("stup")).toBe("hand");
  });

  test("Sacrifice does not fizzle: even with a Stupefy (on some other unit) resolving first, Sacrifice then resolves in full — P1 draws 2 (d1, d2) and channels 1 rune exhausted", async () => {
    const game = await board().build();
    const runes = game.p1.runes().length;
    await game.p1.cast("sac", { sacrifice: "brute" });
    await game.p1.passPriority();
    await game.p2.cast("stup", { targets: "other" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sac", "stup"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("other").might).toBe(5); // Stupefy landed on its actual target
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.runes()).toHaveLength(runes + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("'beforehand' case: if Stupefy has already RESOLVED on the exactly-5 Brute (now 4, not Mighty), P1 simply cannot pick it — Sacrifice is still playable by killing a different Mighty unit (Other)", async () => {
    // P2's turn so P2 can open with Stupefy; Sacrifice is a Reaction so P1 may still play it afterwards on P2's turn.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 2 })
      .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
      .unit(P1, "base", { might: 6, name: "Other" }, "other")
      .hand(P1, SACRIFICE, "sac")
      .hand(P2, STUPEFY, "stup")
      .hand(P2, STUPEFY, "stup2")
      .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"])
      .build();
    await game.p2.cast("stup", { targets: "brute" });
    // While Stupefy is merely on the chain the Brute is still 5 — P1 could even Sacrifice it in response.
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("brute").might).toBe(5);
    expect(sacrificeChoices(game)).toEqual(["brute", "other"]);
    await game.p1.passPriority(); // P1 lets Stupefy resolve instead
    expect(game.state("brute").might).toBe(4); // no longer Mighty
    // Next window for P1 (P2 opens another chain): the 4-Might Brute is not a payable cost any more — only Other is.
    await game.p2.cast("stup2", { targets: "other" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(sacrificeChoices(game)).toEqual(["other"]);
    await game.p1.cast("sac", { sacrifice: "other" }); // Other is still 6 while stup2 waits on the chain
    expect(game.zoneOf("other")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.zoneOf("brute")).toBe("base");
  });
});
