/**
 * L4 — Transcript replay by decisions (not by patches / RuleEngine.replay).
 */

import { loadDefaultCardPool } from "./card-pool";
import { Game } from "./game";
import type { ScenarioSpec } from "./scenario";
import type { Transcript } from "./transcript-types";
import type { CardPool } from "./types";
import { HarnessError, P1, P2 } from "./types";

export type { Transcript, TranscriptOrigin, TranscriptStep } from "./transcript-types";

export interface ReplayOptions {
  readonly pool?: CardPool;
  /** Compare per-step hashes (default true). */
  readonly verifyHashes?: boolean;
  /** Replay only the first N steps. */
  readonly stopAt?: number;
  readonly autoProcedures?: boolean;
}

export interface ReplayResult {
  readonly game: Game;
  readonly stepsApplied: number;
  /** First step whose hash (or outcome) differed, if any. */
  readonly divergedAt?: number;
  readonly divergence?: string;
  readonly finalHashMatches: boolean;
}

/** Rebuild the origin position of a transcript. */
export async function rebuildOrigin(t: Transcript, opts: ReplayOptions = {}): Promise<Game> {
  const pool = opts.pool ?? (await loadDefaultCardPool());
  switch (t.origin.kind) {
    case "scenario": {
      return Game.fromScenario(t.origin.spec as ScenarioSpec, { autoProcedures: opts.autoProcedures, pool });
    }
    case "decks": {
      const p1 = t.origin.decks[P1];
      const p2 = t.origin.decks[P2];
      if (!p1 || !p2) {
        throw new HarnessError({ code: "ILLEGAL_ARGS", message: "decks origin needs P1 and P2 deck configs" });
      }
      return Game.fromDecks({ autoProcedures: opts.autoProcedures, p1, p2, pool, seed: t.origin.seed });
    }
    default: {
      throw new HarnessError({
        code: "ILLEGAL_ARGS",
        message: "Transcript origin is opaque; cannot rebuild (create games via scenario() or Game.fromDecks())",
      });
    }
  }
}

/**
 * Re-apply every recorded answer to a freshly built origin and compare
 * state hashes step by step.
 */
export async function replayTranscript(t: Transcript, opts: ReplayOptions = {}): Promise<ReplayResult> {
  const game = await rebuildOrigin(t, opts);
  const verify = opts.verifyHashes ?? true;
  let divergedAt: number | undefined;
  let divergence: string | undefined;
  if (verify && game.stateHash() !== t.initialHash) {
    divergedAt = 0;
    divergence = `initial hash ${game.stateHash()} ≠ ${t.initialHash}`;
  }
  const steps = opts.stopAt === undefined ? t.steps : t.steps.slice(0, opts.stopAt);
  let applied = 0;
  for (const step of steps) {
    const r = await game.act(step.seat, step.answer);
    applied += 1;
    if (r.ok !== step.ok) {
      divergedAt ??= step.n;
      divergence ??= `step ${step.n}: ok=${r.ok} (recorded ${step.ok})${r.ok ? "" : ` ${r.error.message}`}`;
      break;
    }
    if (verify && r.ok && game.stateHash() !== step.hash) {
      divergedAt ??= step.n;
      divergence ??= `step ${step.n}: hash ${game.stateHash()} ≠ ${step.hash}`;
    }
  }
  return {
    divergedAt,
    divergence,
    finalHashMatches: game.stateHash() === t.finalHash,
    game,
    stepsApplied: applied,
  };
}
