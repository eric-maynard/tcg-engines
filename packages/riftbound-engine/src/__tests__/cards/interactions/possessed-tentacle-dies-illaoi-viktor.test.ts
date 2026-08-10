/**
 * Interaction: Illaoi, Prophet of the Great Kraken (ven-182-166) · 4 Might · "When you play me or when I
 *     score, play a [1] [Might] Tentacle unit token from Bilgewater. I have +1 [Might] for each token unit
 *     you control."
 *   × Possession (ogn-203-298) "[Action] Choose an enemy unit at a battlefield. Take control of it and recall
 *     it. (Send it to your base. This isn't a move.)"
 *   × Viktor, Leader (ogn-246-298) "When another non-Recruit unit you control dies, play a 1 [Might] Recruit
 *     unit token into your base."
 *   (+ Spectral Centaur unl-068-219 "When another friendly unit dies, give me +2 [Might] this turn." as P2's
 *    'friendly unit dies' listener, and an inline 1-damage "Ping" spell to kill the Tentacle.)
 *
 * Question: P1 controls Illaoi + Viktor in base and a 1-Might Tentacle token (owner/controller P1) at bf1.
 * P2 resolves Possession on the Tentacle. Report (owner, controller, zone, exists) before / after Possession /
 * after it dies under P2's control (P1 pings it for 1 on P1's turn). (a) After Possession: whose base, Illaoi's
 * Might, is it "your token unit" for P2? (b) When it dies under P2: whose trash, does it stay, does P1's Viktor
 * trigger, does a P2 "friendly unit dies" trigger fire? (c) Contrast without Possession.
 *
 * Rules: 182/183 (token controller/owner), 477.1.a (control-changing effect; owner never changes), 455/456
 * (recall = to its controller's base, not a move), 740.1.a (friendly/"you control" = controller), 056.2 (a
 * card put in a trash goes to its OWNER's), 186.1 (a token in a non-board zone ceases to exist), 428.1.
 *
 * Expected: before = (P1, P1, bf1, exists). After Possession = (P1, P2, P2's base, exists); Illaoi 5→4; it IS
 * P2's token unit now (a P2 Illaoi goes 4→5). Dies under P2 → put in P1's (owner's) trash and ceases to exist:
 * in neither trash, `has` false; Viktor (P1) does NOT trigger (P1 didn't control it); Spectral Centaur (P2)
 * DOES (+2). (c) Without Possession it dies under P1: Viktor triggers → Recruit token in P1's base, Illaoi
 * 5→4→5; the Centaur stays 5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ILLAOI = "ven-182-166";
const POSSESSION = "ogn-203-298";
const VIKTOR_LEADER = "ogn-246-298";
const SPECTRAL_CENTAUR = "unl-068-219";
const TENTACLE = { cardType: "unit", might: 1, name: "Tentacle", tags: ["Bilgewater"] } as const;
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Ping",
  timing: "action",
} as const;

/**
 * P2's turn (Possession is an [Action]). bf1 is P1's, holding P1's Tentacle token. P1 base: Illaoi, Viktor.
 * P2 base: Spectral Centaur and P2's own Illaoi (to read "your token unit" from P2's side). P1 holds Ping.
 */
function board(active: typeof P1 | typeof P2 = P2) {
  return scenario()
    .active(active)
    .resources(P2, { energy: 8, power: { chaos: 3 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", ILLAOI, "illaoi")
    .unit(P1, "base", VIKTOR_LEADER, "viktor")
    .card("token-tentacle", { def: TENTACLE, owner: P1, zone: "bf1" })
    .unit(P2, "base", SPECTRAL_CENTAUR, "centaur")
    .unit(P2, "base", ILLAOI, "illaoi2")
    .hand(P2, POSSESSION, "possession")
    .hand(P1, PING, "ping");
}

const T = "token-tentacle";

const recruits = (game: Game, owner: typeof P1 | typeof P2) =>
  game.findAll({ name: "Recruit", owner }).filter((id) => game.locationOf(id) !== undefined);

async function possess(game: Game): Promise<void> {
  await game.p2.cast("possession", { targets: T });
  await game.settle();
  expect(game.zoneOf("possession")).toBe("trash");
}

/** After Possession, pass to P1's turn and have P1 Ping the (now P2-controlled) Tentacle for 1. */
async function possessedThenPinged(): Promise<Game> {
  const game = await board().build();
  await possess(game);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 1 });
  await game.p1.cast("ping", { targets: T });
  await game.settle();
  return game;
}

describe("Possession on Illaoi's Tentacle token, then it dies under P2 — owner vs controller for Illaoi / Viktor / death triggers", () => {
  test("before: the Tentacle is owner P1 / controller P1 / at bf1 / exists; Illaoi is 4 + 1 token = 5; P2's Illaoi is 4", async () => {
    const game = await board().build();
    expect(game.has(T)).toBe(true);
    expect(game.state(T)).toMatchObject({ controller: P1, isToken: true, might: 1, owner: P1, zone: "battlefield-bf1" });
    expect(game.state("illaoi").might).toBe(5);
    expect(game.state("illaoi2").might).toBe(4);
    expect(game.p1.units("bf1")).toEqual([T]);
  });

  test("Possession offers the Tentacle (an enemy unit at a battlefield) and not P1's base units", async () => {
    const game = await board().build();
    const offered = (game.p2.option("cast", "possession")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual([T]);
    await expect(game.p2.cast("possession", { targets: "illaoi" })).rejects.toThrow();
  });

  test("(a) after Possession: controller P2, OWNER still P1 (183 / 477.1.a), recalled to its new controller's base (455), still exists", async () => {
    const game = await board().build();
    await possess(game);
    expect(game.has(T)).toBe(true);
    expect(game.state(T)).toMatchObject({ controller: P2, owner: P1, zone: "base" });
    expect(game.locationOf(T)).toBe("base");
    expect(game.p2.units("base")).toContain(T);
    expect(game.p1.units()).not.toContain(T);
    expect(game.cardsAt("bf1")).toEqual([]);
  });

  test("(a) 'you control' counts controllers (740.1.a): P1's Illaoi drops 5 → 4 at once, and P2's Illaoi rises 4 → 5 — it is now P2's token unit", async () => {
    const game = await board().build();
    await possess(game);
    expect(game.state("illaoi").might).toBe(4);
    expect(game.state("illaoi2").might).toBe(5);
  });

  test("(a) the recall is not a move and kills nothing: no death trigger fired, no Recruit anywhere, Centaur still 5", async () => {
    const game = await board().build();
    await possess(game);
    expect(recruits(game, P1)).toEqual([]);
    expect(recruits(game, P2)).toEqual([]);
    expect(game.state("centaur").might).toBe(5);
    expect(game.chain()).toHaveLength(0);
  });

  test("(b) killed under P2's control: it heads for its OWNER's trash (056.2) and, being a token, ceases to exist (186.1) — in neither trash, no longer a card in the game", async () => {
    const game = await possessedThenPinged();
    expect(game.has(T)).toBe(false);
    expect(game.zoneOf(T)).toBe("gone");
    expect(game.locationOf(T)).toBeUndefined();
    expect(game.p1.trash()).not.toContain(T);
    expect(game.p2.trash()).not.toContain(T);
    expect(game.p1.trash()).toContain("ping");
    expect(game.p2.units()).not.toContain(T);
  });

  test("(b) P1's Viktor, Leader does NOT trigger — P1 did not CONTROL the dying unit (ownership / trash destination are irrelevant): no Recruit token, Illaoi stays 4", async () => {
    const game = await possessedThenPinged();
    expect(recruits(game, P1)).toEqual([]);
    expect(game.p1.units("base").sort()).toEqual(["illaoi", "viktor"]);
    expect(game.state("illaoi").might).toBe(4);
    expect(game.chain()).toHaveLength(0);
  });

  test("(b) a P2 'when another friendly unit dies' trigger DOES fire: Spectral Centaur 5 → 7; P2's Illaoi falls back to 4", async () => {
    const game = await possessedThenPinged();
    expect(game.state("centaur").might).toBe(7);
    expect(game.state("illaoi2").might).toBe(4);
    expect(recruits(game, P2)).toEqual([]); // P2 has no Viktor; nothing else appears
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) contrast: no Possession — the Tentacle dies at bf1 under P1 -----------------------------------

  test("(c) without Possession the Tentacle dies under P1's control: Viktor triggers → one Recruit token in P1's base, so Illaoi goes 5 → (4) → 5", async () => {
    const game = await board(P1).build();
    expect(game.state("illaoi").might).toBe(5);
    await game.p1.cast("ping", { targets: T });
    await game.settle();
    expect(game.has(T)).toBe(false);
    expect(game.zoneOf(T)).toBe("gone");
    const r = recruits(game, P1);
    expect(r).toHaveLength(1);
    expect(game.state(r[0] as string)).toMatchObject({ controller: P1, isToken: true, location: "base", might: 1, name: "Recruit", owner: P1 });
    expect(game.state("illaoi").might).toBe(5);
  });

  test("(c) …and P2's listeners see nothing: Spectral Centaur stays 5, P2's Illaoi stays 4, no Recruit for P2", async () => {
    const game = await board(P1).build();
    await game.p1.cast("ping", { targets: T });
    await game.settle();
    expect(game.state("centaur").might).toBe(5);
    expect(game.state("illaoi2").might).toBe(4);
    expect(recruits(game, P2)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
