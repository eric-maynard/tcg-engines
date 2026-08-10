/**
 * Ruling e2063325092b8cae — Reflection token (UNL-T06 → unl-t06) "(I become a copy of something when played. I don't get that
 *     card's play effects.)" — created here by Mirror Image (unl-200-219) "Choose a unit. Play a ready Reflection unit token to
 *     your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Azir, Sovereign (SFD-177 → sfd-177-221) · 4 Might · "When I attack, you may move any number of your token units to this
 *     battlefield."
 *
 * Q: My Reflection copied a (non-token) unit. I attack with Azir — can his trigger move the Reflection?
 * A: Yes (design intent): a Reflection stays a token unit whatever it copies, so it is one of "your token units".
 * Rules: 182.1.d / 186 (tokens), 477 (a copy remains the same object), 383 (attack trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AZIR = "sfd-177-221";
const MIRROR_IMAGE = "unl-200-219";
const SKULKER = "ogn-175-298"; // Shipyard Skulker, a real 3-Might non-token unit for the Reflection to copy

/**
 * P1's turn. P1: Azir + a Shipyard Skulker + a plain (non-token) Squire in base, Mirror Image in hand with [3]+2 rainbow.
 * P2 holds bf1 with a 2-Might Guard.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", AZIR, "azir")
    .unit(P1, "base", SKULKER, "skulker")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Mirror Image my own Skulker → a ready Reflection token in base that is now a 3-Might "Shipyard Skulker". */
async function reflectSkulker(game: Game): Promise<string> {
  await game.p1.cast("mirror", { targets: "skulker" });
  await game.settle();
  const tok = game.p1.units("base").find((u) => game.state(u).isToken);
  expect(tok).toBeDefined();
  return tok as string;
}

/** Walk Azir's "you may move any number of your token units" trigger; report what the pick offered. */
async function resolveAzirTrigger(game: Game, want: string): Promise<{ sawYesNo: boolean; offered: string[] }> {
  let sawYesNo = false;
  let offered: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      sawYesNo = true;
      expect(d.source?.cardId).toBe("azir");
      await game.p1.yes();
      continue;
    }
    if (d.kind === "pick" && d.seat === P1) {
      offered = d.options.map((o) => (o.card ?? o.key) as string);
      const opt = d.options.find((o) => (o.card ?? o.key) === want);
      if (opt) {
        await game.p1.pick(opt.key);
      } else {
        const r = await game.p1.try((p) => p.decline());
        if (!r.ok) {
          break;
        }
      }
      continue;
    }
    break;
  }
  return { offered, sawYesNo };
}

describe("Ruling e2063325092b8cae — Azir, Sovereign may move a Reflection that copied a unit", () => {
  test("premise: the Reflection is a copy of Shipyard Skulker (name, 3 Might) yet still a TOKEN unit controlled by P1", async () => {
    const game = await board().build();
    const tok = await reflectSkulker(game);
    expect(game.state(tok)).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 3, name: "Shipyard Skulker", zone: "base" });
    expect(game.state("skulker").isToken).toBe(false); // the original is not a token
  });

  test("Azir attacks bf1 → his trigger is P1's optional choice; the pick offers the copied Reflection (and not the real Skulker / Squire); choosing it moves the token to bf1", async () => {
    const game = await board().build();
    const tok = await reflectSkulker(game);
    await game.p1.move("azir", "bf1");
    expect(game.state("azir").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, triggered: true })]);
    const { offered } = await resolveAzirTrigger(game, tok);
    expect(offered).toContain(tok);
    expect(offered).not.toContain("skulker");
    expect(offered).not.toContain("squire");
    expect(game.zoneOf(tok)).toBe("battlefield-bf1");
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.state(tok)).toMatchObject({ isToken: true, might: 3, name: "Shipyard Skulker" });
  });

  test("the moved Reflection joins the attack: Azir 4 + copy 3 vs Guard 2 → Guard dies and P1 conquers bf1 with both there", async () => {
    const game = await board().build();
    const tok = await reflectSkulker(game);
    await game.p1.move("azir", "bf1");
    await resolveAzirTrigger(game, tok);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.cardsAt("bf1")).toEqual(expect.arrayContaining(["azir", tok]));
    expect(game.violations()).toEqual([]);
  });
});
