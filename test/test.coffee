require('ometa-js')
{ODataParser} = require('odata-parser')
OData2AbstractSQL = require('../odata-to-abstract-sql')

module.exports = (input, expectation) ->

	describe("Parsing " + input, () ->
		try
			input = ODataParser.matchAll(input, 'OData')
			result = OData2AbstractSQL.match(input, 'Process')
		catch e
			console.error e, e.stack
			throw e

		# I had error code here, might add it for
		# negative testing later
		expectation(result)
	)
