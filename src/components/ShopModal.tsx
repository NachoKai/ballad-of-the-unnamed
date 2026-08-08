import { useEffect, useState } from "react"
import { styled } from "styled-components"
import type { AchievementContent, Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { api, type ShopResponse } from "../api"
import { BtnPrimary } from "./ui/Button"
import { rise } from "./ui/Animation"

interface Props {
  locale: Locale
  runId: string
  onClose: () => void
  onPurchased: (res: {
    gold: number
    inventory: { itemId: string; qty: number; expiresAtTurn: number | null }[]
    newAchievements?: AchievementContent[]
  }) => void
}

type Tab = "retinue" | "consumable" | "luxury"

const TAB_ORDER: Tab[] = ["retinue", "consumable", "luxury"]

export function ShopModal({ locale, runId, onClose, onPurchased }: Props) {
  const [tab, setTab] = useState<Tab>("retinue")
  const [data, setData] = useState<ShopResponse | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .shop(runId)
      .then(setData)
      .catch(() => setError("Failed to load shop"))
  }, [runId])

  async function buy(itemId: string) {
    setBuying(itemId)
    setError(null)
    try {
      const res = await api.buy({ runId, itemId })
      setData((prev) => (prev ? { ...prev, gold: res.gold, inventory: res.inventory } : prev))
      onPurchased(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBuying(null)
    }
  }

  const items = data?.items ?? []
  const activeItems = items.filter((i) => i.category === tab)
  const ownedIds = new Set(data?.inventory.map((i) => i.itemId) ?? [])

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>{t(locale, "shop")}</Title>
          <GoldDisplay>{data ? `${data.gold}g` : "..."}</GoldDisplay>
          <CloseBtn type="button" onClick={onClose}>
            &times;
          </CloseBtn>
        </Header>

        <Tabs role="tablist">
          {TAB_ORDER.map((tKey) => (
            <TabBtn
              key={tKey}
              role="tab"
              type="button"
              $active={tab === tKey}
              onClick={() => setTab(tKey)}
            >
              {t(locale, `shop_${tKey}`)}
            </TabBtn>
          ))}
        </Tabs>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <ItemGrid>
          {activeItems.length === 0 && <EmptyMsg>No items in this category.</EmptyMsg>}
          {activeItems.map((item) => {
            const owned = ownedIds.has(item.id)
            const canAfford = data && data.gold >= item.cost
            return (
              <ItemCard key={item.id}>
                <ItemIcon aria-hidden="true">{item.icon}</ItemIcon>
                <ItemInfo>
                  <ItemName>{item.name}</ItemName>
                  <ItemFlavor>{item.flavor}</ItemFlavor>
                  <ItemCost>{item.cost}g</ItemCost>
                </ItemInfo>
                <BuySection>
                  {owned ? (
                    <OwnedBadge>{t(locale, "shop_owned")}</OwnedBadge>
                  ) : (
                    <BuyBtn
                      type="button"
                      onClick={() => buy(item.id)}
                      disabled={buying === item.id || !canAfford}
                    >
                      {buying === item.id ? "..." : t(locale, "shop_buy")}
                    </BuyBtn>
                  )}
                </BuySection>
              </ItemCard>
            )
          })}
        </ItemGrid>
      </Modal>
    </Overlay>
  )
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  padding: 20px;
`

const Modal = styled.div`
  width: 100%;
  max-width: 920px;
  max-height: 92vh;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  animation: ${rise} 0.25s ease both;
`

const Header = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;
  background: ${({ theme }) => theme.colors.ink2};
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 23px;
  color: ${({ theme }) => theme.colors.goldBright};
  margin: 0;
`

const GoldDisplay = styled.span`
  margin-left: auto;
  font-size: 19px;
  color: ${({ theme }) => theme.colors.gold};
  font-variant-numeric: tabular-nums;
`

const CloseBtn = styled.button`
  background: none;
  border: none;
  padding: 0 6px;
  font-size: 27px;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  line-height: 1;
`

const Tabs = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`

const TabBtn = styled.button<{ $active: boolean }>`
  flex: 1;
  background: ${({ $active, theme }) => ($active ? theme.colors.panel : "transparent")};
  border: none;
  padding: 12px;
  font-size: 15px;
  color: ${({ $active, theme }) => ($active ? theme.colors.parchment : theme.colors.muted)};
  letter-spacing: 0.06em;
  cursor: pointer;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.gold : "transparent")};
  transition: all 0.15s;
`

const ErrorMsg = styled.p`
  margin: 10px 16px 0;
  color: ${({ theme }) => theme.colors.bloodBright};
  font-size: 14px;
`

const ItemGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
`

const EmptyMsg = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  padding: 30px 0;
`

const ItemCard = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const ItemIcon = styled.div`
  font-size: 29px;
  min-width: 40px;
  text-align: center;
`

const ItemInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const ItemName = styled.div`
  font-size: 17px;
  color: ${({ theme }) => theme.colors.parchment};
  font-weight: 600;
`

const ItemFlavor = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

const ItemCost = styled.div`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.gold};
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
`

const BuySection = styled.div`
  min-width: 70px;
  text-align: right;
`

const BuyBtn = styled(BtnPrimary)`
  font-size: 14px;
  padding: 6px 14px;
  min-width: 64px;
`

const OwnedBadge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border: 1px solid ${({ theme }) => theme.colors.sage};
  border-radius: 999px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.sage};
  letter-spacing: 0.06em;
`
