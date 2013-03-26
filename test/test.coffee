require('ometa-js')
ODataParser = require('odata-parser').ODataParser.createInstance()
OData2AbstractSQL = require('../odata-to-abstract-sql').createInstance()

runExpectation = (describe, input, expectation) ->

	describe 'Parsing ' + input, ->
		try
			input = ODataParser.matchAll(input, 'OData')
			result = OData2AbstractSQL.match(input, 'Process')
		catch e
			console.error e, e.stack
			throw e

		# I had error code here, might add it for
		# negative testing later
		expectation(result)

module.exports = runExpectation.bind(null, describe)
module.exports.skip = runExpectation.bind(null, describe.skip)
module.exports.only = runExpectation.bind(null, describe.only)