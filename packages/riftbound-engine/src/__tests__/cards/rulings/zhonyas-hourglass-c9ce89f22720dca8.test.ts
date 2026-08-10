/**
 * Ruling c9ce89f22720dca8 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Lonely Poro (sfd-036-221) · 2 Might · "[Deathknell] — If I died alone, draw 1."
 *
 * Q: I hid Zhonya's; my Poro dies and its Deathknell triggers — can I play Zhonya's in response to the Deathknell?
 * A: Yes, you can flip it (hidden ⇒ Reaction; the Deathknell on the chain is a Closed State window) — but it does NOT save
 *    the Poro: a replacement must exist before the death, and the Poro is already in the trash. Zhonya's just lands as gear
 *    (in base) and the Deathknell still resolves (draw 1 — it died alone). Caveat: the window exists because a trigger
 *    formed a chain (and control is locked during combat); a death with no trigger lets Cleanup trash the hidden card first.
 * Rules: 811 (Hidden ⇒ Reaction for [0]), 808.1.d.2 (Deathknell pending before the trash), 366–372 (replacement must
 *        pre-exist), 190.4.b (control frozen during combat), 323.6–323.7 (Open Cleanup: control + facedown lapse).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const LONELY_PORO = "sfd-036-221";

const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 with a LONE Lonely Poro (2) and Zhonya's facedown there; known deck top. P2: Brute (6) in base, Bolt + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", LONELY_PORO, "poro")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .hand(P2, BOLT, "bolt")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Brute attacks bf1; both pass Focus; combat kills the Poro. Stops with the Deathknell on the chain, P1 holding priority. */
async function poroDiesInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.zoneOf("poro")).toBe("trash"); // already dead and in the trash (808.1.d.2)
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling c9ce89f22720dca8 — flipping a hidden Zhonya's in response to the Poro's Deathknell: legal, but too late to save it", () => {
  test("the Deathknell is on the chain (Closed State), bf1 is still P1's during the combat, and the facedown Zhonya's IS a legal Reaction play for P1", async () => {
    const game = await poroDiesInCombat();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zh")).toBe(true);
  });

  test("flipping it costs [0] and puts the GEAR into P1's base above the Deathknell — the Poro stays in the trash (nothing left to replace)", async () => {
    const game = await poroDiesInCombat();
    await game.p1.reveal("zh");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("zh")).toMatchObject({ isHidden: false, zone: "base" });
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("everything resolves: Zhonya's survives in base (it was NOT 'killed instead'), the Poro is still dead, its Deathknell pays out (died alone → P1 draws d1), and P2 conquers bf1", async () => {
    const game = await poroDiesInCombat();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — to actually save the Poro, flip Zhonya's BEFORE the death (with Focus in the showdown): the death is replaced, Poro recalled exhausted to base, no Deathknell draw", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.hand()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("caveat: a lone unit WITHOUT a Deathknell bolted outside combat forms no chain — the Open Cleanup lapses P1's control and trashes the still-hidden Zhonya's before P1 gets any window to flip it", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Plain Poro" }, "plain")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "plain" });
    await game.p2.passPriority();
    // (P1's last chance was HERE, before the death — it passes instead.)
    await game.p1.passPriority(); // Bolt resolves: Plain Poro dies, no trigger, chain empties → Open Cleanup
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.can("reveal", "zh")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
