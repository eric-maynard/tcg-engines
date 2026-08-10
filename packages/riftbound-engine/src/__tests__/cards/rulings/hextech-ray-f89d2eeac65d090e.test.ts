/**
 * Ruling f89d2eeac65d090e — Hextech Ray (OGN-009 → ogn-009-298) · Action · Fury · [1][fury] · "Deal 3 to a unit at a battlefield."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · "[Deflect]"
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might · "[Assault 2] When you kill a unit with a spell, you may pay [1][fury]
 *     to play me from your trash."
 *
 * Q: Hextech Ray kills a Pouty Poro — does that trigger my Immortal Phoenix (in the trash)?
 * A: Yes. The Poro dies to damage whose source is the spell, so the spell — i.e. you, with a spell — killed it; it is not
 *    treated as an anonymous state-based death. The Phoenix triggers and you may pay [1][fury] to play it from the trash.
 * Rules: 143.2.a / 437 (lethal damage kills; the damage's source is the spell), 383.2.c.1 (Immortal Phoenix example), 415.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const POUTY_PORO = "ogn-013-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * P1's turn. P2 holds bf1 with a Pouty Poro (Deflect) and a Holder. Immortal Phoenix is in P1's trash; Hextech Ray in hand.
 * P1: [1][fury] for the Ray + [rainbow] for Deflect + [1][fury] for the Phoenix.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Ray the Poro and let the spell resolve; stop at whatever comes next. */
async function rayThePoro(game: Game): Promise<void> {
  expect(game.p1.can("cast", "ray")).toBe(true);
  await game.p1.cast("ray", { targets: "poro" });
  expect(game.p1.energy()).toBe(1); // [1][fury] paid + one power for Deflect
  expect(game.p1.power("fury") + game.p1.power("rainbow")).toBe(1);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ray")).toBe("trash");
}

describe("Ruling f89d2eeac65d090e — a Poro killed by Hextech Ray's damage was killed 'with a spell': Immortal Phoenix triggers", () => {
  test("the Ray's 3 damage kills the 2-Might Poro and, with the spell fully resolved, P1's Phoenix in the trash asks 'pay [1][fury] to play me?'", async () => {
    const game = await board().build();
    await rayThePoro(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
    expect(game.zoneOf("phoenix")).toBe("trash"); // asked from the trash
  });

  test("YES: [1][fury] is paid and, once the trigger resolves, the Phoenix is played from the trash onto P1's board", async () => {
    const game = await board().build();
    await rayThePoro(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        const base = d.options.find((o) => o.key === "base" || /base/i.test(o.label));
        await game.p1.pick(base ? base.key : (d.options[0]?.key as string));
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.p1.units()).toContain("phoenix");
    expect(game.p1.trash()).toEqual(["ray"]);
    expect(game.state("phoenix")).toMatchObject({ controller: P1, damage: 0, might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: Ray on the 2-Might Holder (no Deflect) kills it just the same and the Phoenix triggers too — the kill credit comes from the spell being the damage source, nothing Poro-specific", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "holder" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
  });

  test("contrast: Ray that does NOT kill (a 4-Might unit survives with 3 damage) triggers nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
      .trash(P1, IMMORTAL_PHOENIX, "phoenix")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });
});
