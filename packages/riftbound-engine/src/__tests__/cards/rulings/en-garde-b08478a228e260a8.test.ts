/**
 * Ruling b08478a228e260a8 — En Garde (OGN-046 → ogn-046-298) · Spell · Calm · [1] · Reaction
 *     "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you control there."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · Action · "Move a friendly unit and ready it."
 *
 * Q: In a showdown, can you play an ACTION in response to another card once the opponent passed priority, or only Reactions?
 * A: While anything is on the chain only Reactions may be played; Actions need an empty chain (and Focus). So: En Garde is
 *    played and its chain resolves (+1/+2) → chain empty → the opponent may now open a NEW chain with Ride the Wind (Action) →
 *    their unit goes back → everyone passes → combat damage.
 * Rules: 336–338 (closed state: Reactions only), 347 (Focus + empty chain to play Actions in a showdown), 383, 465 (damage step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1 holds bf1 with a lone Defender (3) and has En Garde + [1]. P2: Raider A (3) + Raider B (2) in base, Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "base", { might: 3, name: "Raider A" }, "ra")
    .unit(P2, "base", { might: 2, name: "Raider B" }, "rb")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** Both Raiders attack bf1; P2 passes Focus; P1 opens a chain with En Garde on the Defender and passes priority to P2. */
async function enGardePending(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["ra", "rb"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("engarde", { targets: "def" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "engarde", controller: P1, targets: ["def"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling b08478a228e260a8 — no Actions on top of a pending chain; open a new chain once it is empty", () => {
  test("control: in the open showdown with Focus and an EMPTY chain, P2 could play Ride the Wind (Action)", async () => {
    const game = await board().build();
    await game.p2.move(["ra", "rb"], "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "rtw")).toBe(true);
  });

  test("with En Garde on the chain and priority passed to P2: Ride the Wind (Action) is NOT legal — P2's only options are Reaction-speed (here: pass/concede); forcing it fails and the chain is unchanged", async () => {
    const game = await enGardePending();
    expect(game.p2.can("cast", "rtw")).toBe(false);
    const verbs = (game.decision()?.kind === "action" ? game.p2.legal() : []).map((o) => o.verb).toSorted();
    expect(verbs).toEqual(["concede", "passPriority"]);
    const r = await game.p2.try((p) => p.cast("rtw", { targets: "rb" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde"]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  });

  test("P2 passes → En Garde resolves: the lone Defender gets +1 and the additional +1 (3 → 5); the chain is empty again and the showdown is still open", async () => {
    const game = await enGardePending();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.state("def")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("NOW (empty chain, P2 with Focus) Ride the Wind is legal: P2 opens a new chain moving Raider B back to base (readied); it resolves; both pass; combat damage: Raider A (3) dies to the 5-Might Defender, who holds", async () => {
    const game = await enGardePending();
    await game.p2.passPriority(); // En Garde resolves
    for (let i = 0; i < 3 && game.decision()?.seat !== P2; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "rtw")).toBe(true);
    await game.p2.cast("rtw", { targets: "rb", answers: ["base"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("base");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("rb")).toMatchObject({ isReady: true, location: "base" });
    // All players pass → damage occurs.
    await game.settle();
    expect(game.zoneOf("ra")).toBe("trash");
    expect(game.state("def")).toMatchObject({ location: "bf1", might: 5 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("rb")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
