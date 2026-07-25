import "styled-components"
import type { Theme } from "./theme"

declare module "styled-components" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends Theme {}
}

export { default as styled } from "styled-components"
