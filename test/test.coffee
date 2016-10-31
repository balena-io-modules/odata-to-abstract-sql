_ = require 'lodash'
require('ometa-js')
ODataParser = require('@resin/odata-parser').ODataParser.createInstance()
OData2AbstractSQL = require('../odata-to-abstract-sql').OData2AbstractSQL.createInstance()
OData2AbstractSQL.setClientModel(require('./client-model.json'))

runExpectation = (describe, input, method, body, expectation) ->
	if !expectation?
		if !body?
			expectation = method
			method = 'GET'
		else
			expectation = body
		body = {}

	describe 'Parsing ' + method + ' ' + input + ' ' + JSON.stringify(body), ->
		try
			input = ODataParser.matchAll(input, 'Process')
			{ tree, extraBodyVars } = OData2AbstractSQL.match(input.tree, 'Process', [method, _.keys(body)])
			_.assign(body, extraBodyVars)
		catch e
			expectation(e)
			return
		expectation(tree)

module.exports = runExpectation.bind(null, describe)
module.exports.skip = runExpectation.bind(null, describe.skip)
module.exports.only = runExpectation.bind(null, describe.only)