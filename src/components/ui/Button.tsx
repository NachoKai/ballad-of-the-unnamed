import { styled } from "../../styled"

export const BtnPrimary = styled.button<{ $block?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.goldBright},
    ${({ theme }) => theme.colors.gold}
  );
  border: 1px solid ${({ theme }) => theme.colors.gold};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 13px 28px;
  color: ${({ theme }) => theme.colors.ink};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 600;
  font-size: 17px;
  letter-spacing: 0.04em;
  box-shadow: 0 6px 20px rgba(201, 164, 76, 0.2);
  transition:
    transform 0.12s,
    filter 0.15s;
  width: ${({ $block }) => ($block ? "100%" : "auto")};

  &:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }
`

export const BtnGhost = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 12px 22px;
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 16px;
  letter-spacing: 0.03em;
  transition:
    border-color 0.15s,
    color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

export const LinkBtn = styled.button`
  background: none;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 6px 12px;
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 16px;
  letter-spacing: 0.03em;
  transition:
    color 0.15s,
    border-color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.goldBright};
    border-color: ${({ theme }) => theme.colors.line2};
  }
`
