export const meta = {
  name: 'riftatlas-tutorial-copy',
  description: 'Sample frames from a RiftAtlas gameplay video, extract UI behaviors, check each against our app, report gaps.',
  phases: [
    { title: 'Sample', detail: 'yt-dlp + ffmpeg → N frames' },
    { title: 'Extract', detail: 'agents describe what each frame batch shows' },
    { title: 'Check', detail: 'per-feature: reproduce in our app, compare' },
    { title: 'Report' },
  ],
}

const REPO = '/root/src/tcg/tcg-engines'
const A = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const VIDEO = A.videoUrl ?? ''
const FRAMES = A.frames ?? 60
const LANE = A.lane ?? 23
const BATCH = 6
if (!VIDEO || !/^(https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{11}|youtu\.be\/[\w-]{11})([&?][\w=&%-]{0,200})?|\/[\w./-]{1,200}\.mp4)$/.test(VIDEO)) {
  throw new Error('videoUrl must be a YouTube watch URL or a local .mp4 path')
}
if (!Number.isInteger(LANE) || LANE < 0 || LANE > 63) throw new Error('invalid lane')

const OK = { type:'object', properties:{ok:{type:'boolean'},count:{type:'number'},dir:{type:'string'},notes:{type:'string'}}, required:['ok'] }
const BEHAVIORS = { type:'object', properties:{behaviors:{type:'array',items:{type:'object',properties:{
  feature:{type:'string'}, description:{type:'string'}, frames:{type:'array',items:{type:'number'}}
},required:['feature','description']}}},required:['behaviors'] }
const GAP = { type:'object', properties:{
  feature:{type:'string'}, riftatlas:{type:'string'}, ours:{type:'string'},
  verdict:{type:'string',enum:['PRESENT','MISSING','DIFFERENT','NOT_TESTABLE']}, notes:{type:'string'}
},required:['feature','verdict'] }

// ───────────────────────── Sample ─────────────────────────
phase('Sample')
const DIR = '/tmp/riftatlas'
const dl = await agent(
`Download and sample the video. Use dangerouslyDisableSandbox (yt-dlp needs network; ffmpeg writes /tmp).

  which yt-dlp || pip install yt-dlp
  which ffmpeg || (apt-get install -y ffmpeg 2>/dev/null || conda install -y ffmpeg 2>/dev/null || echo 'ffmpeg missing')
  rm -rf ${DIR} && mkdir -p ${DIR}
  ${VIDEO.startsWith('http') ? `yt-dlp -f 'best[height<=720]' -o ${DIR}/video.mp4 '${VIDEO}'` : `cp '${VIDEO}' ${DIR}/video.mp4`}
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ${DIR}/video.mp4)
  ffmpeg -i ${DIR}/video.mp4 -vf "fps=${FRAMES}/\${DUR}" -vsync vfr ${DIR}/frame-%03d.png 2>&1 | tail -3
  ls ${DIR}/frame-*.png | wc -l

Return ok=true if ≥${Math.floor(FRAMES*0.8)} frames extracted; count=<N>; dir=${DIR}.`,
  { label:'download+sample', phase:'Sample', schema:OK })
if (!dl?.ok) throw new Error(`sample failed: ${dl?.notes}`)
const N = dl.count || FRAMES
log(`${N} frames at ${DIR}`)

// ───────────────────────── Extract behaviors ─────────────────────────
phase('Extract')
const batches = []
for (let i = 1; i <= N; i += BATCH) batches.push(Array.from({length:Math.min(BATCH,N-i+1)},(_,k)=>i+k))
log(`${batches.length} frame batches`)

const raw = await parallel(batches.map(batch => () =>
  agent(
`You are watching a RiftAtlas (Riftbound TCG client) gameplay video. Read these frames IN ORDER and describe what UI/UX behavior each shows.

Frames: ${batch.map(n=>`${DIR}/frame-${String(n).padStart(3,'0')}.png`).join(', ')}

For each distinct behavior visible across these frames, report:
- feature: short name (e.g. "drag-to-battlefield", "target-selection-modal", "resource-bar-update", "hover-preview", "phase-tracker", "chain-stack-display")
- description: what happens (2-3 sentences — layout, interaction, visual feedback)
- frames: which frame numbers show it

Focus on INTERACTIONS and INFORMATION DISPLAY, not the game's rules. Return {behaviors:[]} if nothing new is visible (e.g., static menu screen).`,
    { label:`extract ${batch[0]}-${batch[batch.length-1]}`, phase:'Extract', schema:BEHAVIORS }
  ).then(r => (r?.behaviors||[]).map(b=>({...b, frames:b.frames||batch})))
))
const flat = raw.filter(Boolean).flat()

// Dedupe by feature name (fuzzy: normalize + first-3-words)
const uniq = new Map()
for (const b of flat) {
  const k = (b.feature||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').split(/\s+/).slice(0,3).join('-')
  if (!uniq.has(k)) uniq.set(k, {...b, count:0, frames:[]})
  const e = uniq.get(k); e.count++; e.frames.push(...(b.frames||[]))
}
const features = [...uniq.values()].sort((a,b)=>b.count-a.count)
log(`${flat.length} raw behaviors → ${features.length} unique features`)

// ───────────────────────── Check ours ─────────────────────────
phase('Check')
const gaps = await parallel(features.map((f,i) => () =>
  agent(
`Compare a RiftAtlas UI feature against our app.

## RiftAtlas feature (from video frames)
Feature: ${f.feature}
Description: ${f.description}
Reference frames (Read them): ${f.frames.slice(0,3).map(n=>`${DIR}/frame-${String(n).padStart(3,'0')}.png`).join(', ')}

## Our app
Browser: \`pw() { bun /tmp/pwtest/pw-repl.ts --sock ${LANE} "$@" 2>/dev/null; }\` (dangerouslyDisableSandbox for socket).
Get to the board: \`bash /tmp/pwtest/setup-game.sh ${LANE} 1\`. Then \`pw shot /tmp/ours-${i}.png\`, \`pw click\`, \`pw drag\`, \`pw eval\` etc. to try the same interaction.

## Report
- verdict: PRESENT (we have it and it works similarly), DIFFERENT (we have something but it looks/behaves differently — describe how), MISSING (we don't have it), NOT_TESTABLE (needs multiplayer/state you can't reach)
- riftatlas: 1-2 sentence summary of what they do
- ours: 1-2 sentence summary of what we do (or "nothing")

**Do NOT edit any files** — this is a read-only comparison.`,
    { label:`check: ${f.feature.slice(0,25)}`, phase:'Check', schema:GAP }
  ).then(v => ({...f, ...v}))
))

phase('Report')
const by = {PRESENT:0, DIFFERENT:0, MISSING:0, NOT_TESTABLE:0}
for (const g of gaps.filter(Boolean)) by[g.verdict] = (by[g.verdict]||0)+1
log(`verdicts: ${JSON.stringify(by)}`)

return {
  video: VIDEO, framesSampled: N,
  features: features.length,
  ...by,
  gaps: gaps.filter(Boolean).filter(g => g.verdict !== 'PRESENT'),
  present: gaps.filter(Boolean).filter(g => g.verdict === 'PRESENT').map(g=>g.feature),
  all: gaps.filter(Boolean),
}
