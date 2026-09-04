import type { Phase, Signable } from '../hooks/useSwapSteps';

/** The ordered steps of a run, ticked as they mine. Shown only once signing has started. */
export function StepsList<Q extends Signable>({ phase }: { phase: Phase<Q> }) {
  const show = phase.at === 'signing' || phase.at === 'done' || (phase.at === 'error' && phase.quote !== undefined && phase.step !== undefined);
  if (!show) return null;
  const steps = phase.quote?.steps ?? [];
  const hashes = 'hashes' in phase ? (phase.hashes ?? []) : [];
  return (
    <ol className="steps">
      {steps.map((s, i) => {
        const done = i < hashes.length && !(phase.at === 'error' && i === phase.step && !hashes[i]);
        const now = phase.at === 'signing' && i === phase.step;
        return (
          <li key={i} className={done ? 'done' : now ? 'now' : ''}>
            <span className="n">{done ? '✓' : i + 1}</span>
            <span>
              {s.label}
              {now ? (phase.mining ? ' · mining…' : ' · confirm in wallet') : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
