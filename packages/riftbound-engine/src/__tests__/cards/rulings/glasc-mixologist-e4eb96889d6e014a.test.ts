/**
 * Ruling e4eb96889d6e014a — Glasc Mixologist (SFD-165 → sfd-165-221, 5 Might, Order)
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash,
 *    ignoring its cost."
 *   Same-event deaths produced with Flurry of Blades (ogn-133-298, "Deal 1 to all units at battlefields" → one
 *   cleanup) and The Ruination (unl-180-219, "Kill all units." → one kill instruction). The cheap unit is a
 *   vanilla Shipyard Skulker (ogn-175-298, cost 3, no power).
 *
 * Q: Can Glasc's Deathknell target a unit that died from the same event?
 * A: Yes. The Deathknell becomes pending before units move to the trash, but its choice is made only when it
 *    is finalized — by then every unit that died in that cleanup (323.4 → 323.5) or from that single kill
 *    instruction (simultaneous, 370.1.a.2) is already in the trash, so it is a legal pick.
 * Rules: 808.1.d.2, 323.4, 323.5, 370.1.a.2, 428.1.a.1.b, 334.2, 355.8.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const SKULKER = "ogn-175-298";
const FLURRY = "ogn-133-298";
const RUINATION = "unl-180-219";

/** Same cleanup: both P1 units at bf1 are one damage from death; P1 holds Flurry of Blades (1 energy). */
function cleanupBoard() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GLASC, "glasc", { damage: 4 })
    .unit(P1, "bf1", SKULKER, "skulker", { damage: 2 })
    .hand(P1, FLURRY, "flurry");
}

/** One kill instruction: The Ruination (9 + 3 order) with Glasc, Skulker and an enemy unit in bases. */
function ruinationBoard() {
  return scenario()
    .resources(P1, { energy: 9, power: { order: 3 } })
    .unit(P1, "base", GLASC, "glasc")
    .unit(P1, "base", SKULKER, "skulker")
    .unit(P2, "base", { might: 4, name: "Enemy Bystander" }, "foe")
    .hand(P1, RUINATION, "ruin");
}

/** Cast the board's spell and pass twice so it resolves (deaths + Deathknell pending). */
async function resolveSpell(game: Game, alias: string): Promise<void> {
  await game.p1.cast(alias);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** From "Glasc's trigger is on the chain": let it resolve and take Skulker when offered. */
async function resolveDeathknellChoosingSkulker(game: Game): Promise<void> {
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
  // Either the choice is asked at finalization (now) or — engine convention — on resolution after passes.
  if (game.decision()?.kind !== "pick") {
    await game.p1.passPriority();
    await game.p2.passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
  expect(offered).toContain("skulker"); // died in the same event, already in the trash → legal
  expect(offered).not.toContain("glasc"); // cost 5 > 3
  expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(true); // "You may"
  await game.p1.pick("skulker");
  // Played ignoring cost: pick a location if asked, then it is on the board and nothing was paid.
  const dest = game.decision();
  if (dest?.kind === "pick" && dest.seat === P1) {
    await game.p1.pick(dest.options.some((o) => o.key === "base") ? "base" : (dest.options[0]?.key as string));
  }
  await game.settle();
  expect(game.locationOf("skulker")).toBeDefined();
  expect(game.p1.units()).toContain("skulker");
}

describe("Ruling e4eb96889d6e014a — Glasc Mixologist's Deathknell may pick a unit that died in the same event", () => {
  // ── same cleanup (damage) ────────────────────────────────────────────────────────────────

  test("same cleanup: Flurry's 1 damage is lethal to both; Glasc's Deathknell is pending on the chain and BOTH units are already in the trash before it resolves (323.4 → 323.5, 808.1.d.2)", async () => {
    const game = await cleanupBoard().build();
    await resolveSpell(game, "flurry");
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
    // Nothing has been played back yet.
    expect(game.p1.units()).toEqual([]);
  });

  // Expected: when the pending Deathknell is finalized/resolved P1 may choose Skulker (cost 3, no power) from the
  // trash — it died in the same cleanup — and play it ignoring its cost; it returns to the board with P1 at 0 energy.
  // Actual: the trigger reaches the chain but resolves as a no-op — no prompt, Skulker stays in the trash.
  test.failing("BUG: ruling e4eb96889d6e014a — same cleanup: the Deathknell offers Skulker from the trash and plays it free (engine: Glasc's play-from-trash resolves as a no-op)", async () => {
    const game = await cleanupBoard().build();
    await resolveSpell(game, "flurry");
    expect(game.zoneOf("skulker")).toBe("trash");
    await resolveDeathknellChoosingSkulker(game);
    expect(game.p1.energy()).toBe(0); // Flurry took the only energy; Skulker was free
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  // ── one kill instruction (simultaneous deaths) ───────────────────────────────────────────

  test("one kill instruction: The Ruination kills everything simultaneously; Glasc's Deathknell is pending and Skulker is already in the trash (370.1.a.2, 428.1.a.1.b)", async () => {
    const game = await ruinationBoard().build();
    await resolveSpell(game, "ruin");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
  });

  // Expected: as above — Skulker (killed by the same instruction) is a legal pick and comes back free; the enemy
  // bystander is not offered (not in YOUR trash). Actual: no prompt; the trigger resolves doing nothing.
  test.failing("BUG: ruling e4eb96889d6e014a — one kill instruction: the Deathknell offers Skulker (not the enemy unit) and plays it free (engine: no-op)", async () => {
    const game = await ruinationBoard().build();
    await resolveSpell(game, "ruin");
    if (game.decision()?.kind !== "pick") {
      await game.p1.passPriority();
      await game.p2.passPriority();
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("skulker");
    expect(offered).not.toContain("foe"); // "from YOUR trash"
    await game.p1.pick("skulker");
    const dest = game.decision();
    if (dest?.kind === "pick" && dest.seat === P1) {
      await game.p1.pick(dest.options.some((o) => o.key === "base") ? "base" : (dest.options[0]?.key as string));
    }
    await game.settle();
    expect(game.p1.units()).toContain("skulker");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("foe")).toBe("trash");
  });

  // Control for the "You may": with nothing eligible in the trash the trigger still goes on the chain and simply
  // resolves; the game returns to P1's open main phase.
  test("control: Glasc dying with no eligible unit in the trash — trigger resolves harmlessly, back to P1's main phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GLASC, "glasc", { damage: 4 })
      .hand(P1, FLURRY, "flurry")
      .build();
    await resolveSpell(game, "flurry");
    expect(game.zoneOf("glasc")).toBe("trash");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
    expect(game.violations()).toEqual([]);
  });
});
