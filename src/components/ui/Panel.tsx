import { styled } from "../../styled"

export const Panel = styled.div`
  background: linear-gradient(180deg, ${({ theme }) => theme.colors.panel} 0%, ${({ theme }) => theme.colors.ink2} 100%);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadow};
`
