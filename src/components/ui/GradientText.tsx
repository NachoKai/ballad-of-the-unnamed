import type { ReactNode } from "react"
import { styled } from "../../styled"
import { keyframes } from "styled-components"

const sweep = keyframes`
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
`

const StyledGradient = styled.span<{ $speed: number }>`
  background-image: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.gold},
    ${({ theme }) => theme.colors.goldBright},
    ${({ theme }) => theme.colors.parchment},
    ${({ theme }) => theme.colors.goldBright},
    ${({ theme }) => theme.colors.gold}
  );
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: ${sweep} ${({ $speed }) => $speed}s linear infinite;
`

interface Props {
  children: ReactNode
  speed?: number
  as?: React.ElementType
}

export function GradientText({ children, speed = 6, as = "span" }: Props) {
  return (
    <StyledGradient as={as} $speed={speed}>
      {children}
    </StyledGradient>
  )
}
