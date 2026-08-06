/**
 * Differential oracle: the same scripted sequence on EngineBackend and on
 * BrowserBackend from equivalent starts must yield the same per-seat
 * observation (zones / resources / turn).
 *
 * "Equivalent start": the live /play/test game is sandbox (omniscient
 * snapshot), so we mirror it card-for-card into a scenario() engine using the
 * browser's instance ids as aliases (same ids on both sides), same deck /
 * rune-deck order, same battlefields, same pools, same turn — plus the
 * second-player bonus-rune bookkeeping the scenario builder does not model.
 *
 * TOLERATED differences (not compared, by design):
 *   - seq / decision ids / transcript hashes (server seq vs harness step counter; different hash bases)
 *   - state.players[*].turnsTaken, log, playerNames, chain item ids
 *   - hidden cards are compared by (owner, count) only — which is all a seat may see
 *   - BattlefieldView.name (registry naming) — ids/controllers/units ARE compared
 *   - card order inside unordered public zones (compared as sets); deck order is hidden anyway
 */

import { afterEach, expect, test } from "bun:test";
import type { CardView, Game, Observation } from "../../harness";
import { P1, P2, isHiddenView, loadDefaultCardPool, scenario } from "../../harness";
import { BrowserBackend, attachBrowserGame } from "../../harness/browser";
import type { UiSnapshot } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";

let current: BrowserBackend | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

const MIRRORED_ZONES = ["hand", "mainDeck", "runeDeck", "runePool", "base", "trash", "banishment", "legendZone", "championZone"] as const;

/** Build an engine Game that mirrors the browser's (sandbox, omniscient) snapshot. */
async function mirror(snap: UiSnapshot): Promise<Game> {
  const pool = await loadDefaultCardPool();
  const sb = scenario({ pool, seed: "differential" }).turn(snap.turn.number).phase(snap.turn.phase).active(snap.turn.activePlayer).fillDecks(false);
  for (const [pid, rp] of Object.entries(snap.runePools)) {
    sb.resources(pid, { energy: rp.energy, power: { ...(rp.power as Record<string, number>) } });
  }
  for (const [pid, ps] of Object.entries(snap.players)) {
    sb.points(pid, ps.victoryPoints ?? 0);
  }
  if (typeof snap.victoryScore === "number") {
    sb.victoryScore(snap.victoryScore);
  }
  for (const bf of snap.zones.battlefieldRow ?? []) {
    const st = snap.battlefields[bf.id];
    sb.battlefield(bf.id, { controller: st?.controller ?? null, def: bf.definitionId, inert: false, owner: bf.owner });
  }
  for (const zone of MIRRORED_ZONES) {
    for (const c of snap.zones[zone] ?? []) {
      const meta: Record<string, unknown> = {};
      if (c.meta?.exhausted) {
        meta.exhausted = true;
      }
      if (typeof c.meta?.damage === "number" && c.meta.damage > 0) {
        meta.damage = c.meta.damage;
      }
      sb.card(c.id, { def: c.definitionId, meta, owner: c.owner, zone });
    }
  }
  for (const [bfId] of Object.entries(snap.battlefields)) {
    for (const c of snap.zones[`battlefield-${bfId}`] ?? []) {
      sb.card(c.id, { def: c.definitionId, meta: c.meta?.exhausted ? { exhausted: true } : undefined, owner: c.owner, zone: `battlefield:${bfId}` });
    }
  }
  const game = await sb.build();
  // Second player's first-turn bonus rune (setup.ts) — not modelled by scenario().
  const setup = snap.setup as { firstPlayer?: string; secondPlayer?: string } | undefined;
  const second = setup?.secondPlayer ?? P2;
  game.engine.applyPatches([
    { op: "add", path: ["secondPlayerExtraRune"], value: true },
    { op: "add", path: ["firstTurnNumber"], value: { [second]: 2 } },
    { op: "add", path: ["setup"], value: snap.setup },
  ]);
  return game;
}

/** Per-seat comparable projection of an Observation. */
function project(o: Observation) {
  const zone = (cards: readonly CardView[]) => {
    const visible = cards.filter((c) => !isHiddenView(c)).map((c) => (c as { id: string }).id).sort();
    const hidden: Record<string, number> = {};
    for (const c of cards) {
      if (isHiddenView(c)) {
        hidden[c.owner] = (hidden[c.owner] ?? 0) + 1;
      }
    }
    return { hidden, visible };
  };
  const zones: Record<string, ReturnType<typeof zone>> = {};
  for (const [k, v] of Object.entries(o.zones)) {
    if (v.length > 0) {
      zones[k] = zone(v);
    }
  }
  return {
    battlefields: [...o.battlefields].map((b) => ({ contested: b.contested, controller: b.controller, id: b.id, units: zone(b.units) })).sort((a, b) => a.id.localeCompare(b.id)),
    chain: o.chain.map((c) => c.cardId),
    points: o.points,
    resources: o.resources,
    status: o.status,
    turn: o.turn,
    zones,
  };
}

/** The scripted sequence, expressed once in L2 vocabulary. */
async function script(game: Game, unit: string, runes: readonly string[]): Promise<void> {
  await game.p1.tapRune(runes[0]);
  await game.p1.tapRune(runes[1]);
  await game.p1.play(unit);
  await game.settle({ policy: "first" });
}

describeLive("differential: EngineBackend vs BrowserBackend", () => {
  test(
    "tap ×2 → play unit → end turn → (opponent turn) → our turn 3: per-seat observations agree",
    async () => {
      const backend = await BrowserBackend.launch({ baseUrl: BASE_URL, mode: "test", seat: P1 });
      current = backend;
      const bg = attachBrowserGame(backend);

      // The unit both sides will play: cheapest ≤2-cost, power-free unit in the opening hand
      // (vanilla preferred); if the shuffle dealt none, tutor one BEFORE mirroring so the
      // engine copy starts from the same (tutored) position.
      const pickUnit = () =>
        bg.p1
          .hand()
          .filter((c) => bg.state(c).cardType === "unit" && bg.state(c).energyCost <= 2 && bg.state(c).powerCost.length === 0)
          .sort(
            (a, b) =>
              Number(Boolean(bg.state(a).rulesText)) - Number(Boolean(bg.state(b).rulesText)) ||
              bg.state(a).energyCost - bg.state(b).energyCost ||
              a.localeCompare(b),
          )[0];
      let unit = pickUnit();
      if (!unit) {
        await backend.tutor("sfd-018-221");
        unit = pickUnit();
      }
      expect(unit).toBeDefined();
      unit = unit as string;

      const eg = await mirror(backend.currentFrame.snapshot);

      // Same start (P1's view and the omniscient view) and the same P1 menu.
      expect(project(eg.p1.view())).toEqual(project(bg.p1.view()));
      expect(project(eg.view())).toEqual(project(bg.view()));
      expect(eg.p1.legal().map((o) => o.key)).toEqual(bg.p1.legal().map((o) => o.key));
      const runes = bg.p1.runes();
      expect(eg.p1.runes()).toEqual(runes);

      await script(bg, unit, runes);
      await script(eg, unit, runes);
      expect(project(eg.p1.view())).toEqual(project(bg.p1.view()));
      expect(eg.p1.legal().map((o) => o.key).sort()).toEqual(bg.p1.legal().map((o) => o.key).sort());

      // End turn. Browser: goldfish auto-plays P2 (passes triggers, ends turn). Engine: drive P2 the same way.
      await bg.p1.endTurn();
      await backend.waitFor((o) => o.turn.activePlayer === P1 && o.turn.number === 3, { timeoutMs: 15_000 });
      await bg.settle();
      await eg.advanceTurn(); // → P2 main (P2's Loose Cannon trigger passed both ways)
      expect(eg.turnPlayer()).toBe(P2);
      await eg.advanceTurn(); // → P1 turn 3 main
      expect(eg.turnNumber()).toBe(3);

      const pb = project(bg.p1.view());
      const pe = project(eg.p1.view());
      expect(pe.turn).toEqual(pb.turn);
      expect(pe.resources).toEqual(pb.resources);
      expect(pe.zones).toEqual(pb.zones);
      expect(pe.battlefields).toEqual(pb.battlefields);
      expect(pe).toEqual(pb);
      // P2's own view agrees too (its hand identities included).
      expect(project(eg.p2.view())).toEqual(project(bg.p2.view()));
      // Card-level state of the unit we played: readied at our new turn on both.
      expect(eg.state(unit)).toMatchObject({ isExhausted: false, zone: "base" });
      expect(bg.state(unit)).toMatchObject({ isExhausted: false, zone: "base" });
    },
    LIVE_TIMEOUT,
  );
});
