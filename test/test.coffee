_ = require 'lodash'
require('ometa-js')

{ clientModel } = require './chai-sql'

ODataParser = require('@resin/odata-parser')
OData2AbstractSQL = require('../odata-to-abstract-sql').OData2AbstractSQL.createInstance()
OData2AbstractSQL.setClientModel(clientModel)

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
			{ tree, extraBodyVars } = OData2AbstractSQL.match(input.tree, 'Process', [method, _.keys(body)])
			_.assign(body, extraBodyVars)
		catch e
			expectation(e)
			return
		expectation(tree)

module.exports = runExpectation.bind(null, describe)
module.exports.skip = runExpectation.bind(null, describe.skip)
module.exports.only = runExpectation.bind(null, describe.only)