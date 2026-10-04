module.exports = {
	env: {
		es2022: true,
		node: true,
		jest: true,
	},
	extends: ['airbnb-base'],
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'commonjs',
	},
	rules: {
		'import/no-extraneous-dependencies': 'off',
		'linebreak-style': 'off',
	},
};
