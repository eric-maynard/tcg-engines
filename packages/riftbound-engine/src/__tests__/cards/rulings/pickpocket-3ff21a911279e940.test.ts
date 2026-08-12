/**
 * Ruling 3ff21a911279e940 — Pickpocket (SFD-074 → sfd-074-221) · Unit · [3] · 3 Might
 *   "When you play me, you may kill a gear with Energy cost no more than [1]. If you do, play a Gold
 *    gear token exhausted."
 *   × Gold token (SFD-T03 → sfd-t03) "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: I Pickpocket my opponent's Gold gear and they react by using it. Do I still get a Gold gear even
 *    though I never killed theirs?
 * A: No. The Kill must actually happen: "If you do" links the reward to performing the kill. A gear that
 *    was used (and killed itself) in reaction is no longer a legal object when the trigger resolves, so
 *    the Kill is not performed and no Gold token is made. Target an EXHAUSTED Gold and it cannot answer.
 * Rules: 359.3.e.5 / 355.15 (an object that is no longer legal at resolution is skipped), 359.3.e.14
 *        ("If you do" = the linked instruction only runs when the first was performed), 421.2 (Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PICKPOCKET = "sfd-074-221";
const GOLD = "sfd-t03";

/** P1's turn with [3] and Pickpocket in hand; P2 owns one Gold token (ready or exhausted per case). */
function board(opts: { exhausted?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 3 })
    .gear(P2, GOLD, "gold", opts.exhausted ? { exhausted: true } : undefined)
    .hand(P1, PICKPOCKET, "pp");
}

const goldsOf = (game: Game, seat: string) => game.findAll({ name: "Gold", owner: seat }).filter((id) => game.zoneOf(id) === "base");

/** Play Pickpocket, opt in, aim the kill at P2's Gold, and hand priority to P2. */
async function aimedAtGold(game: Game): Promise<void> {
  await game.p1.play("pp");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "pp" } });
  await game.p1.yes();
  // With one legal gear the choice is forced and bound without asking (rule 402.2); otherwise name it.
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("gold");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pp", targets: ["gold"], triggered: true })]);
  await game.p1.passPriority();
}

describe("Ruling 3ff21a911279e940 — a Gold used in reaction leaves Pickpocket with nothing", () => {
  test("premise: the trigger is on the chain aimed at P2's ready Gold, and P2 holds priority with the Gold's Reaction ability available", async () => {
    const game = await board().build();
    await aimedAtGold(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("activate", "gold")).toBe(true);
  });

  test("ruling 3ff21a911279e940 — P2 cashes the Gold in response: the Kill finds nothing to kill, so 'if you do' fails and P1 gets NO Gold token", async () => {
    const game = await board().build();
    await aimedAtGold(game);
    await game.p2.activate("gold");
    await game.settle();
    expect(game.has("gold") ? game.zoneOf("gold") : "gone").not.toBe("base");
    expect(game.p2.power("rainbow")).toBe(1); // they got their [rainbow] out of it
    expect(goldsOf(game, P1)).toEqual([]); // and P1 got nothing
    expect(game.zoneOf("pp")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the nuance the ruling gives: aim at an EXHAUSTED Gold and it cannot answer — the Kill lands and P1 does get an exhausted Gold token", async () => {
    const game = await board({ exhausted: true }).build();
    await aimedAtGold(game);
    expect(game.p2.can("activate", "gold")).toBe(false);
    expect((await game.p2.try((p) => p.activate("gold"))).ok).toBe(false);
    await game.settle();
    expect(game.has("gold") ? game.zoneOf("gold") : "gone").not.toBe("base");
    expect(game.p2.power("rainbow")).toBe(0);
    const mine = goldsOf(game, P1);
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold" });
  });

  test("declining the trigger outright is the same story from the other end: no kill performed, no Gold token", async () => {
    const game = await board().build();
    await game.p1.play("pp");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("gold")).toBe("base"); // P2's Gold survives
    expect(goldsOf(game, P1)).toEqual([]);
    expect(game.zoneOf("pp")).toBe("base");
  });
});
