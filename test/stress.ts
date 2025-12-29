import { expect } from 'chai';
import { pilotFields } from './chai-sql.js';
import test from './test.js';
import { range } from 'es-toolkit';

const filterString = range(1, 2000)
	.map((i) => 'id eq ' + i)
	.join(' or ');
test('/pilot?$filter=' + filterString, (result: any) => {
	it('should select from pilot with a very long where', () => {
		expect(result).to.be.a.query.that.selects(pilotFields).from('pilot');
		// with a very long where.
	});
});
