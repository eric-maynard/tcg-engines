/**
 * Interaction: Sacrifice (unl-173-219, Reaction, 1) "As an additional cost to play this, kill a
 *   friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Rift Herald (unl-179-219, 7 Might) "[Deathknell] — Play a unit from your hand to your base,
 *   ignoring its Energy cost. (You must still pay its Power cost.)"
 *
 * Question: P1 plays Sacrifice killing their own Rift Herald. Does Herald's Deathknell resolve
 * before or after Sacrifice's "draw 2" — i.e. can the unit played by the Deathknell be one of the
 * two cards Sacrifice draws? Negative: Sacrifice cannot be played at all if P1's only friendly
 * unit has < 5 Might.
 *
 * Rules: 356.7 / 357.2 (the kill is an additional COST paid while playing the card), 428.1.a.1.b +
 * 808.1.d.2 (a unit killed — even as a cost — puts its Deathknell on the chain as a Pending Item
 * before it reaches the trash), 359.3.a/359.3.b (the spell finalizes, then pending items above it
 * finalize), 340.1 (chain resolves last-in-first-out).
 *
 * Expected: Herald dies during Sacrifice's play; its Deathknell lands ABOVE Sacrifice and resolves
 * FIRST — P1 may play a unit from their pre-draw hand (energy free, power still paid) — and only
 * then Sacrifice resolves (draw 2, channel 1 exhausted). The two drawn cards are therefore NOT
 * available to the Deathknell. With no friendly Mighty unit the cost is unpayable → not a legal play.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const RIFT_HERALD = "unl-179-219";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit used as the known deck top
const FINAL_SPARK = "ogs-022-024"; // Deal 8 to a unit — kills the 7-Might Herald for the isolated Deathknell facet

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** The friendly units the engine offers to kill for Sacrifice's additional cost (empty if it asks for none). */
function sacrificeOffered(game: Game): string[] {
  const opt = game.p1.option("cast", "sac");
  const field = opt?.fields.find((f) => f.arg === "sacrifice" || f.name === "sacrificeId") ?? opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * Cast Sacrifice choosing `victim` for the kill cost, using whichever parameter the engine exposes
 * for it. Today it exposes none (see BUGs) — then this is a bare cast, and the assertions that the
 * victim died are what fail.
 */
async function castSacrifice(game: Game, victim: string): Promise<void> {
  const opt = game.p1.option("cast", "sac");
  if (opt?.fields.some((f) => f.arg === "sacrifice" || f.name === "sacrificeId")) {
    await game.p1.cast("sac", { params: { sacrificeId: victim } });
  } else if (opt?.fields.some((f) => f.name === "targets")) {
    await game.p1.cast("sac", { targets: victim });
  } else {
    await game.p1.cast("sac");
  }
}

function board() {
  return (
    scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } }) // exactly Sacrifice's 1 energy; 1 fury for the hand unit's Power cost
      .unit(P1, "base", RIFT_HERALD, "herald") // 7 Might → Mighty
      .unit(P1, "base", { might: 2, name: "Small Fry" }, "small") // NOT Mighty
      .unit(P2, "base", { might: 6, name: "Enemy Brute" }, "enemyBrute") // Mighty but not friendly
      .hand(P1, SACRIFICE, "sac")
      // The unit already in hand before Sacrifice draws: 5 energy (unaffordable normally) + 1 fury power.
      .hand(P1, { domain: "fury", energyCost: 5, might: 4, name: "Hand Unit", powerCost: ["fury"] }, "handUnit")
      .deck(P1, [SKULKER, SKULKER], ["top1", "top2"]) // the two cards Sacrifice will draw
  );
}

describe("Sacrifice × Rift Herald — the cost-kill's Deathknell resolves before Sacrifice draws", () => {
  test("Sacrifice's own resolution: costs 1 energy (no power); P1 draws 2 (the known deck top) and channels 1 rune exhausted; Sacrifice → trash", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await castSacrifice(game, "herald");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(1); // no power in Sacrifice's cost
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["handUnit", "top1", "top2"]));
    expect(game.zoneOf("top1")).toBe("hand");
    expect(game.zoneOf("top2")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channeled exhausted
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
  });

  test("only FRIENDLY MIGHTY units are offered for the kill cost — Herald yes; the 2-Might ally and the enemy 6-Might brute no (356.7); engine asks for no unit at all", async () => {
    // Expected: the cast option carries a kill-cost choice whose only legal value is "herald".
    // Actual: play-spell ignores `additionalCost.kill`; the option has no fields.
    const game = await board().build();
    expect(sacrificeOffered(game)).toEqual(["herald"]);
  });

  test.failing("BUG: paying the cost kills Rift Herald DURING Sacrifice's play — before anyone gets priority Herald is in the trash and its Deathknell sits ABOVE Sacrifice on the chain (357.2, 428.1.a.1.b, 359.3.a/b)", async () => {
    // Expected: chain bottom→top = [Sacrifice, Rift Herald trigger]; herald in trash; P1 holds priority.
    // Actual: no kill happens; chain = [Sacrifice] and Herald stays in base.
    const game = await board().build();
    await castSacrifice(game, "herald");
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.locationOf("small")).toBe("base"); // only the chosen unit is killed
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sac", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "herald", controller: P1, triggered: true }),
    ]);
    expect(game.actingSeat()).toBe(P1);
    // Nothing has resolved yet: no cards drawn.
    expect(game.zoneOf("top1")).toBe("mainDeck");
  });

  test.failing("BUG: ORDER — Herald's Deathknell resolves FIRST and can only play a unit from the PRE-DRAW hand (energy ignored, power paid); THEN Sacrifice draws 2 and channels 1 exhausted (340.1)", async () => {
    // Expected: after one round of passes the top item (Deathknell) resolves → P1 is asked which hand
    // unit to play: only "handUnit" is offered (top1/top2 are still in the deck). It enters base for 0
    // energy but 1 fury. Sacrifice is still on the chain; after the next passes it resolves → top1/top2
    // arrive in hand, one rune channeled exhausted.
    // Actual: no cost-kill, no Deathknell; Sacrifice resolves alone.
    const game = await board().build();
    await castSacrifice(game, "herald");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sac", "herald"]);

    await game.p1.passPriority();
    await game.p2.passPriority(); // top item — the Deathknell — resolves
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    const offered = d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("handUnit");
    expect(offered).not.toContain("top1"); // not drawn yet — Sacrifice hasn't resolved
    expect(offered).not.toContain("top2");
    expect(game.zoneOf("top1")).toBe("mainDeck");
    await game.p1.pick("handUnit");
    await game.settle(); // finish the played unit landing, then Sacrifice resolves

    expect(game.zoneOf("handUnit")).toBe("base"); // played for 0 energy (P1 had 0 left) …
    expect(game.p1.power("fury")).toBe(0); // … but its Power cost was still paid
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.zoneOf("top1")).toBe("hand"); // drawn only now
    expect(game.zoneOf("top2")).toBe("hand");
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.chain()).toHaveLength(0);
  });

  test.failing("BUG: Rift Herald's Deathknell in isolation (killed by Final Spark) asks P1 to play a unit from hand to base ignoring its Energy cost; engine puts the trigger on the chain but it resolves as a no-op", async () => {
    // Expected: Herald dies → Deathknell on chain → resolves → P1 picks "handUnit" (5 energy, has 0) →
    // it enters P1's base; 1 fury paid.
    // Actual: the trigger resolves without prompting; nothing is played.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { fury: 2, rainbow: 2 } }) // 8 for Final Spark; nothing left for a 5-cost unit
      .unit(P1, "base", RIFT_HERALD, "herald")
      .hand(P1, { domain: "fury", energyCost: 5, might: 4, name: "Hand Unit", powerCost: ["fury"] }, "handUnit")
      .hand(P1, FINAL_SPARK, "spark")
      .build();
    await game.p1.cast("spark", { targets: "herald" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
    expect(game.p1.energy()).toBe(0);
    game.script(P1, ["handUnit", "handUnit"]); // answer the "which unit" prompt (and a follow-up naming it, if any)
    await game.settle();
    expect(game.zoneOf("handUnit")).toBe("base");
    expect(game.p1.energy()).toBe(0); // energy ignored
  });

  test("negative — with no friendly Mighty unit (only a 4-Might ally) the additional cost cannot be paid, so Sacrifice is NOT a legal play (356.7); engine lets it be cast", async () => {
    // Expected: can("cast") is false and an attempted cast is rejected; nothing drawn.
    // Actual: castable; resolves as plain "Draw 2, channel 1 exhausted".
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 4, name: "Almost Mighty" }, "almost")
      .unit(P2, "base", { might: 6, name: "Enemy Brute" }, "enemyBrute") // enemy Mighty units don't count
      .hand(P1, SACRIFICE, "sac")
      .build();
    expect(game.p1.can("cast", "sac")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sac"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sac")).toBe("hand");
    expect(game.locationOf("almost")).toBe("base");
  });

  test("sanity for the negative case's premise: 4 Might is not Mighty, 7 Might is (Mighty = 5+)", async () => {
    const game = await board().build();
    expect(game.state("herald").might).toBeGreaterThanOrEqual(5);
    expect(game.state("small").might).toBeLessThan(5);
    expect(game.state("enemyBrute").owner).toBe(P2);
  });
});
