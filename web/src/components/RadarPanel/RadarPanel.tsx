/**
 * The product's headline visual: self-score vs counter-score per
 * competency, as a recharts radar. Axes and scale are read entirely from
 * props -- never hardcoded to six axes or a four-point scale, because
 * La Trobe's six-competency rubric and SFIA 9 do not share either
 * number. See db/01-schema.sql's v_framework_scale: the scale is one
 * shared min/max across the whole framework, not per competency, so
 * there is exactly one PolarRadiusAxis domain to set here, not one per
 * axis, even though SFIA's own per-skill ranges are uneven underneath.
 *
 * Ownership split: whatever screen renders this owns the actual
 * GET /me/radar fetch (through api.ts, like every other call in this
 * app) and passes loading/error/empty in directly. What counts as
 * "loaded but not enough to draw" is decided in here, once, rather than
 * by every future screen that embeds this component -- an entire
 * series (every self value, or every counter value, null across all
 * axes) means there is nothing to plot for that series, so it renders
 * as insufficient rather than two overlapping near-empty shapes.
 */
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import { ApiError } from '../../api/client.ts';
import { ErrorNotice } from '../ErrorNotice/ErrorNotice.tsx';
import { Skeleton, SkeletonGroup } from '../Skeleton/Skeleton.tsx';
import styles from './RadarPanel.module.css';

export interface RadarAxis {
  code: string;
  short_label: string | null;
  position: number;
  self: number | null;
  counter: number | null;
}

export interface RadarScale {
  min: number;
  max: number;
}

export type RadarPanelProps =
  | { state: 'loading' }
  | { state: 'error'; error: ApiError; on_retry?: () => void }
  | { state: 'empty' }
  | { state: 'loaded'; scale: RadarScale; axes: RadarAxis[] };

// "Insufficient" only means genuinely nothing to plot on either series --
// axes.length === 0 (should not happen once a reflection exists, since
// entries are created eagerly one per competency, but defend anyway), or
// every self value AND every counter value null (a reflection was just
// created and nothing has been scored yet). A more common real case --
// self fully scored, counter not yet -- has actual data worth showing,
// so it goes through LoadedRadar instead, which draws whichever
// series exist and captions the one that does not. Per the submit gate
// and the counter-score rule (Scoring.php), a counter-score can only
// exist once every entry already has a self score, so "counter present,
// self entirely absent" is not reachable in practice -- the caption
// logic still covers it defensively, not because it is expected.
function has_nothing_to_draw(axes: RadarAxis[]): boolean {
  if (axes.length === 0) return true;
  const self_has_data = axes.some((a) => a.self !== null);
  const counter_has_data = axes.some((a) => a.counter !== null);
  return !self_has_data && !counter_has_data;
}

export function RadarPanel(props: RadarPanelProps) {
  if (props.state === 'loading') return <LoadingRadar />;
  if (props.state === 'error') {
    return <ErrorNotice error={props.error} on_retry={props.on_retry} />;
  }
  // A reflection with entries but zero scores anywhere (right after
  // creation, before any self-scoring) reads to a student exactly the
  // same as no reflection at all: nothing to compare yet. Same copy,
  // same component -- a third near-identical text box would say the
  // same thing twice in slightly different words.
  if (props.state === 'empty' || has_nothing_to_draw(props.axes)) return <EmptyRadar />;
  return <LoadedRadar scale={props.scale} axes={props.axes} />;
}

function LoadedRadar({ scale, axes }: { scale: RadarScale; axes: RadarAxis[] }) {
  const sorted = [...axes].sort((a, b) => a.position - b.position);
  const self_has_data = sorted.some((a) => a.self !== null);
  const counter_has_data = sorted.some((a) => a.counter !== null);
  const data = sorted.map((a) => ({
    label: a.short_label ?? a.code,
    self: a.self,
    counter: a.counter,
  }));

  return (
    <div className={styles.panel}>
      {!counter_has_data && (
        <p className={styles.caption}>Still awaiting a counter-score.</p>
      )}
      {!self_has_data && counter_has_data && (
        <p className={styles.caption}>Still awaiting your self-score.</p>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text)', fontSize: 12 }}
          />
          <PolarRadiusAxis
            domain={[scale.min, scale.max]}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          />
          {self_has_data && (
            <Radar
              name="Self"
              dataKey="self"
              stroke="var(--color-primary)"
              fill="var(--color-primary)"
              fillOpacity={0.25}
              dot={{ r: 4, fill: 'var(--color-primary)', stroke: 'var(--color-primary)' }}
              connectNulls
            />
          )}
          {counter_has_data && (
            <Radar
              name="Counter-score"
              dataKey="counter"
              stroke="var(--color-success)"
              strokeDasharray="6 4"
              fill="var(--color-success)"
              fillOpacity={0.15}
              dot={{
                r: 4,
                fill: 'var(--color-bg)',
                stroke: 'var(--color-success)',
                strokeWidth: 2,
              }}
              connectNulls
            />
          )}
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LoadingRadar() {
  return (
    <div className={styles.panel}>
      <SkeletonGroup label="Loading radar">
        <Skeleton variant="circle" width="20rem" height="20rem" />
      </SkeletonGroup>
    </div>
  );
}

function EmptyRadar() {
  return (
    <div className={styles.placeholder}>
      <p>No scores yet.</p>
    </div>
  );
}
