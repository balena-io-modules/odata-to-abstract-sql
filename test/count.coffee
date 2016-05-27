expect = require('chai').expect
{operandToAbstractSQL, pilotFields} = require('./chai-sql')
test = require('./test')


test '/pilot?$count', (result) ->
	it 'should select count(*) from pilot', ->
		expect(result).to.be.a.query.that.
			selects([['Count', '*']]).
			from('pilot')
			


test '/pilot?$count=true', (result) ->
	it 'should select count(*) from pilot', ->
		expect(result).to.be.a.query.that.
			selects([['Count', '*']]).
			from('pilot')
			


test '/pilot?$count=*', (result) ->
	it 'should select count(*) from pilot', ->
		expect(result).to.be.a.query.that.
			selects([['Count', '*']]).
			from('pilot')

test '/pilot(5)?$count', (result) ->
        it 'should select count(*) from pilot where pilot/id eq 5', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot').
                        where(['Equals',
                                ['ReferencedField', 'pilot', 'id'],
                                ['Number', 5]
                              ])

test '/pilot(5)?$count=true', (result) ->
        it 'should select count(*) from pilot where pilot/id eq 5', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot').
                        where(['Equals',
                                ['ReferencedField', 'pilot', 'id'],
                                ['Number', 5]
                              ])

test '/pilot(5)?$count=*', (result) ->
        it 'should select count(*) from pilot where pilot/id eq 5', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot').
                        where(['Equals',
                                ['ReferencedField', 'pilot', 'id'],
                                ['Number', 5]
                              ])

test '/pilot?$filter=id eq 5&$count', (result) ->
        it 'should selct count(*) from pilot where id eq 5', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot').
                        where(['Equals',
                                ['ReferencedField', 'pilot', 'id'],
                                ['Number', 5]
                              ])

test '/pilot?$filter=id eq 5&$count=true', (result) ->
        it 'should selct count(*) from pilot where id eq 5', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot').
                        where(['Equals',
                                ['ReferencedField', 'pilot', 'id'],
                                ['Number', 5]
                              ])


test '/pilot?$filter=id eq 5&$count=*', (result) ->
        it 'should select count(*) from pilot where id eq 5', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot').
                        where(['Equals',
                                ['ReferencedField', 'pilot', 'id'],
                                ['Number', 5]
                              ])

test '/pilot?$select=licence/id&$count', (result) ->
        it 'should select count(*) licence for pilots', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot', 'licence').
                        where(['Equals',
                                ['ReferencedField', 'licence', 'id'],
                                ['ReferencedField', 'pilot', 'licence']
                        ])

test '/pilot?$select=licence/id&$count=true', (result) ->
        it 'should select count(*) licence for pilots', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot', 'licence').
                        where(['Equals',
                                ['ReferencedField', 'licence', 'id'],
                                ['ReferencedField', 'pilot', 'licence']
                        ])

test '/pilot?$select=licence/id&$count=*', (result) ->
        it 'should select count(*) licence for pilots', ->
                expect(result).to.be.a.query.that.
                        selects([['Count', '*']]).
                        from('pilot', 'licence').
                        where(['Equals',
                                ['ReferencedField', 'licence', 'id'],
                                ['ReferencedField', 'pilot', 'licence']
                        ])

