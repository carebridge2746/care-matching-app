// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Function 은 Deno 에서 돌아간다. 앱 규칙(React/Expo)으로 검사할 대상이 아니다.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
