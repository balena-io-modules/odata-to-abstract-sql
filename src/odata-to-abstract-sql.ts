import * as _ from 'lodash';
import * as memoize from 'memoizee';
import stringHash = require('string-hash');
import {
	isAliasNode,
	isFromNode,
	isSelectNode,
	isSelectQueryNode,
	isTableNode,
} from '@balena/abstract-sql-compiler';
import type {
	AbstractSqlQuery,
	AbstractSqlModel,
	AbstractSqlTable,
	Relationship,
	RelationshipInternalNode,
	DurationNode,
	AbstractSqlType,
	SelectNode,
	FromNode,
	WhereNode,
	OrderByNode,
	LimitNode,
	OffsetNode,
	NumberTypeNodes,
	FieldsNode,
	ValuesNode,
	ReferencedFieldNode,
	AliasNode,
	BooleanTypeNodes,
	SelectQueryNode,
	InNode,
	BindNode,
	CastNode,
	AbstractSqlField,
	TableNode,
	Definition as ModernDefinition,
	ResourceNode,
	UnionQueryNode,
	FromTypeNodes,
	FieldNode,
	CountNode,
	AddNode,
	LowerNode,
	UpperNode,
	ConcatenateNode,
	ReplaceNode,
	TrimNode,
	InsertQueryNode,
	DeleteQueryNode,
	UpdateQueryNode,
	DurationTypeNodes,
	CurrentTimestampNode,
	SubtractNode,
	MultiplyNode,
	DivideNode,
	NullNode,
	TextTypeNodes,
	AnyTypeNodes,
	ToTimeNode,
	ToDateNode,
	SubstringNode,
	StrictDateTypeNodes,
	StrictBooleanTypeNodes,
	AndNode,
	OrNode,
	GreaterThanNode,
	GreaterThanOrEqualNode,
	LessThanNode,
	LessThanOrEqualNode,
	IsNotDistinctFromNode,
	IsDistinctFromNode,
	UnknownTypeNodes,
	FromTypeNode,
} from '@balena/abstract-sql-compiler';
import type {
	ODataBinds,
	ODataQuery,
	SupportedMethod,
	ExpandPropertyPath,
	ResourceOptions,
	OrderByOption,
	OrderByPropertyPath,
	FilterOption,
	BindReference,
} from '@balena/odata-parser';
export type { ODataBinds, ODataQuery, SupportedMethod };

type InternalSupportedMethod = Exclude<SupportedMethod, 'MERGE'> | 'PUT-INSERT';

type RequiredAbstractSqlModelSubset = Pick<
	AbstractSqlModel,
	'synonyms' | 'relationships' | 'tables'
>;

type Dictionary<T> = Record<string, T>;

interface LegacyDefinition {
	extraBinds: ODataBinds;
	abstractSqlQuery: SelectQueryNode | UnionQueryNode | ResourceNode | TableNode;
}
export type Definition = ModernDefinition | LegacyDefinition;
const convertToModernDefinition = (
	definition: Definition,
): ModernDefinition => {
	if ('abstractSql' in definition) {
		return definition;
	}
	return {
		binds: definition.extraBinds,
		abstractSql: definition.abstractSqlQuery,
	};
};

interface Resource extends Omit<AbstractSqlTable, 'definition'> {
	tableAlias?: string;
	definition?: Definition;
	resourceMappings?: {
		[odataName: string]: [tableAlias: string, fieldName: string];
	};
	modifyResourceMappings?: Resource['resourceMappings'];
}
type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;
type RequiredField<T, F extends keyof T> = Overwrite<T, Required<Pick<T, F>>>;
type AliasedResource = RequiredField<Resource, 'tableAlias'>;

type AlreadyComputedFieldsLookup = { [resourceAndFieldName: string]: boolean };

export type ResourceFunction = (
	this: OData2AbstractSQL,
	property: {
		method: ['call', { method: string; args: any[] }];
		[key: string]: any;
	},
) => BooleanTypeNodes | { resource: Resource; name: string };

const comparison = {
	eq: 'IsNotDistinctFrom',
	ne: 'IsDistinctFrom',
	gt: 'GreaterThan',
	ge: 'GreaterThanOrEqual',
	lt: 'LessThan',
	le: 'LessThanOrEqual',
} as const;
const operations = {
	add: 'Add',
	sub: 'Subtract',
	mul: 'Multiply',
	div: 'Divide',
} as const;

const rewriteComputed = (
	computed: NonNullable<AbstractSqlField['computed']>,
	tableName: string,
	tableAlias: string,
) => {
	const rewrittenComputed = _.cloneDeep(computed);
	modifyAbstractSql(
		'ReferencedField',
		rewrittenComputed,
		(referencedField: ReferencedFieldNode) => {
			if (referencedField[1] === tableName) {
				referencedField[1] = tableAlias;
			}
		},
	);
	return rewrittenComputed;
};

const containsQueryOption = (opts?: object): boolean => {
	if (opts == null) {
		return false;
	}
	for (const key in opts) {
		if (key.startsWith('$')) {
			return true;
		}
	}
	return false;
};

const addNestedFieldSelect = (
	selectNode: SelectNode[1],
	fromNode: FromNode[1],
	fieldName: string,
	fieldNameAlias: string,
) => {
	let aliasName: string | undefined;
	let tableOrSubqueryNode: FromTypeNode[keyof FromTypeNode];
	if (isAliasNode(fromNode)) {
		tableOrSubqueryNode = fromNode[1];
		aliasName = fromNode[2];
	} else {
		tableOrSubqueryNode = fromNode;
	}
	if (isTableNode(tableOrSubqueryNode)) {
		selectNode.push([
			'Alias',
			['ReferencedField', aliasName ?? tableOrSubqueryNode[1], fieldName],
			fieldNameAlias,
		]);
		return;
	}
	if (!isSelectQueryNode(tableOrSubqueryNode)) {
		throw new Error(
			`Adding a nested field select to a subquery containing a ${tableOrSubqueryNode[0]} is not supported`,
		);
	}
	if (aliasName == null) {
		// This should never happen but we are checking it to make TS happy.
		throw new Error('Found unaliased SelectQueryNode');
	}
	const nestedSelectNode = tableOrSubqueryNode.find(isSelectNode);
	if (nestedSelectNode == null) {
		throw new Error(`Cannot find SelectNode in subquery`);
	}
	const nestedFromNode = tableOrSubqueryNode.find(isFromNode);
	if (nestedFromNode == null) {
		throw new Error(`Cannot find FromNode in subquery`);
	}
	addNestedFieldSelect(
		nestedSelectNode[1],
		nestedFromNode[1],
		fieldName,
		fieldNameAlias,
	);
	selectNode.push(['ReferencedField', aliasName, fieldNameAlias]);
};

class Query {
	public select: Array<
		| ReferencedFieldNode
		| FieldNode
		| CountNode
		| AliasNode<SelectNode[1][number]>
	> = [];
	public from: Array<FromNode[1]> = [];
	public where: Array<WhereNode[1]> = [];
	public extras: Array<
		FieldsNode | ValuesNode | OrderByNode | LimitNode | OffsetNode
	> = [];

	merge(otherQuery: Query): void {
		this.select = this.select.concat(otherQuery.select);
		this.from = this.from.concat(otherQuery.from);
		this.where = this.where.concat(otherQuery.where);
		this.extras = this.extras.concat(otherQuery.extras);
	}
	fromResource(
		odataToAbstractSql: OData2AbstractSQL,
		resource: AliasedResource,
		args: {
			extraBindVars: ODataBinds;
			bindVarsLength: number;
		} = odataToAbstractSql,
		bypassDefinition?: boolean,
		isModifyOperation?: boolean,
	): void {
		const tableRef = odataToAbstractSql.getTableReference(
			resource,
			args.extraBindVars,
			args.bindVarsLength,
			bypassDefinition,
			resource.tableAlias,
			isModifyOperation,
		);
		this.from.push(tableRef);
	}
	addNestedFieldSelect(fieldName: string, fieldNameAlias: string): void {
		if (this.from.length !== 1) {
			throw new Error(
				`Adding nested field SELECTs is only supported for queries with exactly 1 FROM clause. Found ${this.from.length}`,
			);
		}
		addNestedFieldSelect(this.select, this.from[0], fieldName, fieldNameAlias);
	}
	compile(queryType: 'SelectQuery'): SelectQueryNode;
	compile(queryType: 'InsertQuery'): InsertQueryNode;
	compile(queryType: 'UpdateQuery'): UpdateQueryNode;
	compile(queryType: 'DeleteQuery'): DeleteQueryNode;
	compile(
		queryType: 'SelectQuery' | 'InsertQuery' | 'UpdateQuery' | 'DeleteQuery',
	): SelectQueryNode | InsertQueryNode | UpdateQueryNode | DeleteQueryNode {
		const compiled: AbstractSqlType[] = [];
		let where = this.where;
		if (queryType === 'SelectQuery') {
			compiled.push(['Select', this.select] as SelectNode);
		}
		this.from.forEach((tableName) => {
			compiled.push(['From', tableName] as AbstractSqlQuery);
		});
		if (where.length > 0) {
			if (where.length > 1) {
				where = [['And', ...where]];
			}
			compiled.push(['Where', ...where]);
		}
		return [queryType, ...compiled, ...this.extras] as
			| SelectQueryNode
			| InsertQueryNode
			| UpdateQueryNode
			| DeleteQueryNode;
	}
}

export const sqlNameToODataName = memoize(
	(sqlName: string): string => sqlName.replace(/-/g, '__').replace(/ /g, '_'),
	{ primitive: true },
);
export const odataNameToSqlName = memoize(
	(odataName: string): string =>
		odataName.replace(/__/g, '-').replace(/_/g, ' '),
	{ primitive: true },
);

const modifyAbstractSql = <
	T extends BindNode | ReferencedFieldNode | ResourceNode,
>(
	match: T[0],
	abstractSql: AbstractSqlQuery,
	fn: (abstractSql: T) => void,
): void => {
	if (Array.isArray(abstractSql)) {
		if (abstractSql[0] === match) {
			fn(abstractSql as T);
		} else {
			abstractSql.forEach((abstractSqlComponent) => {
				modifyAbstractSql(match, abstractSqlComponent as AbstractSqlQuery, fn);
			});
		}
	}
};
export const rewriteBinds = (
	definition: ModernDefinition,
	existingBinds: ODataBinds,
	inc = 0,
): void => {
	const { binds } = definition;
	if (binds == null || binds.length === 0) {
		return;
	}
	inc += existingBinds.length;
	modifyAbstractSql(
		'Bind',
		definition.abstractSql as AbstractSqlQuery,
		(bind: BindNode) => {
			if (typeof bind[1] === 'number') {
				bind[1] += inc;
			}
		},
	);
	existingBinds.push(...binds);
};

export const isBindReference = (maybeBind: {
	[key: string]: unknown;
}): maybeBind is BindReference => {
	return (
		maybeBind != null &&
		typeof maybeBind === 'object' &&
		'bind' in maybeBind &&
		(typeof maybeBind.bind === 'string' || typeof maybeBind.bind === 'number')
	);
};

const isDynamicResource = (
	resource: Resource,
	alreadyComputedFieldsLookup: AlreadyComputedFieldsLookup,
): boolean => {
	return (
		resource.definition != null ||
		resource.fields.some(
			(f) =>
				f.computed != null &&
				!alreadyComputedFieldsLookup[resource.name + '$' + f.fieldName],
		)
	);
};

const addBodyKey = (
	resourceName: string,
	fieldName: string,
	bind: BindReference,
	bodyKeys: string[],
	extraBodyVars: Dictionary<BindReference>,
) => {
	// Add the id field value to the body if it doesn't already exist and we're doing an INSERT or a REPLACE.
	const qualifiedIDField = resourceName + '.' + fieldName;
	if (!bodyKeys.includes(qualifiedIDField) && !bodyKeys.includes(fieldName)) {
		bodyKeys.push(qualifiedIDField);
		extraBodyVars[qualifiedIDField] = bind;
	}
};

export class OData2AbstractSQL {
	private extraBodyVars: Dictionary<BindReference> = {};
	public extraBindVars = [] as unknown as ODataBinds;
	private resourceAliases: Dictionary<AliasedResource> = {};
	public defaultResource: Resource | undefined;
	public bindVarsLength = 0;
	private checkAlias: (alias: string) => string;
	private alreadyComputedFields: AlreadyComputedFieldsLookup = {};

	constructor(
		private clientModel: RequiredAbstractSqlModelSubset,
		private methods: Dictionary<ResourceFunction> = {},
		{ minimizeAliases = false } = {},
	) {
		const MAX_ALIAS_LENGTH = 63;
		const shortAliases = generateShortAliases(clientModel);
		this.checkAlias = memoize((alias: string) => {
			let aliasLength = alias.length;
			if (minimizeAliases === false && aliasLength <= MAX_ALIAS_LENGTH) {
				return alias;
			}
			alias = _(alias)
				.split('.')
				.map((part) => {
					if (minimizeAliases === false && aliasLength <= MAX_ALIAS_LENGTH) {
						return part;
					}
					aliasLength -= part.length;
					const shortAlias = _(part)
						.split('-')
						.map((part2) => {
							part2 = _(part2)
								.split(' ')
								.map((part3) => {
									const shortPart2 = shortAliases[part3];
									if (shortPart2) {
										return shortPart2;
									}
									return part3;
								})
								.join(' ');
							const shortPart = shortAliases[part2];
							if (shortPart) {
								return shortPart;
							}
							return part2;
						})
						.join('-');
					aliasLength += shortAlias.length;
					return shortAlias;
				})
				.join('.');

			if (aliasLength <= MAX_ALIAS_LENGTH) {
				return alias;
			}

			const hashStr = stringHash(alias).toString(36) + '$';
			return (
				hashStr + alias.slice(hashStr.length + alias.length - MAX_ALIAS_LENGTH)
			);
		});
	}
	match(
		path: ODataQuery,
		$method: SupportedMethod,
		bodyKeys: string[],
		bindVarsLength: number,
		methods?: OData2AbstractSQL['methods'],
	): {
		tree: AbstractSqlQuery;
		extraBodyVars: Dictionary<BindReference>;
		extraBindVars: ODataBinds;
	} {
		const method: InternalSupportedMethod =
			$method === 'MERGE' ? 'PATCH' : $method;
		const savedMethods = this.methods;
		try {
			if (methods != null) {
				this.methods = methods;
			}
			this.reset();
			this.bindVarsLength = bindVarsLength;
			let tree: AbstractSqlQuery;
			if (_.isEmpty(path)) {
				tree = ['$serviceroot'];
			} else if (['$metadata', '$serviceroot'].includes(path.resource)) {
				tree = [path.resource];
			} else {
				const query = this.PathSegment(method, bodyKeys, path);
				switch (method) {
					case 'PUT': {
						// For PUT the initial pass generates the update query,
						// so we run it through the parser a second time to get the insert query,
						// for a full upsert query
						this.putReset();
						const insertQuery = this.PathSegment('PUT-INSERT', bodyKeys, path);
						tree = [
							'UpsertQuery',
							insertQuery.compile('InsertQuery'),
							query.compile('UpdateQuery'),
						];
						break;
					}
					case 'GET':
						tree = query.compile('SelectQuery');
						break;
					case 'PATCH':
						tree = query.compile('UpdateQuery');
						break;
					case 'POST':
						tree = query.compile('InsertQuery');
						break;
					case 'DELETE':
						tree = query.compile('DeleteQuery');
						break;
					default:
						throw new SyntaxError(`Unknown method "${method}"`);
				}
			}
			return {
				tree,
				extraBodyVars: this.extraBodyVars,
				extraBindVars: this.extraBindVars,
			};
		} finally {
			this.methods = savedMethods;
		}
	}
	PathSegment(
		method: InternalSupportedMethod,
		bodyKeys: string[],
		path: ODataQuery,
	): Query {
		if (!path.resource) {
			throw new SyntaxError('Path segment must contain a resource');
		}
		const hasQueryOpts = containsQueryOption(path.options);

		const resource = this.Resource(path.resource, this.defaultResource);
		this.defaultResource = resource;
		const query = new Query();
		// For non-GETs we bypass definitions for the actual update/insert as we need to write to the base table
		const bypassDefinition = method !== 'GET';
		query.fromResource(
			this,
			resource,
			this,
			bypassDefinition,
			bypassDefinition,
		);

		// We can't use the ReferencedField rule as resource.idField is the model name (using spaces),
		// not the resource name (with underscores), meaning that the attempts to map fail for a custom id field with spaces.
		const referencedIdField: ReferencedFieldNode = [
			'ReferencedField',
			resource.tableAlias,
			resource.idField,
		];
		const pathKeyWhere = this.PathKey(method, path, resource, bodyKeys);
		let addPathKey = true;

		if (hasQueryOpts && path.options?.$expand) {
			this.Expands(resource, query, path.options.$expand.properties);
		}
		let bindVars: ReturnType<OData2AbstractSQL['BindVars']> | undefined;
		if (path.property) {
			const childQuery = this.PathSegment(method, bodyKeys, path.property);
			query.merge(childQuery);
			if (!path.property.resource) {
				throw new SyntaxError('PathSegment has a property without a resource?');
			}
			const navigation = this.NavigateResources(
				resource,
				path.property.resource,
			);
			query.where.push(navigation.where);
		} else if (path.link) {
			if (!path.link.resource) {
				throw new SyntaxError('PathSegment has a link without a resource?');
			}
			const linkResource = this.Resource(path.link.resource, resource);
			let aliasedField: AliasNode<ReferencedFieldNode>;
			let referencedField: ReferencedFieldNode;
			if (this.FieldContainedIn(linkResource.resourceName, resource)) {
				referencedField = this.ReferencedField(
					resource,
					linkResource.resourceName,
				);
				aliasedField = ['Alias', referencedField, linkResource.resourceName];
			} else if (this.FieldContainedIn(resource.resourceName, linkResource)) {
				referencedField = this.ReferencedField(
					linkResource,
					resource.resourceName,
				);
				aliasedField = ['Alias', referencedField, resource.resourceName];
			} else {
				throw new Error('Cannot navigate links');
			}
			if (path.link.key != null) {
				if (isBindReference(path.link.key)) {
					query.where.push([
						comparison.eq,
						referencedField,
						this.Bind(path.link.key),
					]);
				} else {
					throw new SyntaxError('Cannot use named keys with $links');
				}
			}
			query.select.push(aliasedField);
		} else if (
			method === 'PUT' ||
			method === 'PUT-INSERT' ||
			method === 'POST' ||
			method === 'PATCH'
		) {
			const resourceMapping = this.ResourceMapping(resource, true);
			bindVars = this.BindVars(
				method,
				bodyKeys,
				resource.resourceName,
				Object.entries(resourceMapping),
			);
			if (bindVars.length === 0 && method === 'PATCH') {
				throw new SyntaxError('PATCH requests must update at least one field');
			}
			query.extras.push(['Fields', bindVars.map((b) => b[0])]);

			// For updates/deletes that we use a `WHERE id IN (SELECT...)` subquery to apply options and in the case of a definition
			// we make sure to always apply it. This means that the definition will still be applied for these queries
			if (
				(hasQueryOpts ||
					isDynamicResource(resource, this.alreadyComputedFields) ||
					pathKeyWhere != null) &&
				(method === 'POST' || method === 'PUT-INSERT')
			) {
				// For insert statements we need to use an INSERT INTO ... SELECT * FROM (binds) WHERE ... style query
				const subQuery = new Query();
				subQuery.select = bindVars.map(
					(bindVar): ReferencedFieldNode => [
						'ReferencedField',
						'$insert',
						bindVar[0],
					],
				);

				subQuery.from.push([
					'Alias',
					[
						'SelectQuery',
						[
							'Select',
							(resource.modifyFields ?? resource.fields)
								.filter((field) => field.computed == null)
								.map((field): AliasNode<CastNode> => {
									const alias = field.fieldName;
									const bindVar = bindVars?.find((v) => v[0] === alias);
									const value = bindVar?.[1] ?? ['Null'];
									if (value === 'Default') {
										throw new Error(
											'Cannot use default values for a filtered insert query',
										);
									}
									return ['Alias', ['Cast', value, field.dataType], alias];
								}),
						],
					],
					'$insert',
				]);

				const bindVarSelectQuery: SelectQueryNode = [
					'SelectQuery',
					['Select', [['ReferencedField', '$insert', '*']]],
				];

				const unionResource = { ...resource };
				if (
					unionResource.definition == null ||
					typeof unionResource.definition !== 'object'
				) {
					unionResource.definition = {
						binds: [],
						abstractSql: bindVarSelectQuery,
					};
				} else {
					const rewrittenBindVars: ModernDefinition['binds'] = [];
					const definition: Definition = (unionResource.definition =
						this.rewriteDefinition(
							unionResource.definition,
							rewrittenBindVars,
							0,
						));
					definition.binds = rewrittenBindVars;

					if (
						definition.abstractSql[0] !== 'SelectQuery' &&
						definition.abstractSql[0] !== 'Table'
					) {
						throw new Error(
							'Only SelectQuery or Table definitions supported for inserts',
						);
					}
					const tableName = unionResource.modifyName ?? unionResource.name;
					const isTableBeingModified = (part: any): part is TableNode =>
						isTableNode(part) && part[1] === tableName;

					if (isTableBeingModified(definition.abstractSql)) {
						definition.abstractSql = bindVarSelectQuery;
					} else {
						let found = false;
						const replaceInsertTableNodeWithBinds = (
							part: SelectQueryNode[number],
						): SelectQueryNode[number] => {
							if (isFromNode(part)) {
								if (isTableBeingModified(part[1])) {
									found = true;
									return ['From', ['Alias', bindVarSelectQuery, tableName]];
								} else if (isAliasNode(part[1])) {
									const [, aliasedNode, alias] = part[1];
									if (isTableBeingModified(aliasedNode)) {
										found = true;
										return ['From', ['Alias', bindVarSelectQuery, alias]];
									} else if (aliasedNode[0] === 'SelectQuery') {
										return [
											'From',
											[
												'Alias',
												aliasedNode.map(
													replaceInsertTableNodeWithBinds,
												) as SelectQueryNode,
												alias,
											],
										];
									}
								}
							}
							return part;
						};
						definition.abstractSql = definition.abstractSql.map(
							replaceInsertTableNodeWithBinds,
						) as SelectQueryNode;
						if (!found) {
							throw new Error(
								'Could not replace table entry in definition for insert',
							);
						}
					}
				}
				const whereQuery = new Query();
				if (hasQueryOpts) {
					this.AddQueryOptions(resource, path, whereQuery);
				}
				whereQuery.fromResource(this, unionResource, this, false, true);
				addPathKey = false;
				if (pathKeyWhere != null) {
					whereQuery.where.push(pathKeyWhere);
				}
				subQuery.where.push(['Exists', whereQuery.compile('SelectQuery')]);

				query.extras.push(['Values', subQuery.compile('SelectQuery')]);
			} else {
				query.extras.push(['Values', bindVars.map((b) => b[1])]);
			}
		} else if (path.count) {
			this.AddCountField(path, query);
		} else if (method === 'GET') {
			this.AddSelectFields(path, query, resource);
		}

		if (addPathKey && pathKeyWhere != null) {
			query.where.push(pathKeyWhere);
		}

		// For updates/deletes that we use a `WHERE id IN (SELECT...)` subquery to apply options and in the case of a definition
		// we make sure to always apply it. This means that the definition will still be applied for these queries, for insert queries
		// this is handled when we set the 'Values'
		if (
			(hasQueryOpts ||
				isDynamicResource(resource, this.alreadyComputedFields)) &&
			(method === 'PUT' || method === 'PATCH' || method === 'DELETE')
		) {
			// For update/delete statements we need to use a  style query
			const subQuery = new Query();
			subQuery.fromResource(this, resource);
			subQuery.addNestedFieldSelect(resource.idField, '$modifyid');
			if (hasQueryOpts) {
				this.AddQueryOptions(resource, path, subQuery);
			}
			query.where.push([
				'In',
				referencedIdField,
				subQuery.compile('SelectQuery'),
			]);
		} else if (hasQueryOpts && method === 'GET') {
			this.AddQueryOptions(resource, path, query);
		}

		return query;
	}
	PathKey(
		method: InternalSupportedMethod,
		path: ODataQuery,
		resource: AliasedResource,
		bodyKeys: string[],
	): BooleanTypeNodes | undefined {
		const { key } = path;
		if (key != null) {
			if (method === 'PUT' || method === 'PUT-INSERT' || method === 'POST') {
				if (isBindReference(key)) {
					addBodyKey(
						resource.resourceName,
						resource.idField,
						key,
						bodyKeys,
						this.extraBodyVars,
					);
				} else {
					for (const [fieldName, bind] of Object.entries(key)) {
						addBodyKey(
							resource.resourceName,
							fieldName,
							bind,
							bodyKeys,
							this.extraBodyVars,
						);
					}
				}
			}
			if (isBindReference(key)) {
				const bind = this.Bind(key);
				const referencedField: ReferencedFieldNode = [
					'ReferencedField',
					resource.tableAlias,
					resource.idField,
				];
				return [comparison.eq, referencedField, bind];
			}
			const fieldNames = Object.keys(key);
			const sqlFieldNames = fieldNames.map(odataNameToSqlName).sort();

			const fields = sqlFieldNames.map((fieldName) => {
				const resourceField = resource.fields.find(
					(f) => f.fieldName === fieldName,
				);
				if (resourceField == null) {
					throw new SyntaxError('Specified non-existent field for path key');
				}
				return resourceField;
			});
			if (
				!(
					fields.length === 1 &&
					(fields[0].index === 'UNIQUE' || fields[0].index === 'PRIMARY KEY')
				) &&
				!resource.indexes.some((index) => {
					return (
						((index.type === 'UNIQUE' && index.predicate == null) ||
							index.type === 'PRIMARY KEY') &&
						sqlFieldNames.length === index.fields.length &&
						_.isEqual(index.fields.slice().sort(), sqlFieldNames)
					);
				})
			) {
				throw new SyntaxError(
					'Specified fields for path key that are not directly unique',
				);
			}

			const namedKeys = fieldNames.map((fieldName): BooleanTypeNodes => {
				const bind = this.Bind(key[fieldName]);
				const referencedField = this.ReferencedField(resource, fieldName);
				return [comparison.eq, referencedField, bind];
			});
			if (namedKeys.length === 1) {
				return namedKeys[0];
			}
			return ['And', ...namedKeys];
		}
	}
	Bind(bind: BindReference, optional: true): BindNode | undefined;
	Bind(bind: BindReference): BindNode;
	Bind(bind: BindReference, optional = false): BindNode | undefined {
		if (isBindReference(bind)) {
			return ['Bind', bind.bind];
		}
		if (optional) {
			return;
		}
		throw new SyntaxError(`Could not match bind reference`);
	}
	SelectFilter(filter: FilterOption, query: Query, resource: Resource) {
		this.AddExtraFroms(query, resource, filter);
		const where = this.BooleanMatch(filter);
		query.where.push(where);
	}
	OrderBy(orderby: OrderByOption, query: Query, resource: Resource) {
		this.AddExtraFroms(query, resource, orderby.properties);
		query.extras.push([
			'OrderBy',
			...this.OrderByProperties(orderby.properties),
		]);
	}
	OrderByProperties(orderings: OrderByPropertyPath[]): Array<OrderByNode[1]> {
		return orderings.map((ordering) => {
			const field = this.ReferencedProperty(ordering);
			return [ordering.order.toUpperCase(), field] as OrderByNode[1];
		});
	}
	BindVars(
		method: InternalSupportedMethod,
		bodyKeys: string[],
		resourceName: string,
		match: Array<[string, [string, string]]>,
	): Array<[string, 'Default' | BindNode]> {
		return match
			.map((field): [string, 'Default' | BindNode] | undefined => {
				const [fieldName, [, mappedFieldName]] = field;
				if (
					bodyKeys.includes(fieldName) ||
					bodyKeys.includes(resourceName + '.' + fieldName)
				) {
					return [mappedFieldName, ['Bind', resourceName, fieldName]];
				}
				// The body doesn't contain a bind var for this field.
				if (method === 'PUT') {
					return [mappedFieldName, 'Default'];
				}
			})
			.filter((f): f is NonNullable<typeof f> => f != null);
	}
	Resource(resourceName: string, parentResource?: Resource): AliasedResource {
		const resourceAlias = this.resourceAliases[resourceName];
		if (resourceAlias) {
			return resourceAlias;
		}
		let resource: AbstractSqlTable;
		if (parentResource) {
			const relationshipMapping = this.ResolveRelationship(
				parentResource,
				resourceName,
			);
			resource = this.clientModel.tables[relationshipMapping[1][0]];
		} else {
			let sqlName = odataNameToSqlName(resourceName);
			sqlName = this.Synonym(sqlName);
			resource = this.clientModel.tables[sqlName];
		}
		if (!resource) {
			throw new SyntaxError('Could not match resource');
		}
		let tableAlias;
		if (parentResource) {
			let resourceAlias2;
			if (resourceName.includes('__') && !resource.name.includes('-')) {
				// If we have a __ in the resource name to navigate then we used a verb for navigation,
				// and no dash in the resulting resource name means we don't have the verb in the alias, so we need to add it
				const verb = odataNameToSqlName(resourceName).split('-')[0];
				resourceAlias2 = verb + '-' + resource.name;
			} else {
				resourceAlias2 = resource.name;
			}
			tableAlias = parentResource.tableAlias + '.' + resourceAlias2;
		} else {
			tableAlias = resource.name;
		}
		return {
			...resource,
			tableAlias: this.checkAlias(tableAlias),
		};
	}
	FieldContainedIn(fieldName: string, resource: Resource): boolean {
		try {
			this.ResolveRelationship(resource, fieldName);
			return true;
		} catch (e) {
			if (e instanceof SyntaxError) {
				return false;
			}
			throw e;
		}
	}
	ResourceMapping(
		resource: Resource,
		modifyFields = false,
	): NonNullable<Resource['resourceMappings']> {
		const resourceMappingsProp =
			modifyFields === true && resource.modifyFields
				? 'modifyResourceMappings'
				: 'resourceMappings';
		if (resource[resourceMappingsProp] == null) {
			const tableAlias = resource.tableAlias ?? resource.name;
			const resourceMappings: Dictionary<[string, string]> = {};
			const fields =
				modifyFields === true && resource.modifyFields
					? resource.modifyFields
					: resource.fields;
			for (const { fieldName } of fields) {
				resourceMappings[sqlNameToODataName(fieldName)] = [
					tableAlias,
					fieldName,
				];
			}
			resource[resourceMappingsProp] = resourceMappings;
		}
		return resource[resourceMappingsProp];
	}
	ResolveRelationship(resource: string | Resource, relationship: string) {
		let resourceName;
		if (typeof resource === 'object') {
			resourceName = resource.resourceName;
		} else if (this.resourceAliases[resource]) {
			resourceName = this.resourceAliases[resource].resourceName;
		} else {
			resourceName = resource;
		}
		resourceName = this.Synonym(resourceName);
		const resourceRelations = this.clientModel.relationships[resourceName];
		if (!resourceRelations) {
			throw new SyntaxError(
				`Could not resolve relationship for '${resourceName}'`,
			);
		}
		const relationshipPath = _(relationship)
			.split('__')
			.map(odataNameToSqlName)
			.flatMap((sqlName) => this.Synonym(sqlName).split('-'))
			.value();
		const relationshipMapping = _.get(resourceRelations, relationshipPath);
		if (!relationshipMapping?.$) {
			throw new SyntaxError(
				`Could not resolve relationship mapping from '${resourceName}' to '${relationshipPath}'`,
			);
		}
		return relationshipMapping.$;
	}
	AddCountField(path: any, query: Query) {
		if (path.count) {
			query.select.push(['Alias', ['Count', '*'], '$count']);
		}
	}
	AddSelectFields(path: any, query: Query, resource: Resource) {
		let odataFieldNames: Array<
			Parameters<OData2AbstractSQL['AliasSelectField']>
		>;
		if (path.options?.$select?.properties) {
			this.AddExtraFroms(query, resource, path.options.$select.properties);
			odataFieldNames = path.options.$select.properties.map((prop: any) => {
				const field = this.Property(prop) as {
					resource: Resource;
					name: string;
				};
				const sqlName = odataNameToSqlName(field.name);
				const resourceField = field.resource.fields.find(
					({ fieldName }) => fieldName === sqlName,
				);
				return [field.resource, field.name, resourceField?.computed];
			});
		} else {
			odataFieldNames = resource.fields.map((field) => [
				resource,
				sqlNameToODataName(field.fieldName),
				field.computed,
			]);
		}
		const fields = _.differenceWith(
			odataFieldNames,
			query.select,
			(a, b) => a[1] === _.last(b),
		).map((args) => this.AliasSelectField(...args));
		query.select = query.select.concat(fields);
	}
	AliasSelectField(
		resource: Resource,
		fieldName: string,
		computed?: AbstractSqlQuery,
		alias: string = fieldName,
		// Setting this flag to true will ignore the lookup for alreadyComputedFields
		// and will compile the computed Field statement into the abstract SQL statement regardless
		forceCompilingComputedField = false,
	):
		| ReferencedFieldNode
		| AliasNode<ReferencedFieldNode>
		| AliasNode<AbstractSqlQuery> {
		const key = resource.name + '$' + fieldName;
		if (
			computed &&
			(!this.alreadyComputedFields[key] || forceCompilingComputedField)
		) {
			if (
				resource.tableAlias != null &&
				resource.tableAlias !== resource.name
			) {
				computed = rewriteComputed(
					computed,
					resource.name,
					resource.tableAlias,
				);
			}
			this.alreadyComputedFields[key] = true;
			return ['Alias', computed, alias];
		}
		const referencedField = this.ReferencedField(resource, fieldName);
		if (referencedField[2] === alias) {
			return referencedField;
		}
		return ['Alias', referencedField, alias];
	}
	ReferencedField(
		resource: Resource,
		resourceField: string,
	): ReferencedFieldNode {
		const mapping = this.ResourceMapping(resource);
		if (mapping[resourceField]) {
			return [
				'ReferencedField',
				mapping[resourceField][0],
				mapping[resourceField][1],
			];
		} else {
			const relationshipMapping = this.ResolveRelationship(
				resource,
				resourceField,
			);
			const tableAlias = resource.tableAlias ?? resource.name;
			if (
				relationshipMapping.length > 1 &&
				relationshipMapping[0] === resource.idField
			) {
				throw new SyntaxError(
					'Attempted to directly fetch a virtual field: "' +
						resourceField +
						'"',
				);
			}
			return ['ReferencedField', tableAlias, relationshipMapping[0]];
		}
	}
	BooleanMatch(match: any, optional: true): BooleanTypeNodes | undefined;
	BooleanMatch(match: any): BooleanTypeNodes;
	BooleanMatch(match: any, optional = false): BooleanTypeNodes | undefined {
		switch (match) {
			case true:
			case false:
				return ['Boolean', match];
			default:
				if (Array.isArray(match)) {
					const [type, ...rest] = match;
					switch (type) {
						case 'eq':
						case 'ne':
						case 'gt':
						case 'ge':
						case 'lt':
						case 'le': {
							const op1 = this.Operand(rest[0]);
							const op2 = this.Operand(rest[1]);
							return [comparison[type as keyof typeof comparison], op1, op2] as
								| IsNotDistinctFromNode
								| IsDistinctFromNode
								| GreaterThanNode
								| GreaterThanOrEqualNode
								| LessThanNode
								| LessThanOrEqualNode;
						}
						case 'and':
						case 'or':
							return [
								_.capitalize(type),
								...rest.map((v) => this.BooleanMatch(v)),
							] as AndNode | OrNode;
						case 'not': {
							const bool = this.BooleanMatch(rest[0]);
							return ['Not', bool];
						}
						case 'in': {
							return [
								'In',
								this.Operand(rest[0]),
								...rest[1].map((v: any) => this.Operand(v)),
							] as InNode;
						}
						case 'call': {
							const { method } = match[1];
							switch (method) {
								case 'contains':
								case 'endswith':
								case 'startswith':
								case 'isof':
								case 'substringof':
									return this.FunctionMatch(
										method,
										match,
									) as StrictBooleanTypeNodes;
								default:
									if (optional) {
										return;
									}
									throw new SyntaxError(`${method} is not a boolean function`);
							}
						}
						default:
							if (optional) {
								return;
							}
							throw new SyntaxError(`Boolean does not support ${type}`);
					}
				} else if (isBindReference(match)) {
					return this.Bind(match);
				} else {
					try {
						return this.ReferencedProperty(match);
					} catch (e) {
						if (optional) {
							return;
						}
						throw e;
					}
				}
		}
	}
	FunctionMatch<T extends string, U extends string>(
		name: T,
		match: any,
		sqlName: U,
	): [U, ...AnyTypeNodes[]];
	FunctionMatch<T extends string>(
		name: T,
		match: any,
	): [Capitalize<T>, ...AnyTypeNodes[]];
	FunctionMatch<T extends string, U extends string>(
		name: T,
		match: any,
		sqlName?: U,
	): [U | Capitalize<T>, ...AnyTypeNodes[]] {
		if (!Array.isArray(match) || match[0] !== 'call') {
			throw new SyntaxError('Not a function call');
		}
		const properties = match[1];
		if (properties.method !== name) {
			throw new SyntaxError('Unexpected function name');
		}
		const args = properties.args.map((v: any) => this.Operand(v));
		return [sqlName ?? (_.capitalize(name) as Capitalize<T>), ...args];
	}
	Operand(
		match: any,
	):
		| BindNode
		| NullNode
		| BooleanTypeNodes
		| NumberTypeNodes
		| TextTypeNodes
		| StrictDateTypeNodes
		| DurationTypeNodes {
		for (const matcher of [
			this.Bind,
			this.NullMatch,
			this.BooleanMatch,
			this.NumberMatch,
			this.TextMatch,
			this.DateMatch,
			this.DurationMatch,
			this.Math,
		]) {
			const result = matcher.call<
				OData2AbstractSQL,
				[matcher: any, optional: true],
				| BindNode
				| NullNode
				| BooleanTypeNodes
				| NumberTypeNodes
				| TextTypeNodes
				| StrictDateTypeNodes
				| DurationTypeNodes
				| undefined
			>(this, match, true);
			if (result) {
				return result;
			}
		}
		throw new SyntaxError('Could not match operand');
	}
	Math(
		match: any,
	): AddNode | SubtractNode | MultiplyNode | DivideNode | undefined {
		const [type, ...rest] = match;
		switch (type) {
			case 'add':
			case 'sub':
			case 'mul':
			case 'div':
				return [
					operations[type as keyof typeof operations],
					this.Operand(rest[0]),
					this.Operand(rest[1]),
				] as AddNode | SubtractNode | MultiplyNode | DivideNode;
			default:
				return;
		}
	}
	Lambda(resourceName: string, lambda: any): BooleanTypeNodes {
		const resourceAliases = this.resourceAliases;
		const defaultResource = this.defaultResource;
		try {
			const query = new Query();
			const resource = this.AddNavigation(
				query,
				this.defaultResource!,
				resourceName,
			);
			this.resourceAliases = { ...this.resourceAliases };
			this.resourceAliases[lambda.identifier] = resource;

			this.defaultResource = resource;
			this.AddExtraFroms(query, resource, lambda.expression);
			const filter = this.BooleanMatch(lambda.expression);
			if (lambda.method === 'any') {
				query.where.push(filter);
				return ['Exists', query.compile('SelectQuery')];
			} else if (lambda.method === 'all') {
				// We use `NOT EXISTS NOT ($filter)` to implement all, but we want to leave existing where components intact, as they are for joins
				query.where.push(['Not', filter]);
				return ['Not', ['Exists', query.compile('SelectQuery')]];
			} else {
				throw new SyntaxError(
					`Lambda method does not support ${lambda.method}`,
				);
			}
		} finally {
			// Make sure resourceAliases/defaultResource are always reset at the end.
			this.resourceAliases = resourceAliases;
			this.defaultResource = defaultResource;
		}
	}
	ReferencedProperty(match: any): BooleanTypeNodes {
		const prop = this.Property(match);
		if (Array.isArray(prop)) {
			// It's the result of a lambda
			return prop;
		} else {
			// Natively created timestamps in postgres have a microseconds precision
			// js has only milliseconds precision, thus retrieved timestamps may fail on eq, ne, gt, lt comparisons
			// furthermore retrieved timestamps should be truncated on database and not on the db abstraction layer
			// thus SBVR Date Time fields have to be truncated to millisecond precision
			// getting schema dataType from field mapping
			let fieldDefinition;
			const mapping = this.ResourceMapping(prop.resource);
			if (mapping[prop.name]) {
				fieldDefinition = prop.resource.fields.find(
					(f) => f.fieldName === mapping[prop.name][1],
				);

				// when date time field from schema => hardcoded DateTrunc
				// following abstractsql to sql compiler have to check engine to translate to proper eninge based sql query
				if (fieldDefinition?.dataType === 'Date Time') {
					// TODO: If we know we're specifically looking for a boolean property then we should reject properties we know are not booleans, until then the case makes it rely on the odata query being correct
					return [
						'DateTrunc',
						['EmbeddedText', 'milliseconds'],
						this.ReferencedField(prop.resource, prop.name),
					] as any as UnknownTypeNodes;
				}
			}

			return this.ReferencedField(prop.resource, prop.name);
		}
	}

	Method(
		prop: unknown & {
			method: ['call', { method: string; args: any[] }];
		},
	): BooleanTypeNodes | { resource: Resource; name: string } {
		if (!prop.method) {
			throw new SyntaxError('Method is missing method entry');
		}

		if (prop.method[0] !== 'call') {
			throw new SyntaxError(
				`Invalid value for method invocation: ${prop.method[0]}`,
			);
		}

		if (typeof prop.method[1] !== 'object') {
			throw new SyntaxError(
				`Invalid value for method invocation: ${prop.method[1]} should be an object`,
			);
		}

		const { method } = prop.method[1];
		if (!Object.prototype.hasOwnProperty.call(this.methods, method)) {
			throw new SyntaxError(`Method ${method} is unknown`);
		}

		return this.methods[method].call(this, prop);
	}

	Property(prop: any): BooleanTypeNodes | { resource: Resource; name: string } {
		if (!prop.name) {
			throw new SyntaxError('Property is missing name');
		}
		if (prop.property) {
			const defaultResource = this.defaultResource;
			let propResource;
			try {
				propResource = this.Resource(prop.name, this.defaultResource);
			} catch {
				// ignore
			}
			if (propResource) {
				try {
					this.defaultResource = propResource;
					return this.Property(prop.property);
				} finally {
					this.defaultResource = defaultResource;
				}
			} else {
				return this.Property(prop.property);
			}
		} else if (prop.method) {
			return this.Method(prop);
		} else if (prop.lambda) {
			return this.Lambda(prop.name, prop.lambda);
		} else if (prop.count) {
			const query = new Query();
			query.select.push(['Count', '*']);
			const aliasedResource = this.AddNavigation(
				query,
				this.defaultResource!,
				prop.name,
			);
			if (prop.options?.$filter) {
				const defaultResource = this.defaultResource;
				this.defaultResource = aliasedResource;
				this.SelectFilter(prop.options.$filter, query, aliasedResource);
				this.defaultResource = defaultResource;
			}
			return query.compile('SelectQuery');
		} else {
			return { resource: this.defaultResource!, name: prop.name };
		}
	}
	NumberMatch(match: any, optional: true): NumberTypeNodes | undefined;
	NumberMatch(match: any): NumberTypeNodes;
	NumberMatch(match: any, optional = false): NumberTypeNodes | undefined {
		if (typeof match === 'number') {
			return ['Number', match];
		} else if (Array.isArray(match) && match[0] === 'call') {
			const { method } = match[1];
			switch (method) {
				case 'indexof':
				case 'year':
				case 'month':
				case 'day':
				case 'hour':
				case 'minute':
				case 'second':
				case 'fractionalseconds':
				case 'totaloffsetminutes':
				case 'totalseconds':
				case 'round':
				case 'floor':
				case 'ceiling':
					return this.FunctionMatch(method, match) as NumberTypeNodes;
				case 'length':
					return this.FunctionMatch(
						'length',
						match,
						'CharacterLength',
					) as NumberTypeNodes;
				default:
					if (optional) {
						return;
					}
					throw new SyntaxError(`${method} is not a number function`);
			}
		} else if (isBindReference(match)) {
			return this.Bind(match);
		} else if (optional) {
			return;
		} else {
			throw new SyntaxError('Failed to match a Number entry');
		}
	}
	NullMatch(match: any): NullNode | undefined {
		if (match === null) {
			return ['Null'];
		}
	}
	TextMatch(match: any, optional: true): TextTypeNodes | undefined;
	TextMatch(match: any): TextTypeNodes;
	TextMatch(match: any, optional = false): TextTypeNodes | undefined {
		if (typeof match === 'string') {
			return ['Text', match];
		} else if (Array.isArray(match) && match[0] === 'call') {
			const { method } = match[1];
			switch (method) {
				case 'tolower':
					return this.FunctionMatch('tolower', match, 'Lower') as LowerNode;
				case 'toupper':
					return this.FunctionMatch('toupper', match, 'Upper') as UpperNode;
				case 'concat':
					return this.FunctionMatch(
						'concat',
						match,
						'Concatenate',
					) as ConcatenateNode;
				case 'trim':
				case 'replace':
					return this.FunctionMatch(method, match) as TrimNode | ReplaceNode;
				case 'substring': {
					const fn = this.FunctionMatch(method, match) as SubstringNode;
					// First parameter needs to be increased by 1.
					fn[2] = ['Add', fn[2], ['Number', 1]];
					return fn;
				}
				default:
					if (optional) {
						return;
					}
					throw new SyntaxError(`${method} is not a number function`);
			}
		} else if (optional) {
			return;
		} else {
			throw new SyntaxError('Failed to match a Text entry');
		}
	}
	DateMatch(match: any, optional: true): StrictDateTypeNodes | undefined;
	DateMatch(match: any): StrictDateTypeNodes;
	DateMatch(match: any, optional = false): StrictDateTypeNodes | undefined {
		if (_.isDate(match)) {
			return ['Date', match];
		} else if (Array.isArray(match) && match[0] === 'call') {
			const { method } = match[1];
			switch (method) {
				case 'now':
					return this.FunctionMatch(
						'now',
						match,
						'CurrentTimestamp',
					) as CurrentTimestampNode;
				case 'maxdatetime':
				case 'mindatetime':
					return this.FunctionMatch(method, match) as StrictDateTypeNodes;
				case 'date':
					return this.FunctionMatch('date', match, 'ToDate') as ToDateNode;
				case 'time':
					return this.FunctionMatch('time', match, 'ToTime') as ToTimeNode;
				default:
					if (optional) {
						return;
					}
					throw new SyntaxError(`${method} is not a date function`);
			}
		} else if (optional) {
			return;
		} else {
			throw new SyntaxError('Failed to match a Date entry');
		}
	}
	DurationMatch(match: DurationNode[1]): DurationTypeNodes | undefined {
		if (match == null || typeof match !== 'object') {
			return;
		}
		const duration = _(match)
			.pick('negative', 'day', 'hour', 'minute', 'second')
			.omitBy(_.isNil)
			.value();
		if (_(duration).omit('negative').isEmpty()) {
			return;
		}
		return ['Duration', duration];
	}
	Expands(
		resource: Resource,
		query: Query,
		expands: ExpandPropertyPath[],
	): void {
		const defaultResource = this.defaultResource;
		for (const expand of expands) {
			const navigation = this.NavigateResources(resource, expand.name);
			const expandResource = navigation.resource;
			{
				this.defaultResource = expandResource;
			}
			// We need to nest the expand query in order to be able to alias column names to match the OData version.
			const nestedExpandQuery = new Query();
			if (expand.property) {
				this.Expands(expandResource, nestedExpandQuery, [expand.property]);
			}
			if (expand.options?.$expand) {
				this.Expands(
					expandResource,
					nestedExpandQuery,
					expand.options.$expand.properties,
				);
			}
			nestedExpandQuery.fromResource(this, expandResource);
			if (expand.count) {
				this.AddCountField(expand, nestedExpandQuery);
			} else {
				this.AddSelectFields(expand, nestedExpandQuery, expandResource);
			}
			this.AddQueryOptions(expandResource, expand, nestedExpandQuery);

			this.defaultResource = defaultResource;

			nestedExpandQuery.where.push(navigation.where);

			const expandQuery = new Query();
			expandQuery.select.push([
				'Alias',
				['AggregateJSON', ['ReferencedField', expandResource.tableAlias, '*']],
				expand.name,
			]);
			expandQuery.from.push([
				'Alias',
				nestedExpandQuery.compile('SelectQuery'),
				expandResource.tableAlias,
			]);
			query.select.push([
				'Alias',
				expandQuery.compile('SelectQuery'),
				expand.name,
			]);
		}
	}
	AddQueryOptions(
		resource: Resource,
		path: ResourceOptions,
		query: Query,
	): void {
		if (!path.options) {
			return;
		}
		if (path.options.$filter) {
			this.SelectFilter(path.options.$filter, query, resource);
		}
		// When querying /$count, $orderby/$top/$skip must be ignored
		if (!path.count) {
			if (path.options.$orderby) {
				this.OrderBy(path.options.$orderby, query, resource);
			}
			if (path.options.$top) {
				const limit = this.NumberMatch(path.options.$top);
				query.extras.push(['Limit', limit]);
			}
			if (path.options.$skip) {
				const offset = this.NumberMatch(path.options.$skip);
				query.extras.push(['Offset', offset]);
			}
		}
	}
	NavigateResources(
		resource: Resource,
		navigation: string,
	): { resource: AliasedResource; where: BooleanTypeNodes } {
		const relationshipMapping = this.ResolveRelationship(resource, navigation);
		const linkedResource = this.Resource(navigation, resource);
		const tableAlias = resource.tableAlias ?? resource.name;
		const linkedTableAlias = linkedResource.tableAlias ?? linkedResource.name;
		return {
			resource: linkedResource,
			where: [
				'Equals',
				['ReferencedField', tableAlias, relationshipMapping[0]],
				['ReferencedField', linkedTableAlias, relationshipMapping[1][1]],
			],
		};
	}
	AddExtraFroms(query: Query, parentResource: Resource, match: any) {
		// TODO: try removing
		try {
			if (Array.isArray(match)) {
				match.forEach((v) => {
					this.AddExtraFroms(query, parentResource, v);
				});
			} else {
				let nextProp = match;
				let prop;
				while (
					// tslint:disable-next-line:no-conditional-assignment
					(prop = nextProp) &&
					prop.name &&
					prop.property?.name
				) {
					nextProp = prop.property;
					const resourceAlias = this.resourceAliases[prop.name];
					if (resourceAlias) {
						parentResource = resourceAlias;
					} else {
						parentResource = this.AddNavigation(
							query,
							parentResource,
							prop.name,
						);
					}
				}
				if (nextProp?.args) {
					this.AddExtraFroms(query, parentResource, prop.args);
				}
			}
		} catch {
			// ignore
		}
	}
	AddNavigation(
		query: Query,
		resource: Resource,
		extraResource: string,
	): AliasedResource {
		const navigation = this.NavigateResources(resource, extraResource);
		if (
			!query.from.some(
				(from) =>
					(isTableNode(from) && from[1] === navigation.resource.tableAlias) ||
					(isAliasNode(from) && from[2] === navigation.resource.tableAlias),
			)
		) {
			query.fromResource(this, navigation.resource);
			query.where.push(navigation.where);
			return navigation.resource;
		} else {
			throw new SyntaxError(
				`Could not navigate resources '${resource.name}' and '${extraResource}'`,
			);
		}
	}

	reset() {
		this.putReset();
		this.extraBodyVars = {};
		this.extraBindVars = [] as unknown as ODataBinds;
		this.alreadyComputedFields = {};
	}

	putReset() {
		this.resourceAliases = {};
		this.defaultResource = undefined;
	}
	Synonym(sqlName: string) {
		return _(sqlName)
			.split('-')
			.map((namePart) => {
				const synonym = this.clientModel.synonyms[namePart];
				if (synonym) {
					return synonym;
				}
				return namePart;
			})
			.join('-');
	}

	getTableReference(
		resource: Resource,
		extraBindVars: ODataBinds,
		bindVarsLength: number,
		bypassDefinition = false,
		tableAlias?: string,
		isModifyOperation?: boolean,
	): FromTypeNodes {
		const maybeAlias = (tableRef: FromTypeNodes): FromTypeNodes => {
			if (tableAlias == null) {
				return tableRef;
			}
			if (isTableNode(tableRef) && tableRef[1] === tableAlias) {
				// Alias if the table name doesn't match the desired alias
				return tableRef;
			} else if (isAliasNode(tableRef)) {
				if (tableRef[2] === tableAlias) {
					return tableRef;
				}
				return ['Alias', tableRef[1], tableAlias];
			} else {
				return ['Alias', tableRef, tableAlias];
			}
		};
		if (bypassDefinition !== true) {
			if (resource.definition) {
				const definition = this.rewriteDefinition(
					resource.definition,
					extraBindVars,
					bindVarsLength,
				);
				return maybeAlias(definition.abstractSql);
			}
			const computedFields = resource.fields.filter((f) => f.computed != null);
			if (computedFields.length > 0) {
				const computedFieldQuery = new Query();
				computedFieldQuery.select = [
					['Field', '*'],
					...computedFields.map((field) =>
						this.AliasSelectField(
							resource,
							sqlNameToODataName(field.fieldName),
							field.computed,
							field.fieldName,
							true,
						),
					),
				];
				computedFieldQuery.fromResource(
					this,
					{
						tableAlias: resource.name,
						...resource,
					},
					{
						extraBindVars,
						bindVarsLength,
					},
					true,
				);

				return maybeAlias(computedFieldQuery.compile('SelectQuery'));
			}
		}
		return maybeAlias([
			'Table',
			isModifyOperation && resource.modifyName
				? resource.modifyName
				: resource.name,
		]);
	}

	rewriteDefinition(
		definition: Definition,
		extraBindVars: ODataBinds,
		bindVarsLength: number,
	): ModernDefinition {
		const rewrittenDefinition = _.cloneDeep(
			convertToModernDefinition(definition),
		);
		rewriteBinds(rewrittenDefinition, extraBindVars, bindVarsLength);
		modifyAbstractSql(
			'Resource',
			rewrittenDefinition.abstractSql,
			(resource: ResourceNode) => {
				const resourceName = resource[1];
				const referencedResource = this.clientModel.tables[resourceName];
				if (!referencedResource) {
					throw new Error(`Could not resolve resource ${resourceName}`);
				}
				const tableRef = this.getTableReference(
					referencedResource,
					extraBindVars,
					bindVarsLength,
				);
				(resource as AbstractSqlType[]).splice(0, resource.length, ...tableRef);
			},
		);
		return rewrittenDefinition;
	}
}

const addAliases = (
	shortAliases: Dictionary<string>,
	origAliasParts: string[],
) => {
	const trie = {};
	const buildTrie = (aliasPart: string) => {
		let node: any = trie;
		for (let i = 0; i < aliasPart.length; i++) {
			if (node.$suffix) {
				node[node.$suffix[0]] = {
					$suffix: node.$suffix.slice(1),
				};
				delete node.$suffix;
			}
			const c = aliasPart[i];
			if (node[c]) {
				node = node[c];
			} else {
				node[c] = {
					$suffix: aliasPart.slice(i + 1),
				};
				return;
			}
		}
	};
	const traverseNodes = (str: string, node: any) => {
		if (node.$suffix) {
			const index = lowerCaseAliasParts.indexOf(str + node.$suffix);
			const origAliasPart = origAliasParts[index];
			shortAliases[origAliasPart] = origAliasPart.slice(0, str.length);
		} else {
			_.forEach(node, (value, key) => {
				traverseNodes(str + key, value);
			});
		}
	};

	const lowerCaseAliasParts = origAliasParts.map((origAliasPart) =>
		origAliasPart.toLowerCase(),
	);
	lowerCaseAliasParts.slice().sort().forEach(buildTrie);

	// Find the shortest unique alias for each term, using the trie.
	traverseNodes('', trie);
};

const getRelationships = (
	relationships: RequiredAbstractSqlModelSubset['relationships'] | Relationship,
	/** For recursive usage only */
	nestedRelationships: string[] = [],
): string[] => {
	const relationshipKeys = Object.keys(relationships);
	for (const key of relationshipKeys) {
		if (key !== '$') {
			nestedRelationships.push(key);
			getRelationships(
				(relationships as RelationshipInternalNode)[key],
				nestedRelationships,
			);
		}
	}
	return nestedRelationships;
};

const generateShortAliases = (clientModel: RequiredAbstractSqlModelSubset) => {
	const shortAliases: Dictionary<string> = {};

	const aliasParts = _(getRelationships(clientModel.relationships))
		.union(Object.keys(clientModel.synonyms))
		.reject((key) => key === '$')
		.value();

	// Add the first level of aliases, of names split by `-` and ` `, for short aliases on a word by word basis
	let origAliasParts = _(aliasParts)
		.flatMap((aliasPart) => aliasPart.split(/-| /))
		.uniq()
		.value();
	addAliases(shortAliases, origAliasParts);

	// Add the second level of aliases, of names that include a ` `, split by `-`, for short aliases on a verb/term basis
	origAliasParts = _(aliasParts)
		.flatMap((aliasPart) => aliasPart.split('-'))
		.filter((aliasPart) => aliasPart.includes(' '))
		.map((aliasPart) =>
			aliasPart
				.split(' ')
				.map((part) => shortAliases[part])
				.join(' '),
		)
		.uniq()
		.value();

	addAliases(shortAliases, origAliasParts);

	// Add the third level of aliases, of names that include a `-`, for short aliases on a fact type basis
	origAliasParts = _(aliasParts)
		.filter((aliasPart) => aliasPart.includes('-'))
		.map((aliasPart) =>
			aliasPart
				.split('-')
				.map((part) => shortAliases[part])
				.join('-'),
		)
		.uniq()
		.value();

	addAliases(shortAliases, origAliasParts);

	return shortAliases;
};
