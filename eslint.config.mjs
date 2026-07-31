import next from "eslint-config-next";

// Next.js 16 removed `next lint`; eslint-config-next now ships a native flat
// config array (core-web-vitals + typescript + ignores). Consume it directly
// instead of the legacy FlatCompat shim, then layer project rules on top.
const config = [
  ...next,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // New in react-hooks v6 (bundled with Next 16). The codebase uses the
      // established `useEffect(() => { void fetchData() }, [deps])` data-fetching
      // pattern app-wide; keep it visible as a warning rather than failing CI or
      // forcing a churny refactor of working components.
      "react-hooks/set-state-in-effect": "warn",
      // Ban dangerouslySetInnerHTML outright (stored-XSS vector). If a rich-HTML
      // surface is ever added, route it through a single reviewed <SafeHtml>
      // sanitizer boundary and disable this rule on that line only. Mirrors the
      // Semgrep rule `safar-no-dangerously-set-inner-html`. See extraction.md §5.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML is banned (XSS risk). Render plain text, or use a reviewed <SafeHtml> sanitizer boundary and disable this rule on that line only.",
        },
      ],
    },
  },
  {
    // TS-only rules: the @typescript-eslint plugin is registered by
    // eslint-config-next for these files and merged into this config object.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: ["node_modules", ".next", "dist", "build", "playwright-report", "test-results"],
  },
];

export default config;
