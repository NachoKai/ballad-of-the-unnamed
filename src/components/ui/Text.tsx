import { styled } from "../../styled"

export const TextBalance = styled.span`
  text-wrap: balance;
`

export const TextPretty = styled.p`
  text-wrap: pretty;
`

export const Faint = styled.span`
  color: ${({ theme }) => theme.colors.muted};
`

export const Num = styled.span`
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.parchment};
  font-weight: 600;
`
