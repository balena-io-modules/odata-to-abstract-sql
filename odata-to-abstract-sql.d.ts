import { AbstractSqlQuery, AbstractSqlModel } from '@resin/abstract-sql-compiler'
import { Dictionary } from 'lodash';

export interface Definition {
	extraBinds: OdataBinds,
	abstractSqlQuery: AbstractSqlQuery
}

declare module '@resin/abstract-sql-compiler' {
	interface AbstractSqlTable {
		definition?: Definition
	}
}

export type SupportedMethod = "GET" | "PUT" | "POST" | "PATCH" | "MERGE" | "DELETE" | "OPTIONS"
export type ODataQuery = Dictionary<any>
export interface ODataBinds extends Array<any> {
	[key: string]: any;
}

export const sqlNameToODataName: (sqlName: string) => string
export const odataNameToSqlName: (odataName: string) => string
export const rewriteBinds: (definition: Definition, existingBinds: ODataBinds, inc?: number) => void

export const OData2AbstractSQL: {
	createInstance: () => {
		match: (odata: ODataQuery, rule: 'Process', args: [
			SupportedMethod,
			string[], // bodyKeys
			number // existingBindVarsLength
		]) => {
			tree: AbstractSqlQuery,
			extraBodyVars: Dictionary<any>,
			extraBindVars: ODataBinds
		},
		setClientModel: (abstractSqlModel: AbstractSqlModel) => void
	}
}
