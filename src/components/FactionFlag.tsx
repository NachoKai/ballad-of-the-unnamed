import type { ReactNode } from "react"

interface FactionFlagProps {
  factionId: string
  size?: number
}

function SvgWrap({ children, size }: { children: ReactNode; size: number }) {
  const h = Math.round(size * (14 / 20))
  return (
    <svg
      viewBox="0 0 20 14"
      width={size}
      height={h}
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, borderRadius: 1 }}
    >
      {children}
    </svg>
  )
}

const FLAGS: Record<string, ReactNode> = {
  greywater: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#3d372e" rx="1" />
      <polygon points="0,10 3,14 20,4 20,0" fill="#9c8f74" opacity="0.85" />
    </>
  ),
  ironhold: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#1d1913" rx="1" />
      <rect x="8" y="1" width="4" height="12" fill="#c9a44c" />
      <rect x="4" y="5" width="12" height="4" fill="#c9a44c" />
    </>
  ),
  thornwood: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#2d402d" rx="1" />
      <polygon points="2,11 10,2 18,11 14,11 10,6 6,11" fill="#6f8f6a" opacity="0.9" />
    </>
  ),
  arcanum: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#25163a" rx="1" />
      <polygon
        points="10,2 11.5,5.5 15,5.5 12.5,8 13.5,12 10,9.5 6.5,12 7.5,8 5,5.5 8.5,5.5"
        fill="#c9a44c"
      />
    </>
  ),
  crownguard: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#142240" rx="1" />
      <rect x="7" y="1" width="6" height="12" fill="#c9a44c" rx="1" />
    </>
  ),
  ashwalkers: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#3a3028" rx="1" />
      <polygon points="20,10 17,14 0,4 0,0" fill="#a03434" opacity="0.85" />
    </>
  ),
  blacktide: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#14141e" rx="1" />
      <rect x="0" y="4" width="20" height="6" fill="#e8dcc0" rx="1" opacity="0.85" />
    </>
  ),
  bronzehammer: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#3d2415" rx="1" />
      <polygon points="1,11 10,2 19,11 15,11 10,6 5,11" fill="#c9a44c" />
    </>
  ),
  crimsonveil: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#3a1212" rx="1" />
      <rect x="7" y="1" width="6" height="12" fill="#c9a44c" rx="1" />
    </>
  ),
  deepfolk: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#1c0f30" rx="1" />
      <polygon points="10,2 18,7 10,12 2,7" fill="#6f8f6a" opacity="0.85" />
    </>
  ),
  embersworn: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#3d1e0a" rx="1" />
      <polygon points="10,1 18,13 2,13" fill="#c9803c" opacity="0.85" />
    </>
  ),
  frostwood_tribe: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#1a3040" rx="1" />
      <polygon points="10,1 12,5 16,5 13,8 14,12 10,9.5 6,12 7,8 4,5 8,5" fill="#e8dcc0" />
    </>
  ),
  golden_lotus: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#b89432" rx="1" />
      <circle cx="10" cy="7" r="4" fill="#14110d" opacity="0.85" />
    </>
  ),
  iron_covenant: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#1d1913" rx="1" />
      <rect x="5" y="1" width="10" height="12" fill="#9c8f74" rx="1" opacity="0.7" />
    </>
  ),
  ivy_circle: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#2a4530" rx="1" />
      <circle cx="10" cy="7" r="4.5" fill="none" stroke="#c9a44c" strokeWidth="2" />
    </>
  ),
  meridian_company: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#1a3030" rx="1" />
      <rect x="8" y="1" width="4" height="12" fill="#c9a44c" rx="1" />
    </>
  ),
  nightfall_order: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#0a0a1a" rx="1" />
      <circle cx="11" cy="7" r="5" fill="#e8dcc0" opacity="0.85" />
      <circle cx="13" cy="7" r="4" fill="#0a0a1a" />
    </>
  ),
  rust_priests: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#3d1e0a" rx="1" />
      <circle cx="10" cy="7" r="4.5" fill="none" stroke="#c9803c" strokeWidth="2.5" />
    </>
  ),
  sandspear: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#4a3d28" rx="1" />
      <polygon points="0,10 3,14 20,4 20,0" fill="#a03434" opacity="0.85" />
    </>
  ),
  silver_mask: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#3d3d3d" rx="1" />
      <polygon points="10,2 18,7 10,12 2,7" fill="#e8dcc0" opacity="0.85" />
    </>
  ),
  stonewardens: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#2a2a2a" rx="1" />
      <polygon points="10,1 18,13 2,13" fill="#6f8f6a" opacity="0.85" />
    </>
  ),
  sunken_church: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#0a2020" rx="1" />
      <rect x="8" y="1" width="4" height="12" fill="#c9a44c" />
      <rect x="4" y="5" width="12" height="4" fill="#c9a44c" />
    </>
  ),
  whispering_reed: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#2a4530" rx="1" />
      <rect x="0" y="5" width="20" height="4" fill="#c9a44c" opacity="0.85" rx="1" />
    </>
  ),
  luminari: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#c9a44c" rx="1" />
      <polygon
        points="10,1 11.5,5 15.5,5 12.5,7.5 13.5,12 10,9.5 6.5,12 7.5,7.5 4.5,5 8.5,5"
        fill="#e8dcc0"
      />
    </>
  ),
  gildedtongue: (
    <>
      <rect x="0" y="0" width="20" height="14" fill="#b89432" rx="1" />
      <polygon points="1,11 10,2 19,11 15,11 10,6 5,11" fill="#a03434" />
    </>
  ),
}

export function FactionFlag({ factionId, size = 18 }: FactionFlagProps) {
  const svg = FLAGS[factionId]
  if (!svg) return null
  return <SvgWrap size={size}>{svg}</SvgWrap>
}
