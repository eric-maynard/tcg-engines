/**
 * Up from the Deep — ven-100-166 · Spell · Chaos · 3 energy · (no timing keyword)
 *
 *   Play two 1 [Might] Tentacle unit tokens from Bilgewater.
 *   [Flow] [3] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Rules: 180–185 (tokens: controller/owner = the caster, 182/183; a unit token is a unit — enters
 * exhausted, has Might, can move/fight, 185.2.d; cost 0, no domain, 185.3; put into a non-board zone it
 * ceases to exist, 185.4), 184.2 (no location printed → the normal unit-play destinations: your base or a
 * battlefield you control), 829 (Flow: trash-only alternate cost, then banish instead of trash; no extra
 * timing, 829.1.b.2), 310.1.a (standard speed).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. TWO tokens, each a separate 1-Might exhausted unit TOKEN controlled and owned by the caster —
 *     not one 2-Might unit, not cards (they never reach the trash when they die).
 *  2. Destination: with no controlled battlefield both land in base with no prompt; with a controlled
 *     battlefield the caster is asked (base | that battlefield) — an enemy-held battlefield is never
 *     offered.
 *  3. Partner — Illaoi, Prophet of the Great Kraken (ven-182, "+1 Might for each token unit you
 *     control"): 4 → 6 once both Tentacles land; the OPPONENT's Illaoi is unaffected.
 *  4. Flow [3] equals the base cost but is trash-only: hand cast → trash (Flow candidate), Flow cast →
 *     banishment (never a third time). Four Tentacles for 6 energy in one turn.
 *  5. Timing: no [Action]/[Reaction] — not on the opponent's turn, not in a showdown, from hand or trash.
 *  6. The tokens are real units next turn: they ready at Awaken and two 1s together kill a 2-Might
 *     defender (both die too: 2 damage split is lethal to each 1) — or one alone conquers an empty field.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-100-166";
const ILLAOI = "ven-182-166"; // 4 Might · I have +1 [Might] for each token unit you control.
const tokensIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("token-"));

function inHand(energy = 3) {
  return scenario().resources(P1, { energy }).hand(P1, CARD, "deep");
}

/** Cast (optionally via Flow) and drive resolution, answering any destination prompt with `dest`. */
async function castAndPlace(game: Game, dest = "base", flow = false): Promise<number> {
  await game.p1.cast("deep", flow ? { flow: true } : {});
  let prompts = 0;
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = r.decision;
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    prompts++;
    const opt = d.options.find((o) => o.key === dest || o.zone === dest || o.key === `battlefield-${dest}` || o.zone === `battlefield-${dest}`);
    await game.p1.pick(opt?.key ?? dest);
  }
  return prompts;
}

describe("Up from the Deep (ven-100-166)", () => {
  test("registry payload: Chaos spell, 3 energy, standard timing; abilities = [spell create-token ×2 (1-Might Tentacle unit), Flow {energy 3}]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 3, name: "Up from the Deep" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.timing ?? "standard").toBe("standard");
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; cost?: unknown; effect?: { type: string; amount?: number; token?: unknown } }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[1]).toMatchObject({ cost: { energy: 3 }, keyword: "Flow", type: "keyword" });
    expect(abilities[0]).toMatchObject({ effect: { amount: 2, token: { might: 1, name: "Tentacle", type: "unit" }, type: "create-token" }, type: "spell" });
  });

  test("cost: exactly 3 energy from hand, goes on the chain, no tokens before resolution; 2 energy (with chaos power to spare) cannot cast", async () => {
    const game = await inHand().build();
    await game.p1.cast("deep");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "deep", controller: P1, triggered: false })]);
    expect(tokensIn(game.p1.base())).toEqual([]);
    const short = await scenario().resources(P1, { energy: 2, power: { chaos: 3 } }).hand(P1, CARD, "deep").build();
    expect(short.p1.can("cast", "deep")).toBe(false);
  });

  test("resolves into TWO separate exhausted 1-Might 'Tentacle' unit tokens in the caster's base (owner = controller = P1); spell → trash", async () => {
    const game = await inHand().build();
    const prompts = await castAndPlace(game);
    expect(prompts).toBe(0); // no controlled battlefield → nothing to ask
    const toks = tokensIn(game.p1.base());
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, name: "Tentacle", owner: P1 });
    }
    expect(tokensIn(game.p2.base())).toEqual([]);
    expect(game.zoneOf("deep")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("destination (184.2): with a controlled battlefield the caster picks base or that battlefield, never the enemy-held one; choosing bf1 puts the Tentacles there", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Squatter" }, "squatter")
      .build();
    await game.p1.cast("deep");
    const r = await game.settle();
    expect(r.decision).toMatchObject({ kind: "pick", seat: P1 });
    const keys = r.decision?.kind === "pick" ? r.decision.options.map((o) => o.zone ?? o.key) : [];
    expect(keys).toContain("base");
    expect(keys).toContain("battlefield-bf1");
    expect(keys).not.toContain("battlefield-bf2");
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      await game.p1.pick("battlefield-bf1");
      await game.settle();
    }
    expect(tokensIn(game.p1.units("bf1"))).toHaveLength(2);
    expect(tokensIn(game.p1.base())).toEqual([]);
    expect(tokensIn(game.cardsAt("battlefield-bf2"))).toEqual([]);
  });

  test("partner Illaoi (+1 per token unit you control): P1's Illaoi goes 4 → 6 after the two Tentacles; P2's Illaoi stays 4", async () => {
    const game = await inHand().unit(P1, "base", ILLAOI, "illaoi").unit(P2, "base", ILLAOI, "theirs").build();
    expect(game.state("illaoi").might).toBe(4);
    await castAndPlace(game);
    expect(tokensIn(game.p1.base())).toHaveLength(2);
    expect(game.state("illaoi").might).toBe(6);
    expect(game.state("theirs").might).toBe(4);
  });

  test("Flow [3] from the trash (829): offered as a Flow play, costs exactly 3 energy, goes on the chain, then the spell is BANISHED (not trashed) and cannot be Flowed again", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).trash(P1, CARD, "deep").build();
    expect(game.p1.can("cast", "deep")).toBe(true);
    expect(game.p1.option("cast", "deep")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("deep", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 4, power: {} });
    expect(game.zoneOf("deep")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("deep")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("deep");
    expect(game.p1.can("cast", "deep")).toBe(false);
  });

  test("a Flow cast from the trash also plays the two Tentacles before being banished", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).trash(P1, CARD, "deep").build();
    await castAndPlace(game, "base", true);
    expect(game.zoneOf("deep")).toBe("banishment");
    expect(tokensIn(game.p1.base())).toHaveLength(2);
  });

  test("Flow is trash-only at [3]: 2 energy cannot Flow it (chaos power is no substitute); the trash copy stays put", async () => {
    const poor = await scenario().resources(P1, { energy: 2, power: { chaos: 5 } }).trash(P1, CARD, "deep").build();
    expect(poor.p1.can("cast", "deep")).toBe(false);
    expect((await poor.p1.try((p) => p.cast("deep", { flow: true }))).ok).toBe(false);
    expect(poor.zoneOf("deep")).toBe("trash");
    expect(poor.p1.energy()).toBe(2);
  });

  test("hand → trash → Flow in one turn: 3 + 3 energy, the hand cast lands in the TRASH (a Flow candidate), the Flow cast ends in BANISHMENT", async () => {
    const game = await inHand(6).build();
    await castAndPlace(game);
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("deep")).toBe("trash");
    expect(game.p1.can("cast", "deep")).toBe(true);
    await castAndPlace(game, "base", true);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("deep")).toBe("banishment");
    expect(game.p1.can("cast", "deep")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the hand-then-Flow double cast leaves FOUR Tentacles in base", async () => {
    const game = await inHand(6).build();
    await castAndPlace(game);
    await castAndPlace(game, "base", true);
    expect(game.zoneOf("deep")).toBe("banishment");
    expect(tokensIn(game.p1.base())).toHaveLength(4);
  });

  test("timing (310.1.a / 829.1.b.2): not castable on the opponent's turn nor during a showdown with Focus — hand copy or trash copy", async () => {
    const opp = await inHand(9).trash(P1, CARD, "deepT").active(P2).build();
    expect(opp.p1.can("cast", "deep")).toBe(false);
    expect(opp.p1.can("cast", "deepT")).toBe(false);
    expect((await opp.p1.try((p) => p.cast("deepT", { flow: true }))).ok).toBe(false);
    const sd = await inHand(9)
      .trash(P1, CARD, "deepT")
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("cast", "deep")).toBe(false);
    expect(sd.p1.can("cast", "deepT")).toBe(false);
  });

  test("the Tentacles are real units: next turn they ready; both attack a 2-Might defender → defender dies (1+1 ≥ 2), and dead tokens cease to exist (never in the trash)", async () => {
    const game = await inHand().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2, name: "Guard" }, "guard").build();
    await castAndPlace(game);
    const toks = tokensIn(game.p1.base());
    expect(toks).toHaveLength(2);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    for (const t of toks) {
      expect(game.state(t).isReady).toBe(true);
    }
    await game.p1.move(toks, "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    // Guard's 2 damage must be assigned lethally: at least one Tentacle dies; whichever died is simply gone.
    expect(tokensIn(game.p1.trash())).toEqual([]);
    const survivors = tokensIn(game.p1.units("bf1"));
    expect(survivors.length).toBeLessThanOrEqual(1);
    if (survivors.length === 1) {
      expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
      expect(game.p1.points()).toBe(1);
    }
  });

  test("a lone Tentacle walking onto an empty enemy battlefield conquers it: tokens score like any unit", async () => {
    const game = await inHand().battlefield("bf1", { controller: P2 }).build();
    await castAndPlace(game);
    const [t] = tokensIn(game.p1.base());
    expect(t).toBeDefined();
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.move(t!, "bf1");
    await game.settle();
    expect(game.locationOf(t!)).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
