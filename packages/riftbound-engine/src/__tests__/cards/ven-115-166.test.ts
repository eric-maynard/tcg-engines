/**
 * Ocean Drake — ven-115-166 · Unit (Dragon) · Chaos · 8 energy + [chaos][chaos] · 7 Might
 *
 *   You may play me to an open battlefield.
 *   When you play me, you may return a non-Dragon unit to its owner's hand.
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. "Open" battlefield (170.11.c) = unoccupied AND uncontrolled: an enemy-controlled battlefield or
 *     an uncontrolled one with a squatter on it is NOT a destination; base / your own battlefield
 *     stay legal. Landing on an open battlefield → showdown → control → conquer for 1 point.
 *  2. The play effect is an optional trigger on the chain (383.4.a): decline → nobody moves; accept →
 *     ONE unit, any controller, ANY location (base or battlefield — no "at a battlefield" here).
 *  3. "non-Dragon": Dragon-tagged units are never offered — and Ocean Drake is itself a Dragon, so it
 *     can't bounce itself (or a Cloud Drake) to dodge its 8+2 cost being answered.
 *  4. "its OWNER's hand" (controller ≠ owner): a unit you control but the opponent owns goes to THEIR
 *     hand. A token unit put into a hand ceases to exist (186.1). A friendly unit → your hand, replayable.
 *  5. Cost: 8 energy AND two chaos power; 7 energy or a single chaos → not playable. Enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-115-166";
const CLOUD_DRAKE = "ven-048-166"; // Unit · 6 · 5 Might — a Dragon ("When you play me, draw 1.")

function board(energy = 8, chaos = 2) {
  return scenario()
    .resources(P1, { energy, power: { chaos } })
    .battlefield("mineBf", { controller: P1 })
    .battlefield("openBf", { controller: null })
    .battlefield("enemyBf", { controller: P2 })
    .unit(P1, "mineBf", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "enemyBf", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
    .hand(P1, CARD, "drake");
}

const playLocations = (game: Game) => [...((game.p1.option("play", "drake")?.fields.find((f) => f.arg === "to")?.options as string[]) ?? [])].sort();

async function playAndOffer(game: Game, to = "base"): Promise<string[]> {
  await game.p1.play("drake", { to });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
}

describe("Ocean Drake (ven-115-166)", () => {
  test("registry payload: open-battlefield play permission static + OPTIONAL play-self trigger returning a unit (excludeTag Dragon) to hand; 8 energy + [chaos][chaos]; 7 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 8, might: 7, name: "Ocean Drake", powerCost: ["chaos", "chaos"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { type: "play-restriction" }, type: "static" });
    expect(JSON.stringify(def?.abilities?.[0])).toMatch(/open battlefield/);
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { target: { filter: { excludeTag: "Dragon" }, type: "unit" }, type: "return-to-hand" },
      optional: true,
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(JSON.stringify(def?.abilities?.[1])).not.toMatch(/"location":"battlefield"/); // any location
  });

  test("cost: 8 energy + 2 chaos deducted, enters base exhausted at 7 Might; 7 energy or only 1 chaos → not playable", async () => {
    const game = await board().build();
    await game.p1.play("drake", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ isExhausted: true, might: 7 });
    expect((await board(7, 2).build()).p1.can("play", "drake")).toBe(false);
    expect((await board(8, 1).build()).p1.can("play", "drake")).toBe(false);
  });

  test("destinations: base, your own battlefield and the OPEN battlefield — never the enemy-controlled one", async () => {
    const game = await board().build();
    expect(playLocations(game)).toEqual(["base", "battlefield-mineBf", "battlefield-openBf"]);
    const t = await game.p1.try((p) => p.play("drake", { to: "enemyBf" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("drake")).toBe("hand");
  });

  test("170.11.c: an uncontrolled battlefield with a unit on it is occupied, hence not open, hence not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 2 } })
      .battlefield("openBf", { controller: null })
      .battlefield("squat", { controller: null })
      .unit(P2, "squat", { might: 2, name: "Squatter" }, "squatter")
      .hand(P1, CARD, "drake")
      .build();
    expect(playLocations(game)).toEqual(["base", "battlefield-openBf"]);
    expect((await game.p1.try((p) => p.play("drake", { to: "squat" }))).ok).toBe(false);
  });

  test("played to the open battlefield (trigger declined): it stands there exhausted, P1 takes control and conquers for 1 point", async () => {
    const game = await board().build();
    await game.p1.play("drake", { to: "openBf" });
    expect(game.zoneOf("drake")).toBe("battlefield-openBf");
    game.script(P1, ["no"]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.gameState.battlefields.openBf?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("drake").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("play effect accepted: the offer spans BOTH players' non-Dragon units at ANY location; picking the enemy Foe at a battlefield returns it to P2's hand", async () => {
    const game = await board().build();
    const offered = await playAndOffer(game);
    expect(offered).toEqual(expect.arrayContaining(["foe", "holder", "home", "pal"]));
    await game.p1.pick("foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p2.hand()).toContain("foe");
    expect(game.p2.units("enemyBf")).toEqual([]);
    expect(game.zoneOf("drake")).toBe("base");
  });

  test("a unit in a BASE is just as legal: the enemy Homebody goes back to P2's hand", async () => {
    const game = await board().build();
    await playAndOffer(game);
    await game.p1.pick("home");
    await game.settle();
    expect(game.zoneOf("home")).toBe("hand");
    expect(game.p2.hand()).toContain("home");
  });

  test("'you may' declined: the trigger leaves the chain and every unit stays exactly where it was", async () => {
    const game = await board().build();
    await game.p1.play("drake", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1, triggered: true })]);
    await game.settle();
    await game.p1.no();
    expect((await game.settle()).reason).toBe("open");
    expect(game.chain()).toHaveLength(0);
    for (const [id, zone] of [["foe", "battlefield-enemyBf"], ["home", "base"], ["pal", "base"], ["holder", "battlefield-mineBf"]] as const) {
      expect(game.zoneOf(id)).toBe(zone);
    }
  });

  test("non-Dragon filter: a Dragon-tagged unit is never offered while the plain units around it are", async () => {
    const game = await board().unit(P2, "base", { might: 6, name: "Wyrm", tags: ["Dragon"] }, "wyrm").build();
    const offered = await playAndOffer(game);
    expect(offered).not.toContain("wyrm");
    expect(offered).toEqual(expect.arrayContaining(["foe", "home"]));
  });

  test("Ocean Drake (and Cloud Drake) are Dragons — neither may be offered to its own play effect; the card data carries no Dragon tag so both are", async () => {
    // Expected: offer = {foe, holder, home, pal} only — never "drake" itself nor the friendly Cloud Drake.
    // Actual: tags: [] on every VEN/OGN drake, so the excludeTag filter lets both through.
    const game = await board().unit(P1, "base", CLOUD_DRAKE, "cloud").build();
    const offered = await playAndOffer(game);
    expect(offered).not.toContain("drake");
    expect(offered).not.toContain("cloud");
    expect(offered.sort()).toEqual(["foe", "holder", "home", "pal"]);
  });

  test("'its OWNER's hand': a unit P1 controls but P2 owns goes to P2's hand, not P1's", async () => {
    const game = await board().card("borrowed", { controller: P1, def: { cardType: "unit", might: 3, name: "Borrowed" }, owner: P2, zone: "base" }).build();
    expect(game.state("borrowed")).toMatchObject({ controller: P1, owner: P2 });
    await playAndOffer(game);
    await game.p1.pick("borrowed");
    await game.settle();
    expect(game.zoneOf("borrowed")).toBe("hand");
    expect(game.p2.hand()).toContain("borrowed");
    expect(game.p1.hand()).not.toContain("borrowed");
  });

  test("a friendly unit is a fine choice: Pal returns to P1's hand and can be replayed the same turn", async () => {
    const game = await board(10, 2).build();
    await playAndOffer(game);
    await game.p1.pick("pal");
    await game.settle();
    expect(game.p1.hand()).toContain("pal");
    expect(game.p1.can("play", "pal")).toBe(true);
  });

  test("186.1: an enemy TOKEN unit returned 'to hand' simply ceases to exist — it is in nobody's hand and off the board", async () => {
    const game = await board().card("token-tentacle", { def: { cardType: "unit", might: 1, name: "Tentacle" }, owner: P2, zone: "base" }).build();
    const offered = await playAndOffer(game);
    expect(offered).toContain("token-tentacle");
    await game.p1.pick("token-tentacle");
    await game.settle();
    expect(game.p2.hand()).not.toContain("token-tentacle");
    expect(game.p2.units()).not.toContain("token-tentacle");
    expect(game.has("token-tentacle")).toBe(false); // the token no longer exists anywhere
  });
});
