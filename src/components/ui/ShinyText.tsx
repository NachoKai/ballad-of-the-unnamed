import type { ReactNode } from "react"
import { styled } from "../../styled"
import { keyframes } from "styled-components"

const shine = keyframes`
  0% { background-position: 100%; }
  100% { background-position: -100%; }
`

const StyledShiny = styled.span<{ $speed: number }>`
  color: ${({ theme }) => theme.colors.goldBright};

  &:hover {
    color: transparent;
    background-image: linear-gradient(
      110deg,
      ${({ theme }) => theme.colors.goldBright} 35%,
      #fff7e0 50%,
      ${({ theme }) => theme.colors.goldBright} 65%
    );
    background-size: 200% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    animation: ${shine} ${({ $speed }) => $speed}s linear infinite;
  }
`

interface Props {
  children: ReactNode
  speed?: number
  as?: React.ElementType
}

export function ShinyText({ children, speed = 3, as = "span" }: Props) {
  return (
    <StyledShiny as={as} $speed={speed}>
      {children}
    </StyledShiny>
  )
}
