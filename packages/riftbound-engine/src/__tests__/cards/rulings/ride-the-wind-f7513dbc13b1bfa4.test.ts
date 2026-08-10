/**
 * Ruling f7513dbc13b1bfa4 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · 2+[chaos] "Move a friendly unit and ready it."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Arcane Shift (SFD-200 → sfd-200-221) · [Action] · 3+[rainbow] "Banish a friendly unit, then its owner plays it, ignoring
 *     its cost. Deal 3 to an enemy unit at a battlefield. Banish this."   (× Vex — the unit the asker hoped to play instead)
 *
 * Q: I move a unit to a battlefield; the enemy Ride-the-Winds Irelia, Fervent into it. Can I then Arcane Shift to deal 3 to
 *    Irelia, banish a unit and play VEX to that battlefield?
 * A: No to the Vex part: Arcane Shift banishes a friendly unit and replays THAT SAME unit. Also Irelia has [Deflect] — pay an
 *    extra [A] to choose her for the 3. Timing: Arcane Shift is [Action], so it can't answer Ride the Wind on the chain; once
 *    Ride the Wind resolves and the state is Open again you regain Focus + Priority and may cast it (a new chain); the
 *    banished unit may be replayed to the contested battlefield you're fighting at (← this last point conflicts with
 *    CR 355.2.a; see the RULING-CONFLICT note in the last test).
 * Rules: 340.1 / 355.2.a (Action needs Focus+Priority in an Open showdown state), 346 (Focus passes when the chain empties),
 *        809 (Deflect surcharge), 419 / 124 (replayed card = the banished one), 355.2.a (valid play locations).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const IRELIA = "sfd-057-221";
const ARCANE_SHIFT = "sfd-200-221";
const VEX = "sfd-146-221"; // Vex, Cheerless

/**
 * P1's turn. bf1 empty & uncontrolled. P1: ready 2-Might Scout in base, Arcane Shift + Vex in hand, [3] + 2 rainbow (Shift's
 * pip + Irelia's Deflect). P2: exhausted Irelia, Fervent in base, Ride the Wind + [2][chaos].
 */
function board(rainbow = 2) {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", IRELIA, "irelia", { exhausted: true })
    .hand(P1, ARCANE_SHIFT, "shift")
    .hand(P1, VEX, "vex")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** Scout → bf1 (showdown opens, P1 Focus); P1 passes Focus; P2 Ride-the-Winds Irelia into bf1 (spell now on the chain). */
async function ireliaRidesIn(game: Game): Promise<void> {
  await game.p1.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "rtw")).toBe(true);
  await game.p2.cast("rtw", { targets: "irelia", answers: ["bf1"] });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2 && d.semantics === "destination") {
    await game.p2.pick("bf1");
  }
  expect(game.chain().some((c) => c.cardId === "rtw")).toBe(true);
}

/** Pass priority around until the chain is empty (Ride the Wind + Irelia's own +1 triggers). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling f7513dbc13b1bfa4 — Arcane Shift after an enemy Ride the Wind: wait for the Open state, pay Deflect, and replay the SAME unit", () => {
  test("while Ride the Wind is on the chain P1 does get priority — but Arcane Shift ([Action]) is NOT playable in response", async () => {
    const game = await board().build();
    await ireliaRidesIn(game);
    // Walk priority to P1 without resolving: whenever it is P1's priority, Shift must be illegal.
    let sawP1Priority = false;
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "order") {
        await game.acceptTriggerOrder();
        continue;
      }
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      if (d.seat === P1) {
        sawP1Priority = true;
        expect(game.p1.can("cast", "shift")).toBe(false);
      }
      await game.seat(d.seat).passPriority();
    }
    expect(sawP1Priority).toBe(true);
  });

  test("Ride the Wind resolves: Irelia arrives READY at bf1 as the defender (Scout attacks); the chain is empty, the state is Open and P1 has regained Focus + Priority — NOW Arcane Shift is castable (a new chain)", async () => {
    const game = await board().build();
    await ireliaRidesIn(game);
    await drainChain(game);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ combatRole: "defender", isReady: true, location: "bf1" });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "shift")).toBe(true);
  });

  test("[Deflect]: choosing Irelia for the 3 damage costs an extra [A] — with only Shift's own 3+[rainbow] the (Scout, Irelia) cast is unaffordable; with a second rainbow it goes through and everything is spent", async () => {
    const poor = await board(1).build();
    await ireliaRidesIn(poor);
    await drainChain(poor);
    expect((await poor.p1.try((p) => p.cast("shift", { targets: ["scout", "irelia"] }))).ok).toBe(false);
    expect(poor.zoneOf("shift")).toBe("hand");

    const game = await board(2).build();
    await ireliaRidesIn(game);
    await drainChain(game);
    await game.p1.cast("shift", { targets: ["scout", "irelia"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 3 + pip + Deflect
    expect(game.chain().map((c) => c.cardId)).toEqual(["shift"]);
  });

  test("resolution: the Scout is banished and ITS OWNER replays IT — Vex is never an option and stays in hand; Irelia takes 3; Arcane Shift banishes itself", async () => {
    const game = await board(2).build();
    await ireliaRidesIn(game);
    await drainChain(game);
    await game.p1.cast("shift", { targets: ["scout", "irelia"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    // The replay: any pick offered concerns the Scout (or its destination) only — never Vex.
    const destinationsOffered: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      const cards = d.options.map((o) => o.card).filter(Boolean);
      expect(cards).not.toContain("vex");
      const keys = d.options.map((o) => o.key);
      if (d.semantics === "destination") {
        destinationsOffered.push(...keys);
        await game.p1.pick(keys.includes("base") ? "base" : (keys[0] as string));
      } else if (cards.includes("scout")) {
        await game.p1.pick("scout");
      } else {
        await game.p1.pick(keys[0] as string);
      }
    }
    await drainChain(game);
    // RULING-CONFLICT: riftjudge f7513dbc13b1bfa4 says the banished unit "can be played back to the contested battlefield
    // since you are now in combat there"; CR 355.2.a (valid play locations = your base or a battlefield you CONTROL) plus
    // the 190.4/323.6 control model (during a showdown at an UNCONTROLLED battlefield nobody controls it ⇒ no "battlefield
    // you control" plays there) say the Scout's only legal location is P1's base — engine follows CR: no bf1 offered.
    expect(destinationsOffered).not.toContain("battlefield-bf1");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout").damage).toBe(0); // a fresh object
    expect(game.zoneOf("vex")).toBe("hand");
    expect(game.state("irelia")).toMatchObject({ damage: 3, location: "bf1" });
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
