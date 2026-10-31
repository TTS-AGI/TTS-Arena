import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Next 16 removed `next lint`; eslint-config-next now ships native flat configs.
const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  // Must come last: disables ESLint rules that conflict with Prettier.
  prettier,
  {
    rules: {
      // New in eslint-plugin-react-hooks 7. The flagged spots read client-only
      // state (localStorage/session) after hydration, which is intentional.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "drizzle/**"],
  },
];

export default eslintConfig;
