/**
 * Ruling 07ac377dd6cc251c — (no specific card) [Weaponmaster] timing.
 *   Exercised with Armed Assailant (SFD-002 → sfd-002-221) · Unit · Fury · [6][fury] · 6 Might · "[Accelerate] …
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less …)" and Skyfall of
 *   Areion (SFD-030 → sfd-030-221) · Equipment · +2 · "[Equip] [1][fury]".
 *
 * Q: Can you use Weaponmaster at any time during your turn, or only when the unit is played?
 * A: Only when the unit is played — it is a triggered PLAY EFFECT, not an activated ability. Once the unit is on the board
 *    the keyword does nothing; any later equipping is the ordinary [Equip] ability at FULL cost, on your own turn in an
 *    Open State.
 * Rules: 821.1 (Weaponmaster is a triggered "When you play me" keyword), 821.2 (inactive on board), 717/718 (Equip:
 *        controller's turn, open state, full cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARMED_ASSAILANT = "sfd-002-221";
const SKYFALL = "sfd-030-221"; // Equipment, Equip [1][fury], +2 Might

/** P1's turn with [8] + fury×3: [6][fury] for the Assailant, [1][fury] spare for a full-price Equip, and change. Skyfall unattached in base. */
function board() {
  return scenario().resources(P1, { energy: 8, power: { fury: 3 } }).gear(P1, SKYFALL, "sky").hand(P1, ARMED_ASSAILANT, "aa");
}

const equipOption = (game: Game) => game.p1.legal().find((o) => o.moveId === "equipCard");

/** Play the Assailant and DECLINE the Weaponmaster offer; settle to P1's open main phase. */
async function playedAndDeclined(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("aa");
  expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
  await game.p1.decline();
  await game.settle();
  expect(game.zoneOf("aa")).toBe("base");
  expect(game.state("sky").attachedTo).toBeUndefined();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 07ac377dd6cc251c — Weaponmaster works only as the unit is played", () => {
  test("before the unit is played there is nothing to 'activate': P1's only options are to play the Assailant (no equip-for-less, no ability on a card in hand)", async () => {
    const game = await board().build();
    expect(game.p1.legal().map((o) => o.moveId).sort()).toEqual(["concede", "endTurn", "playUnit"]);
  });

  test("ON PLAY: the Weaponmaster offer appears immediately as part of playing the Assailant — a declinable pick naming Skyfall; accepting equips it for [1][fury] − [rainbow] = just [1] (6 → 8 Might)", async () => {
    const game = await board().build();
    await game.p1.play("aa");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "aa" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["sky"]);
    expect(`${d?.prompt ?? ""}`).toMatch(/weaponmaster/i);
    await game.p1.pick("sky");
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("aa");
    expect(game.state("aa").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 2 } }); // only [1] more: the [fury] was waived
    expect(game.violations()).toEqual([]);
  });

  test("ON BOARD it is inert: after declining, the Assailant offers NO activated ability and no Weaponmaster prompt ever returns — the only way to equip now is the ordinary Equip action", async () => {
    const game = await playedAndDeclined();
    expect(game.p1.can("activate", "aa")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "aa")).toBe(false); // nothing at all is offered on the Assailant itself
    expect(game.p1.legal().map((o) => o.moveId).sort()).toEqual(["concede", "endTurn", "equipCard"]);
    expect(game.decision()?.kind).toBe("action"); // no lingering pick
  });

  test("that ordinary Equip costs the FULL [1][fury] (no [rainbow] discount) — 2/2 → 1/1 — and attaches Skyfall (+2)", async () => {
    const game = await playedAndDeclined();
    const eq = equipOption(game);
    expect(eq).toBeDefined();
    await game.p1.choose(eq!.key, { params: { equipmentId: "sky", unitId: "aa" } });
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("aa");
    expect(game.state("aa").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("and only on your own turn in an Open State: on P2's turn P1 has no Equip (nor any Weaponmaster) option even with resources floating", async () => {
    const game = await playedAndDeclined();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p1.do("addResources", { energy: 2, power: { fury: 2 } }).catch(() => undefined);
    expect(equipOption(game)).toBeUndefined();
    expect(game.p1.can("activate", "aa")).toBe(false);
    expect(game.state("sky").attachedTo).toBeUndefined();
  });
});
