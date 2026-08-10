/**
 * Ruling 2cf8a91e66963bf4 — Janna, Savior (SFD-053 → sfd-053-221) · Champion Unit · Calm · 3+[calm] · 3 Might
 *     "[Reaction] … When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   × Nine-Tailed Fox (Ahri legend, ogn-255-298) "When an enemy unit attacks a battlefield you control, give it
 *     -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · [2][chaos] · Action — "Move a friendly unit and ready it."
 *
 * Q: An enemy unit attacks Ahri's battlefield, takes -1 from the Fox, is bounced to base by Janna and then re-enters
 *    the SAME combat via Ride the Wind. Does the Fox trigger again (-2 total)?
 * A: No. Attack triggers are fulfilled once per combat per unit even if the unit leaves and re-enters; the unit
 *    re-gains Attacker but stays at -1 total. (If that combat ENDED and a new combat began at that battlefield later
 *    in the turn, the Fox would trigger again.)
 * Rules: 383.4.e / 383.4.e.2.a (attack triggers once per combat), 464.2.c.3.a (arriving mid-combat gains the
 *        designation), 347 (showdown continues until all pass on an empty chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JANNA = "sfd-053-221";
const NINE_TAILED_FOX = "ogn-255-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. P2 (legend: Nine-Tailed Fox) holds bf1 with a stunned 2-Might Guard (deals no combat damage). P1's Raider
 * (5 — survives Janna's 3 in combat) is ready in base and P1 holds Ride the Wind ×2 with [2][chaos] ×2 (enough for the
 * contrast case). P2 holds Janna with exactly 3+[calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .legend(P2, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P1, RIDE_THE_WIND, "rtw2")
    .hand(P2, JANNA, "janna");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const foxItems = (game: Game) => game.chain().filter((c) => c.cardId === "fox" && c.triggered);

/** Pass priority on the chain for whoever holds it until the chain is empty (bounded). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
}

/** Raider attacks bf1; the Fox trigger resolves (-1). Stops in the open showdown with P1 holding Focus. */
async function attackAndTakeMinusOne(game: Game): Promise<void> {
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(foxItems(game)).toHaveLength(1);
  expect(foxItems(game)[0]?.controller).toBe(P2);
  await drainChain(game);
  expect(game.chain()).toEqual([]);
  expect(game.state("raider")).toMatchObject({ combatRole: "attacker", might: 4, mightModifier: -1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** P1 passes Focus; P2 flashes Janna into bf1 and uses her play effect to send Raider to its base. */
async function jannaBouncesRaider(game: Game): Promise<void> {
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("play", "janna")).toBe(true);
  await game.p2.play("janna", { to: "bf1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.locationOf("janna")).toBe("bf1");
  // Her "When you play me" is on the chain; both pass → heal, then "move up to one enemy unit from here".
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("raider");
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "raider")?.key ?? "raider");
      break;
    }
    if (d?.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
      continue;
    }
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  await drainChain(game);
  expect(game.zoneOf("raider")).toBe("base");
  expect(game.state("raider").combatRole).not.toBe("attacker");
}

/** With Focus/priority available to P1 in the still-open showdown, Ride the Wind Raider back into bf1. */
async function rideRaiderBackIn(game: Game, spell: "rtw" | "rtw2" = "rtw"): Promise<void> {
  // Get P1 into a position to act: pass for P2 if P2 holds Focus on an empty chain.
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.seat === P1) {
      break;
    }
    if (d?.kind === "action" && d.seat === P2 && d.context === "showdown") {
      await game.p2.passFocus();
      continue;
    }
    if (d?.kind === "action" && d.seat === P2 && d.context === "chain") {
      await game.p2.passPriority();
      continue;
    }
    break;
  }
  expect(game.p1.can("cast", spell)).toBe(true);
  await game.p1.cast(spell, { targets: "raider" });
  for (let i = 0; i < 8 && game.zoneOf(spell) !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? (d.options[0]?.key as string));
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? (d.options[0]?.key as string));
  }
  expect(game.zoneOf(spell)).toBe("trash");
  expect(game.zoneOf("raider")).toBe("battlefield-bf1");
}

describe("Ruling 2cf8a91e66963bf4 — Fox's attack trigger fires once per combat per unit, even across Janna bounce + Ride the Wind", () => {
  test("Raider attacks Ahri's bf1: the Fox trigger (P2's) resolves and Raider is 5 → 4 (-1 this turn)", async () => {
    const game = await board().build();
    await attackAndTakeMinusOne(game);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });

  test("Janna (Reaction, to P2's own bf1) bounces Raider to base: Attacker designation removed, the -1 stays, and the combat showdown is STILL open", async () => {
    const game = await board().build();
    await attackAndTakeMinusOne(game);
    await jannaBouncesRaider(game);
    expect(game.state("raider")).toMatchObject({ location: "base", might: 4, mightModifier: -1 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
  });

  test("Ride the Wind returns Raider to bf1 in the SAME combat: it re-gains Attacker but the Fox does NOT trigger again — no Fox item on the chain, Raider stays at -1 (4 Might), not -2", async () => {
    const game = await board().build();
    await attackAndTakeMinusOne(game);
    await jannaBouncesRaider(game);
    await rideRaiderBackIn(game);
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", isReady: true, location: "bf1" });
    expect(foxItems(game)).toEqual([]);
    await drainChain(game);
    expect(game.state("raider")).toMatchObject({ might: 4, mightModifier: -1 });
    // Through the rest of this combat nothing else touches Raider's Might (it survives Janna's 3).
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.state("raider")).toMatchObject({ might: 4, mightModifier: -1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a NEW combat at bf1 later in the turn: if the first combat ends with Raider in base and Ride the Wind then sends it back in, the Fox triggers again (-2 total → 3 Might)", async () => {
    const game = await board().build();
    await attackAndTakeMinusOne(game);
    await jannaBouncesRaider(game);
    // Nobody acts further: the showdown closes with no attacker present; bf1 stays P2's.
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("raider")).toMatchObject({ location: "base", might: 4, mightModifier: -1 });
    // New attack via Ride the Wind (Action on P1's own turn).
    await rideRaiderBackIn(game, "rtw2");
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(foxItems(game)).toHaveLength(1);
    await drainChain(game);
    expect(game.state("raider")).toMatchObject({ might: 3, mightModifier: -2 });
  });
});
