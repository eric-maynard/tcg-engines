/**
 * Ruling 767c5b8100635cce — Akshan, Mischievous (SFD-109 → sfd-109-221) · "…move an enemy gear to your base. You control it until
 *   I leave the board. If it's an Equipment, attach it to me."   × Guardian Angel (SFD-051 → sfd-051-221, Equipment +1)
 *   × Grandmaster at Arms (SFD-193 → sfd-193-221, Jax legend) "[Exhaust]: Attach an attached Equipment you control to a unit
 *   you control."
 *
 * Q: Akshan stole the enemy Guardian Angel; I then used the Jax legend to move it onto my Jax unit. Next turn a spell kills
 *    Akshan. Do I give the Guardian Angel back?
 * A: CONTROL of the Guardian Angel returns to the opponent when Akshan leaves the board — but the card does NOT detach: it
 *    stays physically attached to my Jax unit (attached cards may have a different controller than their host, 718.8) until
 *    someone actively moves it or that unit leaves the board.
 * Rules: 455 ("until" control effects end), 718.8 (attached card / host may differ in controller), 434–435 (attach/detach).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const JAX_LEGEND = "sfd-193-221";

/** Inline P2 Action spell: deal 6 to a unit — lethal for the 4-Might Akshan once the GA has moved off him. */
const BIG_BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Big Bolt",
  timing: "action",
} as const;

/**
 * P1's turn 3 (Jax legend). P2's Unit U (3) at P2's bfB wears P2's Guardian Angel. P1: Akshan in hand with 4 + [body][body],
 * and a 3-Might "Jax Unit" in base. P2 holds Big Bolt (paid from a rune next turn).
 */
function board() {
  return scenario()
    .turn(3)
    .legend(P1, JAX_LEGEND, "jax")
    .resources(P1, { energy: 4, power: { body: 2 } })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 3, name: "Unit U" }, "U", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "U" } as Record<string, unknown>, owner: P2, zone: "bfB" })
    .unit(P1, "base", { might: 3, name: "Jax Unit", tags: ["Jax"] }, "jaxunit")
    .hand(P1, AKSHAN, "akshan")
    .hand(P2, BIG_BOLT, "bolt");
}

/** Step 1: Akshan (paid) steals the GA; it attaches to him. */
async function gaStolen(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      break;
    }
    expect(d.seat).toBe(P1);
    await game.p1.pick(d.options.some((o) => (o.card ?? o.key) === "ga") ? "ga" : (d.options[0]?.key as string));
  }
  expect(game.state("ga")).toMatchObject({ attachedTo: "akshan", controller: P1, owner: P2 });
  expect(game.state("akshan")).toMatchObject({ attachments: ["ga"], might: 5 });
  return game;
}

/** Step 2: Jax legend #1 ([Exhaust]) re-attaches the GA from Akshan to the Jax Unit. */
async function jaxMovesGaToJaxUnit(game: Game): Promise<void> {
  const wanted = ["ga", "jaxunit"];
  const hasTargets = game.p1.option("activateAbility:jax#1")?.fields.some((f) => f.arg === "targets");
  await game.p1.activate("jax", 1, hasTargets ? { targets: wanted } : { answers: wanted });
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      break;
    }
    expect(d.seat).toBe(P1);
    const hit = d.options.find((o) => wanted.includes((o.card ?? o.key) as string));
    await game.p1.pick(hit ? hit.key : (d.options[0]?.key as string));
  }
  expect(game.state("jax").isExhausted).toBe(true);
  expect(game.state("ga")).toMatchObject({ attachedTo: "jaxunit", controller: P1, owner: P2 }); // still P1's — Akshan is alive
  expect(game.state("jaxunit")).toMatchObject({ attachments: ["ga"], might: 4 });
  expect(game.state("akshan")).toMatchObject({ attachments: [], might: 4 });
}

/** Step 3: next turn P2 Big-Bolts Akshan (4 Might, no GA on him any more) — he dies. */
async function akshanKilled(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.tapRune(); // pools empty at end of turn — pay Big Bolt's [1] from a rune
  await game.p2.cast("bolt", { targets: "akshan" });
  await game.settle({ policy: "first" });
  expect(game.zoneOf("akshan")).toBe("trash");
  expect(game.p1.trash()).toContain("akshan");
}

describe("Ruling 767c5b8100635cce — stolen GA moved to Jax by the legend: on Akshan's death control reverts but it stays attached", () => {
  test("steps 1–2: Akshan steals the GA (attached to him, P1 controls it); Jax legend moves it onto the Jax Unit — still P1-controlled while Akshan lives", async () => {
    const game = await gaStolen();
    await jaxMovesGaToJaxUnit(game);
    expect(game.zoneOf("akshan")).toBe("base");
  });

  test("step 3: Akshan is killed next turn (the GA is not on him, so nothing saves him) — Akshan to P1's trash, the GA is NOT killed", async () => {
    const game = await gaStolen();
    await jaxMovesGaToJaxUnit(game);
    await akshanKilled(game);
    expect(game.zoneOf("ga")).not.toBe("trash");
    expect(game.p2.trash()).not.toContain("ga");
    expect(game.p1.trash()).not.toContain("ga");
  });

  test("steps 4–5: with Akshan gone, CONTROL of the Guardian Angel returns to P2 — but it remains ATTACHED to P1's Jax Unit (no auto-detach, not recalled to P2's base)", async () => {
    const game = await gaStolen();
    await jaxMovesGaToJaxUnit(game);
    await akshanKilled(game);
    expect(game.state("ga").controller).toBe(P2); // "until I leave the board" has ended
    expect(game.state("ga").owner).toBe(P2);
    expect(game.state("ga").attachedTo).toBe("jaxunit"); // control ≠ physical location
    expect(game.state("jaxunit").attachments).toEqual(["ga"]);
    expect(game.zoneOf("jaxunit")).toBe("base"); // the host never moved — the GA sits where it is, on P1's unit
    expect(game.state("jaxunit").might).toBe(4); // still worn: +1
    expect(game.violations()).toEqual([]);
  });
});
