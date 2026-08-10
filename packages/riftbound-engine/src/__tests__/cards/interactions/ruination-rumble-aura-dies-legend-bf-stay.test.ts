/**
 * Interaction: The Ruination (unl-180-219) · Spell · Order · 9 + [order]×3 — "Kill all units."
 *   × Rumble, Scrapper (sfd-089-221) · Champion Unit · Mind · 5 + [mind] · 4 Might —
 *     "Your Mechs have +1 [Might] (including me). When I hold, play a 3 [Might] Mech unit token to your base."
 *   × Trifarian War Camp (ogn-294-298) · Battlefield — "Units here have +1 [Might]. (This includes attackers.)"
 *   with P1's legend Mechanized Menace (sfd-181-221) — "Your Mechs have [Shield]. (+1 [Might] while they're defenders.)"
 *   (+ Production Surge sfd-076-221 "Play a 3 [Might] Mech unit token to your base. Draw 1." to mint the fresh token.)
 *
 * Rules: 365.1 / 366.1 (a permanent's passive applies only while it is on the board; from the trash only if
 * the text says so), 170.3 / 170.8 (a battlefield is not a unit; its passive is continuous for units "here"),
 * 174.2.b / 174.3 / 174.6 (a legend is not a permanent, cannot be killed, its passive is always on), 186.1 (a
 * token that leaves the board ceases to exist), 124 (a card that changes zones is a new object), 190.4.c
 * (control of a battlefield lapses when no unit of the controller remains).
 *
 * Q: P1 controls War Camp with Rumble and a 3-Might Mech token there. (a) Token/Rumble Might + keywords and
 *    which passives are live? (b) P2 casts The Ruination — what dies, what happens to the token, do the
 *    legend's and the battlefield's passives survive? (c) A fresh Mech token in base, later moved to War Camp?
 *    (d) A replayed Rumble — does the old aura come back or is exactly one new +1 registered?
 * Expected: (a) token 3 +1 Rumble +1 Camp = 5 with [Shield] (no Might off-defence); Rumble 4 +1 +1 = 6.
 * (b) Rumble → P1's trash (aura gone at once), token ceases to exist; War Camp and Mechanized Menace are not
 * units — both stay put with their passives; P1 loses control of the empty Camp. (c) 3 + Shield in base;
 * 4 + Shield at War Camp. (d) the new Rumble registers ONE new +1 from the moment it lands — Mechs read +1, not +2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_RUINATION = "unl-180-219";
const RUMBLE = "sfd-089-221";
const WAR_CAMP = "ogn-294-298";
const MECHANIZED_MENACE = "sfd-181-221";
const PRODUCTION_SURGE = "sfd-076-221"; // Mind Action · 4 (2 less with a Mech) · Mech token to base, draw 1

/**
 * P2's turn. P1: legend Mechanized Menace; controls the (live, non-inert) War Camp with Rumble and a 3-Might
 * Mech TOKEN standing there; Production Surge and a second Rumble in hand for the follow-ups. P2 holds The
 * Ruination fully funded (9 + 3 order).
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, MECHANIZED_MENACE, "menace")
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .unit(P1, "camp", RUMBLE, "rumble")
    .unit(P1, "camp", { isToken: true, might: 3, name: "Mech", tags: ["Mech"] }, "token-mech")
    .resources(P2, { energy: 9, power: { order: 3 } })
    .hand(P2, THE_RUINATION, "ruin")
    .hand(P1, PRODUCTION_SURGE, "surge")
    .hand(P1, RUMBLE, "rumble2");
}

const SHIELD_FROM_LEGEND = { duration: "static", keyword: "Shield" };

async function ruined(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("ruin");
  await game.settle();
  return game;
}

/** After The Ruination: pass to P1's turn and mint a fresh Mech token in base with Production Surge. */
async function freshTokenInBase(): Promise<{ game: Game; token: string }> {
  const game = await ruined();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 12, power: { mind: 3 } });
  await game.p1.cast("surge");
  await game.settle();
  const mechs = game.findAll({ name: "Mech", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");
  expect(mechs).toHaveLength(1);
  return { game, token: mechs[0] as string };
}

describe("The Ruination × Rumble aura × War Camp × Mechanized Menace — what 'kill all units' does and does not switch off", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) before: the Mech token at War Camp is 3 +1 (Rumble, 365) +1 (Camp, 170.8) = 5 and has [Shield] from the legend (174.6) — Shield adds no Might off-defence", async () => {
    const game = await board().build();
    expect(game.state("token-mech")).toMatchObject({ baseMight: 3, isToken: true, might: 5, staticMightBonus: 2, zone: "battlefield-camp" });
    expect(game.state("token-mech").keywords).toContain("Shield");
    expect(game.state("token-mech").grantedKeywords).toContainEqual(SHIELD_FROM_LEGEND);
  });

  test("(a) before: Rumble himself is 4 +1 (including me) +1 (Camp) = 6, and — not being a Mech by tag — gets no Shield", async () => {
    const game = await board().build();
    expect(game.state("rumble")).toMatchObject({ baseMight: 4, might: 6, staticMightBonus: 2 });
    expect(game.state("rumble").keywords).not.toContain("Shield");
  });

  test("(a) the three live passives are separable: a non-Mech P1 unit at the Camp reads only the battlefield's +1 (no Rumble, no Shield); a P1 Mech in base reads only Rumble +1 + Shield (no Camp)", async () => {
    const game = await board()
      .unit(P1, "camp", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "base", { isToken: true, might: 3, name: "Mech", tags: ["Mech"] }, "token-home")
      .build();
    expect(game.state("grunt")).toMatchObject({ might: 3, staticMightBonus: 1 });
    expect(game.state("grunt").keywords).not.toContain("Shield");
    expect(game.state("token-home")).toMatchObject({ might: 4, staticMightBonus: 1 });
    expect(game.state("token-home").grantedKeywords).toContainEqual(SHIELD_FROM_LEGEND);
  });

  // ---------------------------------------------------------------- (b)
  test("(b) P2's Ruination (9 + 3 order) kills all UNITS at once: Rumble → P1's trash, the Mech token ceases to exist on leaving the board (186.1) — it is in nobody's trash", async () => {
    const game = await board().build();
    await game.p2.cast("ruin");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("rumble")).toBe("trash");
    expect(game.p1.trash()).toContain("rumble");
    expect(game.zoneOf("token-mech")).toBe("gone");
    expect(game.has("token-mech")).toBe(false);
    expect([...game.p1.trash(), ...game.p2.trash()].filter((id) => id.startsWith("token-"))).toEqual([]);
    expect(game.zoneOf("ruin")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
  });

  test("(b) battlefields and legends are not units (170.3, 174.3): War Camp stays in the battlefield row and Mechanized Menace in the legend zone — only P1's CONTROL of the now-empty Camp lapses (190.4.c)", async () => {
    const game = await ruined();
    expect(game.zoneOf("camp")).toBe("battlefieldRow");
    expect(game.battlefields()).toEqual(["camp"]);
    expect(game.state("camp").name).toBe("Trifarian War Camp");
    expect(game.gameState.battlefields.camp?.controller).toBeNull();
    expect(game.zoneOf("menace")).toBe("legendZone");
    expect(game.p1.legend()).toBe("menace");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) registry after: a fresh Mech token minted in P1's base reads 3 Might (Rumble's aura is gone with him — nothing applies from the trash, 366.1) but still has [Shield] (legend passive untouched)", async () => {
    const { game, token } = await freshTokenInBase();
    expect(game.zoneOf("rumble")).toBe("trash");
    expect(game.state(token)).toMatchObject({ baseMight: 3, isToken: true, might: 3, staticMightBonus: 0, zone: "base" });
    expect(game.state(token).grantedKeywords).toContainEqual(SHIELD_FROM_LEGEND);
  });

  test("(c) …and once it walks into War Camp it is 3 +1 (Camp passive still registered, 170.8) = 4 with [Shield]; P1 re-conquers the empty Camp", async () => {
    const { game, token } = await freshTokenInBase();
    await game.advanceTurn();
    await game.advanceTurn(); // token readies in P1's Awaken
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(token).isReady).toBe(true);
    const before = game.p1.points();
    await game.p1.move(token, "camp");
    await game.settle();
    expect(game.locationOf(token)).toBe("camp");
    expect(game.state(token)).toMatchObject({ might: 4, staticMightBonus: 1 });
    expect(game.state(token).grantedKeywords).toContainEqual(SHIELD_FROM_LEGEND);
    expect(game.gameState.battlefields.camp?.controller).toBe(P1);
    expect(game.p1.points()).toBe(before + 1);
  });

  // ---------------------------------------------------------------- (d)
  test("(d) a replayed Rumble is a NEW object (124): exactly one new +1 is registered when it lands — the base token goes 3 → 4 (not 5), the new Rumble is 4 +1 = 5, the dead Rumble stays in the trash", async () => {
    const { game, token } = await freshTokenInBase();
    expect(game.state(token).might).toBe(3);
    await game.p1.play("rumble2", { to: "base" });
    await game.settle();
    expect(game.zoneOf("rumble2")).toBe("base");
    expect(game.zoneOf("rumble")).toBe("trash");
    expect(game.state(token)).toMatchObject({ might: 4, staticMightBonus: 1 });
    expect(game.state("rumble2")).toMatchObject({ baseMight: 4, might: 5, staticMightBonus: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) nothing retroactive: before the new Rumble arrives the token sat at 3 for the whole interval, and the +1 dates only from the new entry (Camp adds its own +1 on top when the token later moves there: 3 +1 +1 = 5)", async () => {
    const { game, token } = await freshTokenInBase();
    expect(game.state(token).might).toBe(3);
    await game.p1.play("rumble2", { to: "base" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.move(token, "camp");
    await game.settle();
    expect(game.state(token)).toMatchObject({ might: 5, staticMightBonus: 2 });
    expect(game.state("rumble2")).toMatchObject({ might: 5, zone: "base" }); // in base: self +1 only, no Camp
  });
});
