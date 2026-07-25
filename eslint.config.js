import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"
import prettierConfig from "eslint-config-prettier"

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactPlugin.configs.flat?.recommended,
  reactPlugin.configs.flat?.["jsx-runtime"],
  prettierConfig,
  {
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: reactHooksPlugin.configs.recommended.rules,
    settings: {
      react: {
        version: "19.0",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "react/prop-types": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
)
