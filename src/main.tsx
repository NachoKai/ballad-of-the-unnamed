import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "styled-components"
import App from "./App"
import { GlobalStyle } from "./GlobalStyle"
import { theme } from "./theme"
// TODO: remove once all class refs are migrated to styled-components
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
