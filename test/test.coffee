require('ometa-js')
ODataParser = require('odata-parser').ODataParser.createInstance()
OData2AbstractSQL = require('../odata-to-abstract-sql').OData2AbstractSQL.createInstance()
OData2AbstractSQL.clientModel = require('./client-model.json')

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
			expectation(result)
		catch e
			expectation(e)

module.exports = runExpectation.bind(null, describe)
module.exports.skip = runExpectation.bind(null, describe.skip)
module.exports.only = runExpectation.bind(null, describe.only)