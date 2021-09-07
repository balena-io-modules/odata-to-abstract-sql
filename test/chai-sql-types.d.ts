// tslint:disable-next-line:no-namespace
declare namespace Chai {
	interface Assertion {
		query: Assertion;
		selects: (fields: any[]) => Assertion;
		inserts: Assertion;
		updates: Assertion;
		upserts: Assertion;
		deletes: Assertion;
		fields: (...fields: string[]) => Assertion;
		values: (...values: any[]) => Assertion;
		from: (
			table: string | string[],
			...tables: string[] | string[][]
		) => Assertion;
		where: (clause: any[]) => Assertion;
		orderby: (...clause: any[]) => Assertion;
		limit: (clause: any[]) => Assertion;
		offset: (clause: any[]) => Assertion;
	}
}
