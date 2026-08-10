/**
 * Ruling 7cf82117a1fc71a9 — Battle Mistress (SFD-203 → sfd-203-221, Legend · Sivir) "When you recycle a rune, you may exhaust me to
 *     play a Gold gear token exhausted. When one or more enemy units die, ready me."
 *   × Challenge (OGN-128 → ogn-128-298) · Action · 2+[body] "Choose a friendly unit and an enemy unit. They deal damage equal to their
 *     Mights to each other."
 *
 * Q: Sivir recycles a rune and exhausts for a Gold token, then an enemy unit dies (Challenge) and she readies. Can she exhaust
 *    again right away, or must another rune be recycled first?
 * A: Another rune must be recycled. The Gold ability is TRIGGERED ("when you recycle a rune"); readying her does not re-arm the
 *    earlier recycle event. Flow: recycle A → exhaust for Gold → enemy dies → she readies → recycle B → NEW trigger → exhaust again.
 * Rules: 376–378 (triggered abilities need their event each time), 383.3.a (opt-in cost paid at finalization), 414.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BATTLE_MISTRESS = "sfd-203-221";
const CHALLENGE = "ogn-128-298";

/** P1's turn: legend Sivir (ready), Brute (5) in base, Challenge in hand + [2]; runes: body rA, fury rB. P2: Weakling (2) in base. */
function board() {
  return scenario()
    .legend(P1, BATTLE_MISTRESS, "sivir")
    .resources(P1, { energy: 2 })
    .rune(P1, "body", { alias: "rA" })
    .rune(P1, "fury", { alias: "rB" })
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
    .hand(P1, CHALLENGE, "challenge")
    .unit(P2, "base", { might: 2, name: "Weakling" }, "weakling");
}

const goldCount = (game: Game) => game.p1.gear().filter((g) => game.state(g).isToken && game.state(g).name === "Gold").length;

/** Steps 1–2: recycle rune A, accept Sivir's opt-in (exhausting her), resolve → one Gold token. */
async function recycleAForGold(): Promise<Game> {
  const game = await board().build();
  await game.p1.recycleRune("rA");
  expect(game.p1.power("body")).toBe(1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sivir" } });
  await game.p1.yes();
  expect(game.state("sivir").isExhausted).toBe(true);
  await game.settle();
  expect(goldCount(game)).toBe(1);
  return game;
}

/** Step 3: Challenge (Brute vs Weakling) — the Weakling dies, Sivir's "ready me" resolves. */
async function challengeKillsWeakling(game: Game): Promise<void> {
  await game.p1.cast("challenge", { targets: ["brute", "weakling"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.settle();
  expect(game.zoneOf("challenge")).toBe("trash");
  expect(game.zoneOf("weakling")).toBe("trash");
  expect(game.state("brute").damage).toBe(2);
}

describe("Ruling 7cf82117a1fc71a9 — a readied Sivir needs a NEW rune recycle before she can exhaust for Gold again", () => {
  test("steps 1–2: recycling rune A triggers Sivir; accepting exhausts her and plays one exhausted Gold token", async () => {
    const game = await recycleAForGold();
    const [gold] = game.p1.gear().filter((g) => game.state(g).isToken);
    expect(game.state(gold as string)).toMatchObject({ isExhausted: true, name: "Gold" });
    expect(game.zoneOf("rA")).toBe("runeDeck");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("step 3: an enemy unit dies to Challenge → 'ready me' resolves and Sivir is READY again — but nothing is offered: no pending opt-in, no way to exhaust her, still exactly one Gold", async () => {
    const game = await recycleAForGold();
    await challengeKillsWeakling(game);
    expect(game.state("sivir").isExhausted).toBe(false); // readied by the death trigger
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no yes-no waiting for her
    expect(game.p1.can("activate", "sivir")).toBe(false); // it is not an activated ability
    expect(game.p1.legal().some((o) => o.card === "sivir")).toBe(false);
    expect(goldCount(game)).toBe(1); // readying did not replay the old trigger
  });

  test("steps 4–5: recycling rune B creates a NEW trigger — now she may exhaust again and a second Gold token arrives", async () => {
    const game = await recycleAForGold();
    await challengeKillsWeakling(game);
    expect(game.p1.can("recycleRune", "rB")).toBe(true);
    await game.p1.recycleRune("rB");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sivir" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.state("sivir").isExhausted).toBe(true);
    await game.settle();
    expect(goldCount(game)).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: recycling rune B while she is STILL exhausted (no enemy death in between) — the trigger happens but its 'exhaust me' cost can't be paid, so no second Gold", async () => {
    const game = await recycleAForGold();
    await game.p1.recycleRune("rB");
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.state("sivir").isExhausted).toBe(true);
    expect(goldCount(game)).toBe(1);
  });
});
