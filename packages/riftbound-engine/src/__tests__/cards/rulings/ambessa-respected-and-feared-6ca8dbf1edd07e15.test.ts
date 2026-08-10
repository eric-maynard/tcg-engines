/**
 * Ruling 6ca8dbf1edd07e15 — Ambessa, Respected and Feared (VEN-136 → ven-136-166 · not yet in the card pool: modelled inline, Empowered) · 5 Might
 *     "[Empowered] I have [Assault 2]. [Empowered] When I attack, kill an enemy unit here with less Might than me."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298, 4 Might) — the defender.
 *   × Switcheroo (SFD-145 → sfd-145-221) "[Hidden] [Action] Swap the Might of two units at the same battlefield this turn."
 *
 * Q: Opponent moves (Empowered) Ambessa into my Nocturne and chooses it for the kill; I flip my hidden Switcheroo in response. Does the kill happen?
 * A: No. The hidden Switcheroo is playable as a Reaction, resolves first and swaps the CURRENT totals (Ambessa 7 with Assault ↔ Nocturne 4). When
 *    Ambessa's trigger resolves it re-checks "less Might than me": Nocturne (7) vs Ambessa (4) fails, the target is illegal, the kill is ignored.
 * Rules: 811.6 (a Hidden card gains Reaction when flipped), 340 (LIFO), 359.3.e.5 (illegal target on resolution → instruction ignored),
 *        433 (Swap Might uses current Might, applied as ± modifiers), 805/Assault (+2 while attacking counts toward current Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const SWITCHEROO = "sfd-145-221";

/** Ambessa, Respected and Feared with her Empowered text switched on (Assault 2 + the attack trigger). `assault=false` strips Assault (diagnostic). */
const ambessa = (assault = true) => ({
  abilities: [
    ...(assault ? [{ keyword: "Assault", type: "keyword", value: 2 }] : []),
    {
      effect: { target: { controller: "enemy", filter: { mightLessThanSelf: true }, location: "here", type: "unit" }, type: "kill" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  isChampion: true,
  keywords: assault ? ["Assault"] : [],
  might: 5,
  name: "Ambessa, Respected and Feared",
});

/** P2's turn. P1 controls bf1 with Nocturne (4) and a facedown Switcheroo there; P2's Ambessa attacks from base. */
function board(assault = true) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", NOCTURNE, "nocturne")
    .facedown(P1, "bf1", SWITCHEROO, "switch")
    .unit(P2, "base", ambessa(assault), "ambessa")
    .build();
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Ambessa attacks; her trigger (Nocturne chosen) is on the chain; P2 passes; P1 flips Switcheroo onto [nocturne, ambessa]; both pass → it resolves. */
async function attackAndFlip(game: Game): Promise<void> {
  await game.p2.move("ambessa", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("nocturne"); // "they choose it to kill"
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ambessa", targets: ["nocturne"], triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "switch")).toBe(true); // 811.6 — the hidden card answers at Reaction speed, in the Closed state
  await game.p1.reveal("switch");
  for (let i = 0; i < 3 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
    const d = game.decision() as { options: { key: string }[] };
    const already = game.chain().find((c) => c.cardId === "switch")?.targets ?? [];
    const k = ["nocturne", "ambessa"].find((x) => d.options.some((o) => o.key === x) && !already.includes(x));
    await game.p1.pick(k ?? d.options[0]!.key);
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["ambessa", "switch"]); // Switcheroo on top
  expect(game.p1.energy()).toBe(0); // played from hidden for [0]
  await game.p1.passPriority();
  await game.p2.passPriority(); // Switcheroo resolves first (LIFO)
  expect(game.zoneOf("switch")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ambessa"]);
}

describe("Ruling 6ca8dbf1edd07e15 — hidden Switcheroo flipped in response makes Nocturne an illegal 'less Might than me' target: no kill", () => {
  test("premise: attacking Empowered Ambessa is a 7 (5 + Assault 2), Nocturne a 4 — her 'When I attack' trigger goes on the chain with Nocturne chosen, and P1 may flip the hidden Switcheroo in response", async () => {
    const game = await board();
    await game.p2.move("ambessa", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("nocturne");
    }
    expect(game.state("ambessa")).toMatchObject({ combatRole: "attacker", might: 7 });
    expect(game.state("nocturne")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ambessa", targets: ["nocturne"], triggered: true })]);
    expect(game.zoneOf("nocturne")).toBe("battlefield-bf1"); // nothing killed yet — it is a chain item
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "switch")).toBe(true);
  });

  // Expected: Switcheroo swaps the CURRENT totals 7 ↔ 4 — Ambessa reads 4 (while attacking) and Nocturne 7 — so when Ambessa's trigger resolves
  // Nocturne no longer has less Might and survives. Actual: the engine swaps only the pre-Assault values (5 ↔ 4): Ambessa 6, Nocturne 5 — still
  // "less than me" — and Nocturne is killed.
  test("ruling 6ca8dbf1edd07e15 — engine's Switcheroo ignores Assault in the swap (7↔4 becomes 6/5), so Ambessa still kills Nocturne", async () => {
    const game = await board();
    await attackAndFlip(game);
    expect(game.state("nocturne").might).toBe(7);
    expect(game.state("ambessa").might).toBe(4);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ambessa's trigger resolves — target re-checked
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nocturne")).toBe("battlefield-bf1"); // kill ignored (359.3.e.5)
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("the legality re-check itself (diagnostic, Assault stripped so the swap is a plain 5 ↔ 4): after Switcheroo Nocturne is 5 and Ambessa 4 → on resolution the chosen Nocturne is no longer 'less Might than me' and is NOT killed", async () => {
    const game = await board(false);
    await attackAndFlip(game);
    expect(game.state("nocturne").might).toBe(5);
    expect(game.state("ambessa").might).toBe(4);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nocturne")).toBe("battlefield-bf1");
    expect(game.state("nocturne").damage).toBe(0);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" }); // on to the rest of the showdown / combat
    expect(game.violations()).toEqual([]);
  });

  test("control: with no response the trigger resolves against a still-smaller Nocturne and kills it", async () => {
    const game = await board();
    await game.p2.move("ambessa", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("nocturne");
    }
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("nocturne")).toBe("trash");
  });
});
