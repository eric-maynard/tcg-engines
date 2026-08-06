/**
 * Ruling 6bfd713032d974b1 — Fallen Feline (VEN-132 → ven-132-166) · Unit · Order · 2+[order] · 3 Might
 *   "When you play me, name a spell. While I'm at a battlefield, opponents can't play spells with that name."
 *   × Stupefy (ogn-095-298) "[Reaction] Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *   × Resonating Strike (ven-034-166) "[Reaction] Choose a battlefield you control and a unit you control at
 *     a different location. Move it there …" — used to get Feline to a battlefield at Reaction speed.
 *
 * Q: Does Fallen Feline stop a named spell that is already on the chain?
 * A: No. It forbids opponents from PLAYING further spells with that name while it is at a battlefield;
 *    a spell already placed on the chain (pending or finalized) has already been played and still
 *    finalizes/resolves normally.
 * Rules: 419.1 (play = put on the chain), 329.1 / 354.2 / 329.3 (pending vs finalized chain items).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FALLEN_FELINE = "ven-132-166";
const STUPEFY = "ogn-095-298";
const RESONATING_STRIKE = "ven-034-166";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1 controls bf1 (3-might Guard there). P1 holds Feline, Resonating Strike and two Stupefy
 * (cheap chain-openers so P2 gets reaction windows on P1's turn). P2 holds two Stupefy with [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 1, rainbow: 1, calm: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, FALLEN_FELINE, "feline")
    .hand(P1, RESONATING_STRIKE, "strike")
    .hand(P1, STUPEFY, "opener1")
    .hand(P1, STUPEFY, "opener2")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, STUPEFY, "stupefy2");
}

/** P1 plays Feline to base and names "Stupefy" (asserting the Name prompt is P1's). */
async function felineNamesStupefy(game: Game): Promise<void> {
  await game.p1.play("feline", { to: "base" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "feline", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  await game.p1.name("Stupefy");
  await game.settle();
  expect(game.zoneOf("feline")).toBe("base");
}

/**
 * P1 opens a chain (opener1 on Guard); P2 responds with Stupefy on Guard; P1 responds with Resonating
 * Strike moving Feline base → bf1. LIFO: Strike resolves first, so Feline is AT bf1 while P2's Stupefy
 * is still on the chain.
 */
async function stupefyThenFelineArrives(game: Game): Promise<void> {
  await game.p1.cast("opener1", { targets: "guard" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "stupefy")).toBe(true); // Feline is in base: no restriction yet
  await game.p2.cast("stupefy", { targets: "guard" });
  await game.p2.passPriority();
  await game.p1.cast("strike", { targets: "feline" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["opener1", "stupefy", "strike"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Resonating Strike resolves
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("bf1"); // destination, if asked
  }
  expect(game.zoneOf("feline")).toBe("battlefield-bf1");
  expect(game.chain().map((c) => c.cardId)).toEqual(["opener1", "stupefy"]);
}

describe("Ruling 6bfd713032d974b1 — Fallen Feline does not stop a named spell already on the chain", () => {
  test("'When you play me, name a spell': playing Feline surfaces a Name decision for P1 and records the name", async () => {
    const game = await board().build();
    await game.p1.play("feline", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 5, power: { order: 0, rainbow: 1, calm: 1 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "name", seat: P1 });
    expect(d?.kind === "name" ? d.vocabulary : []).toContain("Stupefy");
    await game.p1.name("Stupefy");
    await game.settle();
    expect(game.state("feline").meta.namedCard).toBe("Stupefy");
    expect(game.zoneOf("feline")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test("P2's Stupefy is put on the chain while Feline is only in base; Feline then arrives at bf1 (via Resonating Strike) with Stupefy still pending below it", async () => {
    const game = await board().build();
    await felineNamesStupefy(game);
    await stupefyThenFelineArrives(game);
    expect(game.state("feline").might).toBe(5); // Strike's +2 this turn — it really resolved
    expect(game.chain().find((c) => c.cardId === "stupefy")).toMatchObject({ controller: P2, countered: false });
  });

  test("the already-played Stupefy still RESOLVES with Feline (naming Stupefy) now at a battlefield: Guard shrinks, P2 draws 1, Stupefy → trash (419.1, 329)", async () => {
    const game = await board().build();
    await felineNamesStupefy(game);
    const p2HandAfterCast = game.p2.hand().length - 1;
    const p2Deck = game.p2.deck().length;
    await stupefyThenFelineArrives(game);
    await game.settle(); // Stupefy, then opener1 resolve
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2HandAfterCast + 1); // Stupefy's "Draw 1" happened
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.state("guard").might).toBe(1); // 3, -1 (P2's Stupefy), -1 (opener1), min 1
    expect(game.zoneOf("feline")).toBe("battlefield-bf1");
  });

  // Expected: once Feline (named "Stupefy") is at bf1, P2 can no longer PLAY a Stupefy — in the next
  // reaction window `cast stupefy2` is not legal and is rejected. Actual: Feline's static "opponents can't
  // play spells with that name" is unimplemented (parsed as raw text) — P2 may still cast Stupefy.
  test.failing("BUG: ruling 6bfd713032d974b1 — contrast: with Feline at a battlefield, P2 cannot play a FURTHER Stupefy (engine still allows it)", async () => {
    const game = await board().build();
    await felineNamesStupefy(game);
    await stupefyThenFelineArrives(game);
    await game.settle();
    expect(game.zoneOf("feline")).toBe("battlefield-bf1");
    // Open a new chain so P2 gets a reaction window.
    await game.p1.cast("opener2", { targets: "guard" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.energy()).toBe(1); // could afford it
    expect(game.p2.can("cast", "stupefy2")).toBe(false);
    const r = await game.p2.try((p) => p.cast("stupefy2", { targets: "guard" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("stupefy2")).toBe("hand");
  });

  test("contrast: P1's own Stupefy is never restricted by P1's Feline (only opponents are)", async () => {
    const game = await board().build();
    await felineNamesStupefy(game);
    await stupefyThenFelineArrives(game);
    await game.settle();
    expect(game.p1.can("cast", "opener2")).toBe(true);
    await game.p1.cast("opener2", { targets: "feline" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["opener2"]);
  });
});
