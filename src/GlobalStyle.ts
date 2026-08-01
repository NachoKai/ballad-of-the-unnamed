import { createGlobalStyle } from "styled-components"

export const GlobalStyle = createGlobalStyle`
  @import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap");

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    margin: 0;
    min-height: 100%;
  }

  * {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  *::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  html {
    background: ${({ theme }) => theme.colors.ink};
  }

  body {
    background:
      radial-gradient(1200px 700px at 50% -10%, #241d13 0%, transparent 60%),
      radial-gradient(900px 500px at 90% 110%, #1a1610 0%, transparent 55%),
      ${({ theme }) => theme.colors.ink};
    color: ${({ theme }) => theme.colors.parchment};
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: 19px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  h1,
  h2,
  h3 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 600;
    letter-spacing: 0.02em;
    color: ${({ theme }) => theme.colors.parchment};
    margin: 0;
    text-wrap: balance;
  }

  button {
    font-family: inherit;
    color: inherit;
    cursor: pointer;
  }

  @media (max-width: 680px) {
    body {
      font-size: 18px;
    }
  }
`
