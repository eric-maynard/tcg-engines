/**
 * Interaction: Mirror Image (unl-200-219) "Choose a unit. Play a ready Reflection unit token to your base. It
 *   becomes a copy of that unit. Give it [Temporary]."
 *   × Doran's Shield (sfd-033-221) Equipment · +1 · "[Equip] [calm] … / [Tank] (I must be assigned combat damage first.)"
 *   × Strike Down (sfd-107-221) "Choose an equipped friendly unit. It deals damage equal to its Might to an
 *     enemy unit. Then detach an Equipment from it."
 *   (+ Angle Shot sfd-011-221 as the tool that moves the Shield in (d).)
 *
 * Question. P1's Hoplite H (printed 3) at bf1 wears Doran's Shield — 4 Might with Tank. P1 casts Mirror Image
 * choosing H; a Reflection enters P1's base as "a copy of that unit".
 *   (a) The Reflection copies H's PRINTED copyable traits (477.1.b.1.a/b): name, type, cost, rules text and
 *       printed Might → a ready 3-Might "Hoplite" with Temporary. The +1 is a Might-Bonus modulation from an
 *       Attached card (137.3 / 718.4) and the Tank is Effect Text appended because a card is Attached to H
 *       (718.3 / 136.2.c) — neither is printed on H, and Attached/Top-Most is a state of those two cards, not
 *       a copyable trait. Nothing is attached to the token: no +1, no Tank, not "equipped" (818.3.b). The
 *       Shield stays on H (still 4 with Tank).
 *   (b) Strike Down: only H is a legal "equipped friendly unit" (818.3); the Reflection is not. With no
 *       equipped friendly unit at all the spell has no legal choice and cannot be played.
 *   (c) Both defending together: H (Tank) must be assigned lethal damage before the Reflection (815.1.b).
 *   (d) Once the Shield is actually moved onto the Reflection it IS the Top-Most card: 3+1 = 4 with Tank and a
 *       legal Strike Down choice; H reverts to 3 without Tank (434.1.f / 435.1.d-e).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const DORANS_SHIELD = "sfd-033-221";
const STRIKE_DOWN = "sfd-107-221";
const ANGLE_SHOT = "sfd-011-221";

/**
 * P1's turn. bf1 (P1's): Hoplite 3 wearing Doran's Shield (→ 4, Tank). P2: Foe 6 in base (Strike Down's
 * victim) and Raider 4 in base (next turn's attacker). P1 hand: Mirror Image, Strike Down, Angle Shot;
 * 8 energy + mind/order (Mirror Image's pips) + body (Strike Down's pip).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 1, mind: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Hoplite" }, "h", { equippedWith: ["shield"] })
    .card("shield", { def: DORANS_SHIELD, meta: { attachedTo: "h" }, owner: P1, zone: "bf1" })
    .unit(P2, "base", { might: 6, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, MIRROR_IMAGE, "mi")
    .hand(P1, STRIKE_DOWN, "sd")
    .hand(P1, ANGLE_SHOT, "shot");
}

const tokensOf = (game: Game, seat: "p1" | "p2") => game[seat].units().filter((id) => game.state(id).isToken);

/** Cast Mirror Image on H, resolve it, return the Reflection's id. */
async function reflect(game: Game): Promise<string> {
  await game.p1.cast("mi", { targets: "h" });
  await game.settle();
  const toks = tokensOf(game, "p1");
  expect(toks).toHaveLength(1);
  return toks[0]!;
}

/** The [equipped friendly, enemy] tuples Strike Down currently offers P1, as "a>b" strings. */
const strikeDownPairs = (game: Game) =>
  (game.p1.option("cast", "sd")?.fields.find((f) => f.name === "targets")?.options ?? []).map((v) => (v as string[]).join(">"));

/** P1 ends the turn; P2 sends Raider (4) into bf1 and the combat plays out. */
async function raidBf1(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
}

describe("Mirror Image × Doran's Shield × Strike Down — a copy of an equipped unit is not equipped", () => {
  // ── (a) ────────────────────────────────────────────────────────────────────────────────────────
  test("(a) setup: H is 3+1 = 4 with Tank while wearing the Shield", async () => {
    const game = await board().build();
    expect(game.state("h")).toMatchObject({ attachments: ["shield"], baseMight: 3, might: 4 });
    expect(game.state("h").keywords).toContain("Tank");
    expect(game.state("shield")).toMatchObject({ attachedTo: "h", location: "bf1" });
  });

  test("(a) the Reflection is a ready PRINTED copy — 'Hoplite', 3 Might, Temporary — with nothing attached: no +1, no Tank (477.1.b.1, 137.3, 718.3); the Shield stays on H, still 4 with Tank", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    expect(game.state(tok)).toMatchObject({ attachments: [], baseMight: 3, controller: P1, isReady: true, isToken: true, might: 3, name: "Hoplite", owner: P1, zone: "base" });
    expect(game.state(tok).keywords).toContain("Temporary");
    expect(game.state(tok).keywords).not.toContain("Tank");
    expect(game.state(tok).grantedKeywords.map((k) => k.keyword)).toEqual(["Temporary"]);
    expect(game.state("shield")).toMatchObject({ attachedTo: "h", location: "bf1" });
    expect(game.state("h")).toMatchObject({ attachments: ["shield"], might: 4 });
    expect(game.state("h").keywords).toContain("Tank");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 1, mind: 0, order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) ────────────────────────────────────────────────────────────────────────────────────────
  test("(b) Strike Down offers ONLY H as the equipped friendly unit — the Reflection is not equipped (818.3.b) and naming it is rejected", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    expect(strikeDownPairs(game)).toEqual(["h>foe", "h>raider"]);
    expect(strikeDownPairs(game).some((p) => p.startsWith(`${tok}>`))).toBe(false);
    await expect(game.p1.cast("sd", { targets: [tok, "foe"] })).rejects.toThrow();
    expect(game.zoneOf("sd")).toBe("hand");
    // …while H works: 4 damage (3 + the Shield's 1) to Foe, then the Shield comes off H.
    await game.p1.cast("sd", { targets: ["h", "foe"] });
    await game.settle();
    expect(game.state("foe")).toMatchObject({ damage: 4, zone: "base" });
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.state("h")).toMatchObject({ attachments: [], might: 3 });
  });

  test("(b) with the Shield detached from H (Angle Shot, detach mode) NO friendly unit is equipped — neither bare H nor the Reflection — so Strike Down cannot be played at all", async () => {
    const game = await board().build();
    await reflect(game);
    await game.p1.cast("shot", { targets: ["h", "shield"] });
    await game.settle();
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.state("h").might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1, mind: 0, order: 0 } }); // Strike Down is affordable…
    expect(game.p1.can("cast", "sd")).toBe(false); // …but has no legal first choice
  });

  // ── (c) ────────────────────────────────────────────────────────────────────────────────────────
  test("(c) H and the Reflection defend bf1 together against Raider 4: Tank forces the lethal 4 onto H first (815.1.b) — H dies, the Reflection is not touched and holds the field; Raider dies to 4+3", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.move(tok, "bf1"); // own battlefield: just a move
    expect(game.locationOf(tok)).toBe("bf1");
    await raidBf1(game);
    expect(game.zoneOf("h")).toBe("trash");
    expect(game.zoneOf(tok)).toBe("battlefield-bf1");
    expect(game.state(tok).damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // H left the board → the Shield detached and stayed on the board, unattached (719.5).
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, controller: P1 });
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("shield"));
    expect(game.state(tok).attachments).toEqual([]); // it did not hop onto the copy
  });

  // ── (d) ────────────────────────────────────────────────────────────────────────────────────────
  test("(d) Angle Shot (Reflection, Shield): attaching to the token detaches it from H (434.1.f) — the Reflection is now the Top-Most card at 3+1 = 4 with Tank; H is back to 3 without Tank (435.1.d/e)", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    const pairs = (game.p1.option("cast", "shot")?.fields.find((f) => f.name === "targets")?.options ?? []).map((v) => (v as string[]).join("+"));
    expect(pairs.sort()).toEqual([`${tok}+shield`, "h+shield"].sort());
    await game.p1.cast("shot", { targets: [tok, "shield"] });
    await game.settle();
    expect(game.state("shield")).toMatchObject({ attachedTo: tok, location: "base", zone: "base" }); // it is where its new wearer is
    expect(game.state(tok)).toMatchObject({ attachments: ["shield"], baseMight: 3, might: 4 });
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Tank", "Temporary"]));
    expect(game.state("h")).toMatchObject({ attachments: [], might: 3 });
    expect(game.state("h").keywords).not.toContain("Tank");
  });

  test("(d) …and now the Reflection IS an equipped friendly unit: Strike Down offers only it, and it deals 4 (3 + 1) to Foe before the Shield is detached from it", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.cast("shot", { targets: [tok, "shield"] });
    await game.settle();
    expect(strikeDownPairs(game)).toEqual([`${tok}>foe`, `${tok}>raider`]);
    await expect(game.p1.cast("sd", { targets: ["h", "foe"] })).rejects.toThrow();
    await game.p1.cast("sd", { targets: [tok, "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, mind: 0, order: 0 } });
    await game.settle();
    expect(game.state("foe")).toMatchObject({ damage: 4, zone: "base" });
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state(tok)).toMatchObject({ attachments: [], might: 3 });
    expect(game.state(tok).keywords).not.toContain("Tank");
  });

  test("(d) combat mirror of (c): with the Shield now on the Reflection, the same Raider 4 must put its lethal 4 on the REFLECTION (Tank, 4) — the token dies and ceases to exist, bare H (3) is untouched and keeps bf1", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.cast("shot", { targets: [tok, "shield"] });
    await game.settle();
    await game.p1.move(tok, "bf1");
    expect(game.state("shield")).toMatchObject({ attachedTo: tok, location: "bf1" }); // travelled with its wearer (719.3.a)
    await raidBf1(game);
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").toBe("gone"); // a token that dies ceases to exist (186.1)
    expect(game.state("h")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("raider")).toBe("trash"); // 3 + 4 = 7 ≥ 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, controller: P1 });
  });
});
