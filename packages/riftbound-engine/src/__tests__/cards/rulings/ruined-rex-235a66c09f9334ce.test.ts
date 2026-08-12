/**
 * Ruling 235a66c09f9334ce — Ruined Rex (UNL-067 → unl-067-219) · Mind unit · [6] · 6 Might
 *   "[Deathknell][>] Deal 4 to an enemy unit. (When I die, get the effect.)"
 *
 * Q: Do I have to target a unit with Ruined Rex's Deathknell when he dies?
 * A: Yes. Deathknell triggers are mandatory and the text has no "may", so if any enemy unit is available you
 *    must choose one. Only when there is no legal enemy unit does the ability do nothing.
 * Rules: 402.4.b (the controller must make the trigger's choices and may not decline), 383.3.a (only a leading
 *        "you may" makes a trigger optional), 402.4 (no legal choices ⇒ the item is removed and does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const VENGEANCE = "ogn-229-298"; // [4][order][order] — "Kill a unit."

/** P2's turn with Vengeance in hand and full cost. P1's Ruined Rex sits in base; P2 fields `enemies` units. */
function board(enemies: number) {
  let s = scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUINED_REX, "rex")
    .hand(P2, VENGEANCE, "vengeance");
  for (let i = 0; i < enemies; i++) {
    s = s.unit(P2, "bf1", { might: 5, name: `Target ${i + 1}` }, `foe${i + 1}`);
  }
  return s;
}

/** P2 kills the Rex with Vengeance; the Deathknell is then P1's to finalize. */
async function killRex(enemies: number): Promise<Game> {
  const game = await board(enemies).build();
  await game.p2.cast("vengeance", { targets: "rex" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("rex")).toBe("trash");
  return game;
}

describe("Ruling 235a66c09f9334ce — Ruined Rex's Deathknell is mandatory whenever an enemy unit exists", () => {
  test("two enemy units: P1 IS asked which one, and the prompt cannot be declined — no 'you may' anywhere", async () => {
    const game = await killRex(2);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: false });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["foe1", "foe2"]);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false); // opting out is not on offer
    await game.p1.pick("foe2");
    await game.settle();
    expect(game.state("foe2").damage).toBe(4);
    expect(game.state("foe1").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("one enemy unit: nothing is asked at all — the sole legal target is bound and takes the 4", async () => {
    const game = await killRex(1);
    await game.settle();
    expect(game.state("foe1").damage).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("no enemy unit: the ability simply does nothing — no prompt, no damage anywhere (402.4)", async () => {
    const game = await killRex(0);
    expect(game.decision()).toMatchObject({ kind: "action" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("a friendly unit is never a legal choice: with only P1's own Squire on the board the trigger still does nothing", async () => {
    const game = await board(0).unit(P1, "base", { might: 3, name: "Squire" }, "squire").build();
    await game.p2.cast("vengeance", { targets: "rex" });
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.state("squire").damage).toBe(0);
  });
});
