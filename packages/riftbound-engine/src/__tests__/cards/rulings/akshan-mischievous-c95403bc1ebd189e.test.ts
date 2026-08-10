/**
 * Ruling c95403bc1ebd189e — Akshan, Mischievous (SFD-109 → sfd-109-221) · Unit · [4] (+ optional [body][body]) · 4 Might
 *   "[Weaponmaster] … When you play me, if you paid the additional cost, move an enemy gear to your base. You control
 *    it until I leave the board. If it's an Equipment, attach it to me."
 *   × Shady Spectacles (VEN-137 → ven-137-166) · Gear/Equipment · [Equip] [1][order]
 *   "As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of that unit for
 *    as long as this is attached to it."
 *   (+ Ruined Rex unl-067-219, 6 Might, "[Deathknell] — Deal 4 to an enemy unit." as the Deathknell wearer.)
 *
 * Q: (Given that a stolen Spectacles goes back to the opponent when Akshan leaves —) what happens when a unit WITH
 *    Deathknell wearing Shady Spectacles copies a unit WITHOUT Deathknell and then dies?
 * A: The Deathknell does not trigger: becoming a copy replaces name/Might/rules text/keywords, so the Deathknell is
 *    simply not there when it dies. And yes — when Akshan dies the control change ends, the Spectacles detach and
 *    revert to their owner, ending up in the owner's base.
 * Rules: 472.1.b.3 (copyable traits), 808.3 (Deathknell is a characteristic), 435 (detach), 452.1 (loose gear recalled).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const SHADY_SPECTACLES = "ven-137-166";
const RUINED_REX = "unl-067-219";
/** A free "kill a unit" Action so the deaths are caused by a spell, deterministically. */
const DOOM = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Doom",
  timing: "action",
} as const;

/** Pass priorities / take a copy-target pick naming `prefer` until the chain is empty. */
async function drainChain(game: Game, prefer: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options.find((o) => (o.card ?? o.key) === prefer)?.key ?? d.options[0]!.key);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling c95403bc1ebd189e — Shady Spectacles: a copied-over Deathknell doesn't trigger; stolen Spectacles revert when Akshan dies", () => {
  test("Akshan (paid [body][body]) steals P2's Shady Spectacles, wears them and becomes a copy of P1's Vanilla; when Akshan is killed the Spectacles detach and revert to P2 — unattached in P2's base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 2 } })
      .battlefield("bf1")
      .unit(P1, "base", { might: 2, name: "Vanilla" }, "van")
      .unit(P2, "base", { might: 7, name: "Big" }, "big")
      .gear(P2, SHADY_SPECTACLES, "shady")
      .hand(P1, AKSHAN, "akshan")
      .hand(P1, DOOM, "doom")
      .build();
    await game.p1.play("akshan", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await drainChain(game, "shady");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("van"); // "choose another friendly unit" to copy
    }
    expect(game.state("shady")).toMatchObject({ attachedTo: "akshan", controller: P1, owner: P2 });
    expect(game.state("akshan")).toMatchObject({ attachments: ["shady"], might: 2, name: "Vanilla" }); // a copy of Vanilla
    // Akshan dies.
    await game.p1.cast("doom", { targets: "akshan" });
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("trash");
    expect(game.state("shady")).toMatchObject({ controller: P2, owner: P2, zone: "base" });
    expect(game.state("shady").attachedTo).toBeUndefined();
    expect(game.p2.gear()).toContain("shady");
    expect(game.p1.gear()).not.toContain("shady");
  });

  test("a Deathknell unit (Ruined Rex) wearing Shady Spectacles as a copy of Vanilla has no Deathknell: when it dies nothing triggers — no chain item, no P1 prompt, the enemy takes no damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } }) // [Equip] [1][order]
      .battlefield("bf1")
      .unit(P1, "base", RUINED_REX, "rex")
      .unit(P1, "base", { might: 2, name: "Vanilla" }, "van")
      .unit(P2, "base", { might: 7, name: "Big" }, "big")
      .gear(P1, SHADY_SPECTACLES, "shady")
      .hand(P1, DOOM, "doom")
      .build();
    expect(game.state("rex").keywords).toContain("Deathknell");
    await game.p1.choose("equipCard", { params: { equipmentId: "shady", unitId: "rex" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await drainChain(game, "van");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("van");
    }
    expect(game.state("shady").attachedTo).toBe("rex");
    expect(game.state("rex")).toMatchObject({ might: 2, name: "Vanilla" });
    expect(game.state("rex").keywords).not.toContain("Deathknell"); // overwritten by the copy
    await game.p1.cast("doom", { targets: "rex" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Doom resolves: Rex dies
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.chain()).toEqual([]); // no Deathknell item
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no target prompt either
    expect(game.state("big").damage).toBe(0);
    expect(game.state("shady")).toMatchObject({ controller: P1, zone: "base" });
    expect(game.state("shady").attachedTo).toBeUndefined();
  });

  test("contrast — the same Ruined Rex WITHOUT the Spectacles: its Deathknell triggers on death and deals 4 to the enemy Big", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "base", RUINED_REX, "rex")
      .unit(P1, "base", { might: 2, name: "Vanilla" }, "van")
      .unit(P2, "base", { might: 7, name: "Big" }, "big")
      .hand(P1, DOOM, "doom")
      .build();
    await game.p1.cast("doom", { targets: "rex" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("rex")).toBe("trash");
    await drainChain(game, "big"); // Deathknell: aim at Big (the only enemy unit) and let it resolve
    expect(game.state("big").damage).toBe(4);
  });
});
