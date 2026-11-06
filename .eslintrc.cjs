module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended"],
  env: { node: true, es2022: true },
  rules: { "no-undef": "off", "no-unused-vars": "off" },
};
