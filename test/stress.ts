import { expect } from 'chai';
import { pilotFields } from './chai-sql.js';
import test from './test.js';

const filterString = Array.from({ length: 2000 }, (_v, i) => 'id eq ' + i).join(
	' or ',
);
test('/pilot?$filter=' + filterString, (result) => {
	it('should select from pilot with a very long where', () => {
		expect(result).to.be.a.query.that.selects(pilotFields).from('pilot');
		// with a very long where.
	});
});
