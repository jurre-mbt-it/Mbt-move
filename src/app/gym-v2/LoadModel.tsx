'use client'

import { useState } from 'react'
import { WEEKS } from './data'
import { makeScale, points, toPath, toArea, pathLength } from './plot'

const S = makeScale(720, 320, { l: 34, r: 12, t: 18, b: 32 })
const FIT = points(S, 'fit')
const FAT = points(S, 'fat')
const FLAG_INDEX = WEEKS.findIndex((d) => d.flag)
const GRID = [0, 25, 50, 75, 100]

/**
 * Het belastingmodel als bedienbaar instrument: sleep door de weken en de
 * uitlezing loopt mee. De grafiek zelf is server-gerenderd, dus zonder
 * JavaScript staat er nog steeds een volledige lijngrafiek; alleen het
 * schuiven vervalt dan.
 */
export function LoadModel() {
  const [i, setI] = useState(FLAG_INDEX)
  const d = WEEKS[i]
  const form = d.fit - d.fat

  return (
    <div className="instrument rv d1">
      <div className="readout">
        <div>
          <span className="tag">Week</span>
          <b>{d.w}</b>
        </div>
        <div>
          <span className="tag">Belasting</span>
          <b>{d.load}</b>
        </div>
        <div>
          <span className="tag">Fitheid</span>
          <b className="v-fit">{d.fit}</b>
        </div>
        <div>
          <span className="tag">Vermoeidheid</span>
          <b className="v-fat">{d.fat}</b>
        </div>
        <div>
          <span className="tag">Vorm</span>
          <b style={{ color: form >= 0 ? 'var(--fit)' : 'var(--signal)' }}>
            {form > 0 ? '+' : form < 0 ? '−' : ''}
            {Math.abs(form)}
          </b>
        </div>
      </div>

      <svg
        className="plot"
        viewBox={`0 0 ${S.w} ${S.h}`}
        role="img"
        aria-label="Grafiek van fitheid tegen vermoeidheid over twaalf weken, met week 7 gemarkeerd als sprong van 340 naar 420 AU."
      >
        {GRID.map((v) => (
          <g key={v}>
            <line className="gridline" x1={S.pad.l} x2={S.w - S.pad.r} y1={S.y(v)} y2={S.y(v)} />
            <text className="tickt" x={S.pad.l - 8} y={S.y(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <line className="axis" x1={S.pad.l} x2={S.pad.l} y1={S.pad.t} y2={S.h - S.pad.b} />

        <line className="flag" x1={S.x(FLAG_INDEX)} x2={S.x(FLAG_INDEX)} y1={S.pad.t} y2={S.h - S.pad.b} />
        <text className="tickt" x={S.x(FLAG_INDEX) + 7} y={S.pad.t + 10} fill="var(--warn)">
          +24% t.o.v. 4 wk
        </text>

        <path className="area" d={toArea(S, FIT)} />
        <path
          className="ln ln--fat ln--draw"
          d={toPath(FAT)}
          style={{ '--len': pathLength(FAT) } as React.CSSProperties}
        />
        <path
          className="ln ln--fit ln--draw"
          d={toPath(FIT)}
          style={{ '--len': pathLength(FIT) } as React.CSSProperties}
        />

        {WEEKS.map((wk, idx) => (
          <text key={wk.w} className="tickt" x={S.x(idx)} y={S.h - 10} textAnchor="middle">
            {wk.w}
          </text>
        ))}
        <text className="tickt" x={S.pad.l} y={S.pad.t - 6}>
          WEEK
        </text>

        <line className="axis" x1={S.x(i)} x2={S.x(i)} y1={S.pad.t} y2={S.h - S.pad.b} stroke="var(--fg-2)" />
        <circle className="dot" cx={S.x(i)} cy={S.y(d.fit)} r={5} fill="var(--fit)" />
        <circle className="dot" cx={S.x(i)} cy={S.y(d.fat)} r={5} fill="var(--signal)" />
      </svg>

      <div className="legend">
        <span className="tag">
          <i className="k-fit" />
          Fitheid, 6 weken
        </span>
        <span className="tag">
          <i className="k-fat" />
          Vermoeidheid, 7 dagen
        </span>
        <span className="tag">
          <i className="k-flag" />
          Gemarkeerde sprong
        </span>
      </div>

      <div className="scrub">
        <label className="tag" htmlFor="gv2-week">
          Sleep door de weken
        </label>
        <input
          id="gv2-week"
          type="range"
          min={1}
          max={WEEKS.length}
          step={1}
          value={i + 1}
          onChange={(e) => setI(Number(e.target.value) - 1)}
          aria-label={`Kies een week tussen 1 en ${WEEKS.length}`}
          aria-valuetext={`Week ${d.w}, belasting ${d.load} AU`}
        />
      </div>
    </div>
  )
}
