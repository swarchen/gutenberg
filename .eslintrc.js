/**
 * External dependencies
 */
const { escapeRegExp } = require( 'lodash' );

/**
 * Internal dependencies
 */
const { version } = require( './package' );

/**
 * Regular expression string matching a SemVer string with equal major/minor to
 * the current package version. Used in identifying deprecations.
 *
 * @type {string}
 */
const majorMinorRegExp = escapeRegExp( version.replace( /\.\d+$/, '' ) ) + '(\\.\\d+)?';

module.exports = {
	root: true,
	extends: [
		'./eslint/config.js',
		'plugin:jest/recommended'
	],
	env: {
		'jest/globals': true,
	},
	globals: {
		wpApiSettings: true,
	},
	plugins: [
		'jest',
	],
	rules: {
		'no-restricted-syntax': [
			'error',
			{
				selector: 'ImportDeclaration[source.value=/^@wordpress\\u002F.+\\u002F/]',
				message: 'Path access on WordPress dependencies is not allowed.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^blocks$/]',
				message: 'Use @wordpress/blocks as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^components$/]',
				message: 'Use @wordpress/components as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^date$/]',
				message: 'Use @wordpress/date as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^editor$/]',
				message: 'Use @wordpress/editor as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^element$/]',
				message: 'Use @wordpress/element as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^i18n$/]',
				message: 'Use @wordpress/i18n as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^data$/]',
				message: 'Use @wordpress/data as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^utils$/]',
				message: 'Use @wordpress/utils as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^edit-post$/]',
				message: 'Use @wordpress/edit-post as import path instead.',
			},
			{
				selector: 'ImportDeclaration[source.value=/^viewport$/]',
				message: 'Use @wordpress/viewport as import path instead.',
			},
			{
				"selector": "ImportDeclaration[source.value=/^core-data$/]",
				"message": "Use @wordpress/core-data as import path instead."
			},
			{
				selector: 'CallExpression[callee.name="deprecated"] Property[key.name="version"][value.value=/' + majorMinorRegExp + '/]',
				message: 'Deprecated functions must be removed before releasing this version.',
			},
		],
	},
};
