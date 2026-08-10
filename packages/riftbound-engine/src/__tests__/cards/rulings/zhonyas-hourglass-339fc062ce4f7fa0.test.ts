/**
 * Ruling 339fc062ce4f7fa0 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *
 * Q: A unit (protected by a Hidden Zhonya's) is the target of two Yasuo attack triggers on the chain. The first
 *    resolves and Zhonya's recalls the unit. Does the second trigger still kill it?
 * A: No. After the recall the unit is no longer "here" (at Yasuo's battlefield), so the second trigger's target
 *    is invalid and it does nothing. (Zhonya's is a replacement effect, not a trigger.)
 * Rules: 359.3 (target must still be legal — incl. location — on resolution), 372 (replacement effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const YASUO_REMORSEFUL = "ogn-076-298";

/** P1's turn. P2 holds bf1 with a 4-Might Victim and a Zhonya's hidden there. P1: two Yasuo, Remorseful in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .unit(P1, "base", YASUO_REMORSEFUL, "y1")
    .unit(P1, "base", YASUO_REMORSEFUL, "y2");
}

/** Both Yasuos attack bf1; both attack triggers target Victim; P2 flips the hidden Zhonya's in response. */
async function twoTriggersAndZhonyasRevealed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["y1", "y2"], "bf1");
  // Two simultaneous triggers controlled by P1: P1 is offered their order (383.3.d).
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  if (d?.kind === "order") {
    await game.p1.order(d.items.map((i) => i.key));
  }
  // Only one enemy unit "here": both triggers lock onto Victim.
  for (let i = 0; i < 2 && game.decision()?.kind === "pick"; i++) {
    await game.seat(game.decision()?.seat as string).pick("victim");
  }
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "y1", targets: ["victim"], triggered: true }),
    expect.objectContaining({ cardId: "y2", targets: ["victim"], triggered: true }),
  ]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zh")).toBe(true);
  await game.p2.reveal("zh");
  expect(game.state("zh").isHidden).toBe(false);
  return game;
}

describe("Ruling 339fc062ce4f7fa0 — after Zhonya's recalls the unit, the second Yasuo trigger has no legal target 'here'", () => {
  test("the first (top) Yasuo trigger resolves: 6 damage would kill Victim, Zhonya's is killed instead and Victim is healed, exhausted and recalled to base — the other trigger is still waiting on the chain", async () => {
    const game = await twoTriggersAndZhonyasRevealed();
    // Drain priority until exactly one trigger has resolved.
    for (let i = 0; i < 4 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "y1", targets: ["victim"], triggered: true })]);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("the second Yasuo trigger then resolves against an invalid target: Victim (now in base, no Hourglass left) takes NO damage and survives", async () => {
    const game = await twoTriggersAndZhonyasRevealed();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    // With no defender left, the Yasuos take bf1.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without the Hourglass flip, the first trigger simply kills Victim at bf1", async () => {
    const game = await board().build();
    await game.p1.move(["y1", "y2"], "bf1");
    const d = game.decision();
    if (d?.kind === "order") {
      await game.p1.order(d.items.map((i) => i.key));
    }
    for (let i = 0; i < 2 && game.decision()?.kind === "pick"; i++) {
      await game.seat(game.decision()?.seat as string).pick("victim");
    }
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.units()).toEqual([]); // nobody was recalled to base
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
