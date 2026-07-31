module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'module',
  },
  plugins: ['prettier'],
  extends: [
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
    jest: true,
  },
  rules: {
    'prettier/prettier': 'error',
  },
  ignorePatterns: ['dist/', '.next/', 'node_modules/', '*.js'],
};
