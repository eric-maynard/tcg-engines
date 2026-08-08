/**
 * Akshan, Mischievous — sfd-109-221 · Unit · Body · 4 energy · Might 4
 *
 *   [Weaponmaster]
 *   You may pay [body][body] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, move an enemy gear to
 *   your base. You control it until I leave the board. If it's an Equipment,
 *   attach it to me.
 *
 * Rule 356.1.b.3 / 560: a card played by an effect "ignoring its cost" may
 * still have its optional additional cost paid; rule 419.4.a: it is still
 * "played", so its play-self trigger fires.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-109-221";
const AURORA = "ogn-160-298";

async function auroraRevealsAkshan() {
  const game = await scenario()
    .rune(P1, "body", { alias: "r1" })
    .rune(P1, "body", { alias: "r2" })
    .gear(P1, AURORA, "myAurora")
    .gear(P2, AURORA, "theirAurora")
    .deckTop(P1, CARD, "akshan")
    .build();
  await game.p1.endTurn();
  // Aurora's end-of-turn trigger is on the chain; float [body][body] in response.
  await game.p1.recycleRune("r1");
  await game.p1.recycleRune("r2");
  expect(game.p1.power("body")).toBe(2);
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  expect(game.zoneOf("akshan")).toBe("banishment");
  return game;
}

describe("Akshan, Mischievous (sfd-109-221) — played by Dazzling Aurora", () => {
  test("the pending play offers the optional [body][body] cost; paying it fires the play trigger and steals an enemy gear", async () => {
    const game = await auroraRevealsAkshan();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = (d as { options: { key: string }[] }).options.map((o) => o.key);
    expect(keys).toEqual(["base", "base+pay"]);
    await game.p1.pick("base+pay");
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.power("body")).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["akshan"]);
    await game.settle();
    expect(game.state("theirAurora").controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("declining the additional cost plays Akshan without stealing", async () => {
    const game = await auroraRevealsAkshan();
    await game.p1.pick("base");
    expect(game.zoneOf("akshan")).toBe("base");
    // Declining spends nothing, but answering the prompt closes the Ending Step:
    // the turn rotates and rule 517.2.c / 316.3 empty the unspent [body][body].
    expect(game.p1.power("body")).toBe(0);
    await game.settle();
    expect(game.state("theirAurora").controller).toBe(P2);
  });
});

const SHIELD = "sfd-033-221"; // Doran's Shield — Equipment, +1 Might
const COMBAT_CHEF = "sfd-092-221"; // vanilla [Weaponmaster] unit

/** P1 plays Akshan paying [body][body] and steals P2's unattached Doran's Shield. */
async function stealShield() {
  const game = await scenario()
    .resources(P1, { energy: 10, power: { body: 2 } })
    .gear(P2, SHIELD, "shield")
    .hand(P1, CARD, "akshan")
    .hand(P1, COMBAT_CHEF, "chef")
    .build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("shield");
    await game.settle();
  }
  expect(game.state("shield").controller).toBe(P1);
  return game;
}

describe("Akshan, Mischievous (sfd-109-221) — 'If it's an Equipment, attach it to me'", () => {
  test("the stolen Equipment attaches to Akshan and its Might bonus applies (rule 434)", async () => {
    const game = await stealShield();
    expect(game.state("shield")).toMatchObject({ attachedTo: "akshan", controller: P1, owner: P2 });
    expect(game.state("akshan").attachments).toEqual(["shield"]);
    expect(game.state("akshan").might).toBe(5); // 4 printed + 1 from Doran's Shield
    expect(game.violations()).toEqual([]);
  });

  test("a Weaponmaster played later offers the Equipment P1 controls but does not own (rule 821.1.b)", async () => {
    const game = await stealShield();
    await game.p1.play("chef", { to: "base" });
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect((d as { options: { key: string }[] }).options.map((o) => o.key)).toContain("shield");
  });
});
