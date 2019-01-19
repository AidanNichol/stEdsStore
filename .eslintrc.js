module.exports = {
  // I want to use babel-eslint for parsing!
  parser: 'babel-eslint',
  env: {
    // I write for browser
    browser: true,
    // in CommonJS
    node: true,
    es6: true,
    jest: true,
  },
  // React
  extends: 'eslint:recommended',
  // To give you an idea how to override rule options:
  rules: {
    'no-unused-vars': 0,
    // #"no-unused-vars-rest/no-unused-vars": [2, {
    //   "ignoreDestructuredVarsWithRest": true
    // }],
    quotes: [0, 'single'],
    'eol-last': [0],
    'no-mixed-requires': [0],
    'no-underscore-dangle': [0],
    'semi-spacing': [0],
    'no-console': [0],
    curly: [0],
    'new-cap': [0],
    'comma-dangle': [0],
    strict: 2,
  },
};