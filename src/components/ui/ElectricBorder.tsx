import { useCallback, useEffect, useRef } from "react"
import type { CSSProperties, ReactNode } from "react"
import { styled } from "../../styled"

interface ElectricBorderProps {
  children: ReactNode
  color?: string
  speed?: number
  chaos?: number
  borderRadius?: number
  className?: string
  style?: CSSProperties
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "")
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("")
  }
  const int = parseInt(h, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function ElectricBorder({
  children,
  color = "#5227FF",
  speed = 1,
  chaos = 0.12,
  borderRadius = 24,
  className,
  style,
}: ElectricBorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const lastFrameTimeRef = useRef(0)

  const random = useCallback((x: number): number => {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1
  }, [])

  const noise2D = useCallback(
    (x: number, y: number): number => {
      const i = Math.floor(x)
      const j = Math.floor(y)
      const fx = x - i
      const fy = y - j

      const a = random(i + j * 57)
      const b = random(i + 1 + j * 57)
      const c = random(i + (j + 1) * 57)
      const d = random(i + 1 + (j + 1) * 57)

      const ux = fx * fx * (3.0 - 2.0 * fx)
      const uy = fy * fy * (3.0 - 2.0 * fy)

      return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
    },
    [random],
  )

  const octavedNoise = useCallback(
    (
      x: number,
      octaves: number,
      lacunarity: number,
      gain: number,
      baseAmplitude: number,
      baseFrequency: number,
      time: number,
      seed: number,
      baseFlatness: number,
    ): number => {
      let y = 0
      let amplitude = baseAmplitude
      let frequency = baseFrequency

      for (let i = 0; i < octaves; i++) {
        let octaveAmplitude = amplitude
        if (i === 0) {
          octaveAmplitude *= baseFlatness
        }
        y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3)
        frequency *= lacunarity
        amplitude *= gain
      }

      return y
    },
    [noise2D],
  )

  const getCornerPoint = useCallback(
    (
      centerX: number,
      centerY: number,
      radius: number,
      startAngle: number,
      arcLength: number,
      progress: number,
    ): { x: number; y: number } => {
      const angle = startAngle + progress * arcLength
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      }
    },
    [],
  )

  const getRoundedRectPoint = useCallback(
    (
      t: number,
      left: number,
      top: number,
      width: number,
      height: number,
      radius: number,
    ): { x: number; y: number } => {
      const straightWidth = width - 2 * radius
      const straightHeight = height - 2 * radius
      const cornerArc = (Math.PI * radius) / 2
      const totalPerimeter = 2 * straightWidth + 2 * straightHeight + 4 * cornerArc
      const distance = t * totalPerimeter

      let accumulated = 0

      if (distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth
        return { x: left + radius + progress * straightWidth, y: top }
      }
      accumulated += straightWidth

      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc
        return getCornerPoint(
          left + width - radius,
          top + radius,
          radius,
          -Math.PI / 2,
          Math.PI / 2,
          progress,
        )
      }
      accumulated += cornerArc

      if (distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight
        return { x: left + width, y: top + radius + progress * straightHeight }
      }
      accumulated += straightHeight

      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc
        return getCornerPoint(
          left + width - radius,
          top + height - radius,
          radius,
          0,
          Math.PI / 2,
          progress,
        )
      }
      accumulated += cornerArc

      if (distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth
        return { x: left + width - radius - progress * straightWidth, y: top + height }
      }
      accumulated += straightWidth

      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc
        return getCornerPoint(
          left + radius,
          top + height - radius,
          radius,
          Math.PI / 2,
          Math.PI / 2,
          progress,
        )
      }
      accumulated += cornerArc

      if (distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight
        return { x: left, y: top + height - radius - progress * straightHeight }
      }
      accumulated += straightHeight

      const progress = (distance - accumulated) / cornerArc
      return getCornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, progress)
    },
    [getCornerPoint],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const octaves = 10
    const lacunarity = 1.6
    const gain = 0.7
    const amplitude = chaos
    const frequency = 10
    const baseFlatness = 0
    const displacement = 60
    const borderOffset = 18 + chaos * 150

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      const width = rect.width + borderOffset * 2
      const height = rect.height + borderOffset * 2

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.scale(dpr, dpr)

      return { width, height }
    }

    let { width, height } = updateSize()
    let lastDpr = Math.min(window.devicePixelRatio || 1, 2)

    const drawElectricBorder = (currentTime: number) => {
      if (!canvas || !ctx) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (dpr !== lastDpr) {
        lastDpr = dpr
        const newSize = updateSize()
        width = newSize.width
        height = newSize.height
      }

      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000
      timeRef.current += deltaTime * speed
      lastFrameTimeRef.current = currentTime

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.scale(dpr, dpr)

      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      const scale = displacement
      const left = borderOffset
      const top = borderOffset
      const borderWidth = width - 2 * borderOffset
      const borderHeight = height - 2 * borderOffset
      const maxRadius = Math.min(borderWidth, borderHeight) / 2
      const radius = Math.min(borderRadius, maxRadius)

      const approximatePerimeter = 2 * (borderWidth + borderHeight) + 2 * Math.PI * radius
      const sampleCount = Math.floor(approximatePerimeter / 2)

      ctx.beginPath()

      for (let i = 0; i <= sampleCount; i++) {
        const progress = i / sampleCount

        const point = getRoundedRectPoint(progress, left, top, borderWidth, borderHeight, radius)

        const xNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          0,
          baseFlatness,
        )
        const yNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          1,
          baseFlatness,
        )

        const displacedX = point.x + xNoise * scale
        const displacedY = point.y + yNoise * scale

        if (i === 0) {
          ctx.moveTo(displacedX, displacedY)
        } else {
          ctx.lineTo(displacedX, displacedY)
        }
      }

      ctx.closePath()
      ctx.stroke()

      animationRef.current = requestAnimationFrame(drawElectricBorder)
    }

    const resizeObserver = new ResizeObserver(() => {
      const newSize = updateSize()
      width = newSize.width
      height = newSize.height
    })
    resizeObserver.observe(container)

    animationRef.current = requestAnimationFrame(drawElectricBorder)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      resizeObserver.disconnect()
    }
  }, [color, speed, chaos, borderRadius, octavedNoise, getRoundedRectPoint])

  const vars = {
    "--electric-border-color": color,
    "--electric-glow": hexToRgba(color, 0.6),
    borderRadius,
    ...style,
  } as CSSProperties

  return (
    <Root ref={containerRef} className={className} style={vars}>
      <CanvasWrap>
        <CanvasEl ref={canvasRef} />
      </CanvasWrap>
      <Layers>
        <Glow1 />
        <Glow2 />
        <BgGlow />
      </Layers>
      <Content>{children}</Content>
    </Root>
  )
}

const Root = styled.div`
  position: relative;
  border-radius: inherit;
  overflow: visible;
  isolation: isolate;
`

const CanvasWrap = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
`

const CanvasEl = styled.canvas`
  display: block;
`

const Content = styled.div`
  position: relative;
  border-radius: inherit;
  z-index: 1;
`

const Layers = styled.div`
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
`

const Glow1 = styled.div`
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 2px solid var(--electric-glow);
  filter: blur(1px);
`

const Glow2 = styled.div`
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 2px solid var(--electric-border-color);
  filter: blur(4px);
`

const BgGlow = styled.div`
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  z-index: -1;
  transform: scale(1.1);
  filter: blur(32px);
  opacity: 0.3;
  background: linear-gradient(
    -30deg,
    var(--electric-border-color),
    transparent,
    var(--electric-border-color)
  );
`
