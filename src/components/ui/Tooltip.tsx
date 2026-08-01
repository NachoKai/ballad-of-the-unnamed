import { useId } from "react"
import type { ReactNode } from "react"
import { styled } from "../../styled"

type TooltipSide = "top" | "bottom"
type TooltipAlign = "center" | "start" | "end"

interface TooltipProps {
  content: string
  children: ReactNode
  side?: TooltipSide
  align?: TooltipAlign
  className?: string
  /** Render the trigger wrapper as a full-width block instead of a shrink-wrapping inline-flex. */
  fill?: boolean
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
  fill = false,
}: TooltipProps) {
  const id = useId()
  return (
    <TipWrap className={className} aria-describedby={id} $fill={fill}>
      {children}
      <TipBody id={id} role="tooltip" $side={side} $align={align}>
        {content}
      </TipBody>
    </TipWrap>
  )
}

const TipWrap = styled.span<{ $fill: boolean }>`
  position: relative;
  display: ${({ $fill }) => ($fill ? "block" : "inline-flex")};
  width: ${({ $fill }) => ($fill ? "100%" : undefined)};
  align-items: baseline;

  &:hover > [role="tooltip"],
  &:focus-within > [role="tooltip"] {
    opacity: 1;
    visibility: visible;
    transform: var(--tip-x, translateX(-50%)) translateY(0);
  }
`

const TipBody = styled.span<{ $side: TooltipSide; $align: TooltipAlign }>`
  position: absolute;
  z-index: 60;
  max-width: 260px;
  width: max-content;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  box-shadow: ${({ theme }) => theme.shadow};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  letter-spacing: normal;
  line-height: 1.45;
  text-transform: none;
  text-align: left;
  color: ${({ theme }) => theme.colors.parchment};
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;

  ${({ $side }) => ($side === "top" ? `bottom: calc(100% + 8px);` : `top: calc(100% + 8px);`)}

  ${({ $align }) =>
    $align === "center"
      ? `--tip-x: translateX(-50%); left: 50%;`
      : $align === "start"
        ? `--tip-x: translateX(0); left: 0;`
        : `--tip-x: translateX(0); right: 0;`}

  transform: var(--tip-x, translateX(-50%)) translateY(4px);
`
