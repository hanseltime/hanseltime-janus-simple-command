module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    project: "./tsconfig.json"
  },
  plugins: ["@typescript-eslint", "deprecation", "prettier", "no-only-tests"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  rules: {
    // NOTE: if you're failing this check, you can run 'yarn lint --fix' and prettier rules will be applied
    "prettier/prettier": "error",
    "no-console": 1,
    "prefer-const": 0,
    "no-unused-vars": 0,
    eqeqeq: ["error", "smart"],
    "@typescript-eslint/no-unused-vars": ["warn", { vars: "local", args: "none" }],
    "@typescript-eslint/no-inferrable-types": 0,
    "@typescript-eslint/ban-ts-comment": 0,
    "@typescript-eslint/no-empty-function": 0,
    "@typescript-eslint/no-floating-promises": 2,
    "no-async-promise-executor": 0,
    "@typescript-eslint/no-explicit-any": 0,
    "@typescript-eslint/no-var-requires": 0,
    "@typescript-eslint/no-extra-semi": 0,
    "no-var": 1,
    "prefer-rest-params": 0,
    "deprecation/deprecation": "warn",
    "no-constant-condition": 1,
    "no-useless-catch": 1,
    "no-cond-assign": 0,
    "no-throw-literal": 1,
    "no-restricted-imports": [2, { patterns: ["bots/v2/actions/*"] }],
    "no-extra-boolean-cast": 0,
    "no-shadow": 1,
    "@typescript-eslint/ban-types": [
      2,
      {
        types: {
          "sequelize/types": { message: "this type doesn't work.", fixWith: "sequelize" }
        }
      }
    ],
    "no-restricted-globals": [
      "error",
      {
        name: "fdescribe",
        message: "Only use fdescribe for local testing, replace with describe() before committing"
      },
      {
        name: "fit",
        message: "Only use fit for local testing, replace with it() before committing"
      }
    ],
    "no-only-tests/no-only-tests": "error"
  },
  overrides: [
    {
      files: ["!src/bots/v2/portals/**"],
      rules: {
        "no-restricted-imports": "off"
      }
    }
  ]
  }