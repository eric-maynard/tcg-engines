/**
 * Ruling 6fee60e371542e8f — Sprite Call (OGN-094 → ogn-094-298) · [Hidden][Action] · "Play a ready 3 [Might] Sprite unit
 *   token with [Temporary]."   × Sprite token (OGN-274 → ogn-274-298) · [Temporary]
 *
 * Q: If I react to the ENEMY's Temporary trigger (e.g. by flipping a hidden Sprite Call), do the units die?
 * A: Yes you may react — Temporary is a triggered ability on the chain, so Reactions are legal in response. LIFO: your
 *    reaction resolves first, then the original Temporary trigger resolves and the enemy Sprite still dies. A NEW Temporary
 *    unit you make in response survives: the Temporary check happened once at the start of that Beginning Phase, so it
 *    is only killed at ITS controller's next Beginning Phase.
 * Rules: 816 (Temporary = triggered kill at start of Beginning Phase), 811 (Hidden → Reaction for [0]), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const SPRITE_CALL = "ogn-094-298";

/**
 * End of P1's turn 3. P2 controls bf1 with ONLY a Sprite there. P1 controls bf2 with a Holder and has Sprite Call
 * facedown at bf2 (hidden on an earlier turn).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", SPRITE, "p2sprite")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf2", SPRITE_CALL, "call");
}

async function intoP2Beginning(game: Game): Promise<void> {
  await game.p1.endTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.acceptTriggerOrder();
}

function p1Sprites(game: Game): string[] {
  return game.findAll({ name: "Sprite", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");
}

/** Pass priority around until P1 holds it (bounded). */
async function priorityToP1(game: Game): Promise<void> {
  for (let i = 0; i < 4 && game.decision()?.seat !== P1; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling 6fee60e371542e8f — reacting to an enemy Temporary trigger: legal, and the enemy unit still dies", () => {
  test("at the start of P2's Beginning Phase the enemy Sprite's Temporary trigger is ON THE CHAIN (closed state) and P1 gets a Reaction window", async () => {
    const game = await board().build();
    await intoP2Beginning(game);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "p2sprite", controller: P2, triggered: true })]);
    expect(game.zoneOf("p2sprite")).toBe("battlefield-bf1");
    await priorityToP1(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "call")).toBe(true);
  });

  test("P1 flips Sprite Call in response: it sits on top and resolves FIRST (P1 gets a ready Sprite) while the enemy Sprite is still alive; then the Temporary trigger resolves and the enemy Sprite dies", async () => {
    const game = await board().build();
    await intoP2Beginning(game);
    await priorityToP1(game);
    await game.p1.reveal("call");
    expect(game.chain().map((c) => c.cardId)).toEqual(["p2sprite", "call"]);
    // Resolve Sprite Call only.
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "call"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.some((o) => o.key === "battlefield-bf2") ? "battlefield-bf2" : (d.options[0]?.key as string));
      } else {
        await game.acting().passPriority();
      }
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      const d = game.decision() as Extract<ReturnType<Game["decision"]>, { kind: "pick" }>;
      await game.p1.pick(d.options.some((o) => o.key === "battlefield-bf2") ? "battlefield-bf2" : (d.options[0]?.key as string));
    }
    expect(game.zoneOf("call")).toBe("trash");
    const mine = p1Sprites(game);
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0] as string)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3 });
    // Enemy Sprite not dead yet — its trigger is still pending.
    expect(game.zoneOf("p2sprite")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["p2sprite"]);
    // Now let the Temporary trigger resolve.
    await game.settle();
    expect(game.zoneOf("p2sprite")).toBe("gone");
    expect(game.p2.units("bf1")).toEqual([]);
    // P1's new Sprite survived P2's Beginning Phase.
    expect(p1Sprites(game)).toHaveLength(1);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("the Sprite made in response survives P2's whole turn and is only killed at the start of P1's (its controller's) next Beginning Phase", async () => {
    const game = await board().build();
    await intoP2Beginning(game);
    await priorityToP1(game);
    await game.p1.reveal("call");
    game.script(P1, [(d) => (d.kind === "pick" ? (d.options.some((o) => o.key === "battlefield-bf2") ? "battlefield-bf2" : d.options[0]?.key) : undefined)]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    const [mine] = p1Sprites(game);
    expect(mine).toBeDefined();
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase kills P1's Sprite, settles into P1's main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf(mine as string)).toBe("gone");
    expect(p1Sprites(game)).toEqual([]);
  });
});
