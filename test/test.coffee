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
			input = ODataParser.matchAll(input, 'OData')
			result = OData2AbstractSQL.match(input, 'Process', [method, body])
		catch e
			expectation(e)
			return
		expectation(result)

module.exports = runExpectation.bind(null, describe)
module.exports.skip = runExpectation.bind(null, describe.skip)
module.exports.only = runExpectation.bind(null, describe.only)