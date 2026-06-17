/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  ...require("@repo/eslint-config"),
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
    ]
  }
};
