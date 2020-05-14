_ = require 'lodash'
require('ometa-js')

{ clientModel } = require './chai-sql'

ODataParser = require('@balena/odata-parser')
{ OData2AbstractSQL } = require('../out/odata-to-abstract-sql')
translator = new OData2AbstractSQL(clientModel)

{ skip } = describe
runExpectation = (describe, input, method, body, expectation) ->
	if !expectation?
		if !body?
			expectation = method
			method = 'GET'
		else
			expectation = body
		body = {}

	describe 'Parsing ' + method + ' ' + input + ' ' + JSON.stringify(body), ->
		if describe is skip
			return expectation()
		try
			input = ODataParser.parse(input)
			{ tree, extraBodyVars } = translator.match(input.tree, method, _.keys(body))
			_.assign(body, extraBodyVars)
		catch e
			expectation(e)
			return
		expectation(tree)

module.exports = runExpectation.bind(null, describe)
module.exports.skip = runExpectation.bind(null, describe.skip)
module.exports.only = runExpectation.bind(null, describe.only)