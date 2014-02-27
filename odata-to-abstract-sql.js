!function(root, factory) {
    "function" == typeof define && define.amd ? define([ "require", "exports", "ometa-core", "lodash" ], factory) : "object" == typeof exports ? factory(require, exports, require("ometa-js").core) : factory(function(moduleName) {
        return root[moduleName];
    }, root, root.OMeta);
}(this, function(require, exports, OMeta) {
    _ = require("lodash");
    _.mixin({
        capitalize: function(string) {
            return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
        }
    });
    var Query = function() {
        _.extend(this, {
            select: [],
            from: [],
            where: [],
            extras: []
        });
    };
    Query.prototype.merge = function(otherQuery) {
        this.select = this.select.concat(otherQuery.select);
        this.from = this.from.concat(otherQuery.from);
        this.where = this.where.concat(otherQuery.where);
        this.extras = this.extras.concat(otherQuery.extras);
    };
    Query.prototype.compile = function(queryType) {
        var compiled = [ queryType ], where = this.where;
        "SelectQuery" === queryType && compiled.push([ "Select", this.select ]);
        _.each(this.from, function(tableName) {
            compiled.push([ "From", tableName ]);
        });
        if (where.length > 0) {
            where.length > 1 && (where = [ [ "And" ].concat(where) ]);
            compiled.push([ "Where" ].concat(where));
        }
        return compiled.concat(this.extras);
    };
    var OData2AbstractSQL = exports.OData2AbstractSQL = OMeta._extend({
        Process: function(method, body) {
            var $elf = this, _fromIdx = this.input.idx, path, query, queryType;
            path = this.anything();
            this._apply("end");
            return this._or(function() {
                this._pred(_.isEmpty(path));
                return [ "$serviceroot" ];
            }, function() {
                this._pred(_.contains([ "$metadata", "$serviceroot" ], path.resource));
                return [ path.resource ];
            }, function() {
                query = this._applyWithArgs("PathSegment", method, body, path);
                queryType = this._or(function() {
                    this._pred("GET" == method);
                    return "SelectQuery";
                }, function() {
                    this._pred("PUT" == method);
                    return "UpsertQuery";
                }, function() {
                    this._pred("PATCH" == method || "MERGE" == method);
                    return "UpdateQuery";
                }, function() {
                    this._pred("POST" == method);
                    return "InsertQuery";
                }, function() {
                    this._pred("DELETE" == method);
                    return "DeleteQuery";
                });
                return query.compile(queryType);
            });
        },
        PathSegment: function(method, body, path) {
            var $elf = this, _fromIdx = this.input.idx, aliasedField, childQuery, fields, filter, key, limit, linkResource, navigationWhere, offset, orderby, propertyResource, qualifiedIDField, query, referencedField, resource, resourceMapping, select;
            this._pred(path.resource);
            resource = this._applyWithArgs("Resource", path.resource);
            this.defaultResource = path.resource;
            query = new Query();
            query.from.push(resource.tableName);
            this._opt(function() {
                this._pred(path.key);
                qualifiedIDField = resource.modelName + "." + resource.idField;
                this._opt(function() {
                    this._pred(!body[qualifiedIDField] && !body[resource.idField]);
                    return body[qualifiedIDField] = path.key;
                });
                key = this._or(function() {
                    return this._applyWithArgs("Number", path.key);
                }, function() {
                    return this._applyWithArgs("Text", path.key);
                });
                return query.where.push([ "Equals", [ "ReferencedField", resource.tableName, resource.idField ], key ]);
            });
            this._opt(function() {
                this._pred(path.options);
                this._pred(path.options.$expand);
                return this._applyWithArgs("Expands", resource, query, path.options.$expand.properties);
            });
            this._or(function() {
                this._pred(path.property);
                childQuery = this._applyWithArgs("PathSegment", method, body, path.property);
                query.merge(childQuery);
                this._or(function() {
                    return this._pred(path.property.resource);
                }, function() {
                    return function() {
                        throw "PathSegment has a property without a resource?";
                    }.call(this);
                });
                propertyResource = this._applyWithArgs("Resource", path.property.resource);
                navigationWhere = this._applyWithArgs("NavigateResources", resource, propertyResource);
                return query.where.push(navigationWhere);
            }, function() {
                this._pred(path.link);
                this._or(function() {
                    return this._pred(path.link.resource);
                }, function() {
                    return function() {
                        throw "PathSegment has a link without a resource?";
                    }.call(this);
                });
                linkResource = this._applyWithArgs("Resource", path.link.resource);
                aliasedField = this._or(function() {
                    this._applyWithArgs("FieldContainedIn", linkResource.resourceName, resource);
                    referencedField = this._applyWithArgs("ReferencedField", resource.resourceName, linkResource.resourceName);
                    return [ referencedField, linkResource.resourceName ];
                }, function() {
                    this._applyWithArgs("FieldContainedIn", resource.resourceName, linkResource);
                    referencedField = this._applyWithArgs("ReferencedField", linkResource.resourceName, resource.resourceName);
                    return [ referencedField, resource.resourceName ];
                }, function() {
                    return function() {
                        throw "Cannot navigate links";
                    }.call(this);
                });
                this._opt(function() {
                    this._pred(path.link.key);
                    return query.where.push([ "Equals", referencedField, [ "Number", path.link.key ] ]);
                });
                return query.select.push(aliasedField);
            }, function() {
                this._pred("PUT" == method || "POST" == method || "PATCH" == method || "MERGE" == method);
                resourceMapping = this._applyWithArgs("ResourceMapping", resource.resourceName);
                fields = this._applyWithArgs("Fields", method, body, resource.resourceName, _.pairs(resourceMapping));
                return query.extras.push([ "Fields", fields ]);
            }, function() {
                this._pred(path.options);
                this._pred(path.options.$select);
                this._applyWithArgs("AddExtraFroms", path.options.$select.properties, query, resource);
                fields = this._applyWithArgs("Properties", path.options.$select.properties);
                fields = _(fields).reject(function(field) {
                    return _.any(query.select, function(existingField) {
                        return existingField[existingField.length - 1] == field.name;
                    });
                }, this).map(function(field) {
                    return this.AliasSelectField(field.resource, field.name);
                }, this).value();
                return query.select = query.select.concat(fields);
            }, function() {
                select = this._applyWithArgs("AddSelectFields", resource.resourceName, query.select);
                return query.select = select;
            });
            this._or(function() {
                return this._pred(!path.options);
            }, function() {
                this._or(function() {
                    return this._pred(!path.options.$filter);
                }, function() {
                    this._applyWithArgs("AddExtraFroms", path.options.$filter, query, resource);
                    filter = this._applyWithArgs("Boolean", path.options.$filter);
                    return query.where.push(filter);
                });
                this._or(function() {
                    return this._pred(!path.options.$orderby);
                }, function() {
                    this._applyWithArgs("AddExtraFroms", path.options.$orderby.properties, query, resource);
                    orderby = this._applyWithArgs("OrderBy", path.options.$orderby.properties);
                    return query.extras.push([ "OrderBy" ].concat(orderby));
                });
                this._or(function() {
                    return this._pred(!path.options.$top);
                }, function() {
                    limit = this._applyWithArgs("Number", path.options.$top);
                    return query.extras.push([ "Limit", limit ]);
                });
                return this._or(function() {
                    return this._pred(!path.options.$skip);
                }, function() {
                    offset = this._applyWithArgs("Number", path.options.$skip);
                    return query.extras.push([ "Offset", offset ]);
                });
            });
            return query;
        },
        OrderBy: function() {
            var $elf = this, _fromIdx = this.input.idx, field, orderby, ordering;
            this._form(function() {
                return orderby = this._many1(function() {
                    ordering = this.anything();
                    field = this._applyWithArgs("ReferencedProperty", ordering);
                    return [ ordering.order.toUpperCase(), field ];
                });
            });
            return orderby;
        },
        Fields: function(method, body, resourceName) {
            var $elf = this, _fromIdx = this.input.idx, fieldName, fields, mappedFieldName, mappedTableName;
            this._form(function() {
                return fields = this._many(function() {
                    return this._or(function() {
                        this._form(function() {
                            this._applyWithArgs("exactly", "_name");
                            return this.anything();
                        });
                        return null;
                    }, function() {
                        this._form(function() {
                            fieldName = this.anything();
                            return this._form(function() {
                                mappedTableName = this.anything();
                                return mappedFieldName = this.anything();
                            });
                        });
                        return this._or(function() {
                            this._pred(!("PATCH" !== method && "MERGE" !== method && "POST" !== method || body && (body.hasOwnProperty(fieldName) || body.hasOwnProperty(resourceName + "." + fieldName))));
                            return null;
                        }, function() {
                            return [ mappedFieldName, [ "Bind", resourceName, fieldName ] ];
                        });
                    });
                });
            });
            return _.compact(fields);
        },
        ResolveResourceAlias: function(aliasName) {
            var $elf = this, _fromIdx = this.input.idx;
            return this.resourceAliases[aliasName] || aliasName;
        },
        Resource: function(resourceName) {
            var $elf = this, _fromIdx = this.input.idx, resource, resourceMapping, resourceName;
            return this._or(function() {
                resourceName = this._applyWithArgs("ResolveResourceAlias", resourceName);
                resource = this.clientModel.resources[resourceName];
                this._pred(resource);
                this._or(function() {
                    return this._pred(resource.tableName);
                }, function() {
                    resourceMapping = this._applyWithArgs("ResourceMapping", resourceName);
                    return resource.tableName = resourceMapping._name;
                });
                return resource;
            }, function() {
                return function() {
                    throw "Unknown resource: " + resourceName;
                }.call(this);
            });
        },
        FieldContainedIn: function(resourceName, table) {
            var $elf = this, _fromIdx = this.input.idx, mappedField, mapping;
            mapping = this._applyWithArgs("ResourceMapping", table.resourceName);
            mappedField = mapping[resourceName];
            this._pred(mappedField);
            this._pred(mappedField[0] == table.tableName);
            return this._pred(_.any(table.fields, {
                fieldName: mappedField[1]
            }));
        },
        ResourceMapping: function(resourceName) {
            var $elf = this, _fromIdx = this.input.idx, resourceName;
            return this._or(function() {
                resourceName = this._applyWithArgs("ResolveResourceAlias", resourceName);
                this._pred(this.clientModel.resourceToSQLMappings[resourceName]);
                return this.clientModel.resourceToSQLMappings[resourceName];
            }, function() {
                return function() {
                    throw "Unknown resource: " + resourceName;
                }.call(this);
            });
        },
        AddSelectFields: function(resourceName, select) {
            var $elf = this, _fromIdx = this.input.idx, resourceMapping;
            resourceMapping = this._applyWithArgs("ResourceMapping", resourceName);
            return select.concat(_(resourceMapping).keys().reject(function(fieldName) {
                return "_name" === fieldName || _.any(select, function(existingField) {
                    return existingField[existingField.length - 1] == fieldName;
                });
            }).map(_.bind(this.AliasSelectField, this, resourceName)).value());
        },
        AliasSelectField: function(resourceName, fieldName) {
            var $elf = this, _fromIdx = this.input.idx, referencedField;
            referencedField = this._applyWithArgs("ReferencedField", resourceName, fieldName);
            return this._or(function() {
                this._pred(referencedField[2] === fieldName);
                return referencedField;
            }, function() {
                return [ referencedField, fieldName ];
            });
        },
        ReferencedField: function(resourceTable, resourceField) {
            var $elf = this, _fromIdx = this.input.idx, mapping;
            mapping = this._applyWithArgs("ResourceMapping", resourceTable);
            return this._or(function() {
                this._pred(mapping[resourceField]);
                return [ "ReferencedField" ].concat(mapping[resourceField]);
            }, function() {
                console.error("Unknown mapping: ", mapping, resourceTable, resourceField);
                return function() {
                    throw "Unknown mapping: " + resourceTable + " : " + resourceField;
                }.call(this);
            });
        },
        Boolean: function() {
            var $elf = this, _fromIdx = this.input.idx, bool, op1, op2, operation;
            return this._or(function() {
                this._form(function() {
                    return bool = this._or(function() {
                        operation = function() {
                            switch (this.anything()) {
                              case "eq":
                                return "Equals";

                              case "ge":
                                return "GreaterThanOrEqual";

                              case "gt":
                                return "GreaterThan";

                              case "le":
                                return "LessThanOrEqual";

                              case "lt":
                                return "LessThan";

                              case "ne":
                                return "NotEquals";

                              default:
                                throw this._fail();
                            }
                        }.call(this);
                        op1 = this._apply("Operand");
                        op2 = this._apply("Operand");
                        return [ operation, op1, op2 ];
                    }, function() {
                        operation = function() {
                            switch (this.anything()) {
                              case "and":
                                return "And";

                              case "or":
                                return "Or";

                              default:
                                throw this._fail();
                            }
                        }.call(this);
                        op1 = this._apply("Boolean");
                        op2 = this._many1(function() {
                            return this._apply("Boolean");
                        });
                        return [ operation, op1 ].concat(op2);
                    });
                });
                return bool;
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "not");
                    return bool = this._apply("Boolean");
                });
                return [ "Not", bool ];
            }, function() {
                return this._apply("ReferencedProperty");
            }, function() {
                return this._apply("BooleanFunction");
            });
        },
        BooleanFunction: function() {
            var $elf = this, _fromIdx = this.input.idx;
            return this._or(function() {
                return this._applyWithArgs("Function", "substringof");
            }, function() {
                return this._applyWithArgs("Function", "startswith");
            }, function() {
                return this._applyWithArgs("Function", "endswith");
            });
        },
        NumberFunction: function() {
            var $elf = this, _fromIdx = this.input.idx;
            return this._or(function() {
                return this._applyWithArgs("AliasedFunction", "length", "CharacterLength");
            }, function() {
                return this._applyWithArgs("Function", "indexof");
            }, function() {
                return this._applyWithArgs("Function", "round");
            }, function() {
                return this._applyWithArgs("Function", "floor");
            }, function() {
                return this._applyWithArgs("Function", "ceiling");
            });
        },
        TextFunction: function() {
            var $elf = this, _fromIdx = this.input.idx, fn;
            return this._or(function() {
                return this._applyWithArgs("Function", "replace");
            }, function() {
                fn = this._applyWithArgs("Function", "substring");
                fn[2][1]++;
                return fn;
            }, function() {
                return this._applyWithArgs("Function", "tolower");
            }, function() {
                return this._applyWithArgs("Function", "toupper");
            }, function() {
                return this._applyWithArgs("Function", "trim");
            }, function() {
                return this._applyWithArgs("Function", "concat");
            });
        },
        AliasedFunction: function(odataName, sqlName) {
            var $elf = this, _fromIdx = this.input.idx, fn;
            fn = this._applyWithArgs("Function", odataName);
            return [ sqlName ].concat(fn.slice(1));
        },
        Function: function(name) {
            var $elf = this, _fromIdx = this.input.idx, args, properties;
            this._form(function() {
                this._applyWithArgs("exactly", "call");
                properties = this.anything();
                this._pred(properties.method == name);
                return args = this._applyWithArgs("Arguments", properties.args);
            });
            return [ _.capitalize(name) ].concat(args);
        },
        Arguments: function() {
            var $elf = this, _fromIdx = this.input.idx, args;
            this._form(function() {
                return args = this._many(function() {
                    return this._apply("Operand");
                });
            });
            return args;
        },
        Operand: function() {
            var $elf = this, _fromIdx = this.input.idx;
            return this._or(function() {
                return this._apply("Boolean");
            }, function() {
                return this._apply("Number");
            }, function() {
                return this._apply("Text");
            }, function() {
                return this._apply("Date");
            }, function() {
                return this._apply("Math");
            });
        },
        Math: function() {
            var $elf = this, _fromIdx = this.input.idx, op1, op2, operation;
            this._form(function() {
                operation = function() {
                    switch (this.anything()) {
                      case "add":
                        return "Add";

                      case "div":
                        return "Divide";

                      case "mul":
                        return "Multiply";

                      case "sub":
                        return "Subtract";

                      default:
                        throw this._fail();
                    }
                }.call(this);
                op1 = this._apply("Operand");
                return op2 = this._apply("Operand");
            });
            return [ operation, op1, op2 ];
        },
        Lambda: function(resource, lambda) {
            var $elf = this, _fromIdx = this.input.idx, defaultResource, filter, query, resourceAliases, result;
            resourceAliases = this.resourceAliases;
            (function() {
                this.resourceAliases = _.clone(this.resourceAliases);
                return this.resourceAliases[lambda.identifier] = resource.resourceName;
            }).call(this);
            this._or(function() {
                query = new Query();
                defaultResource = this._applyWithArgs("Resource", this.defaultResource);
                this._applyWithArgs("AddNavigation", query, defaultResource, resource);
                this._applyWithArgs("AddExtraFroms", lambda.expression, query, resource);
                filter = this._applyWithArgs("Boolean", lambda.expression);
                query.where.push(filter);
                query = query.compile("SelectQuery");
                result = this._or(function() {
                    this._pred("any" == lambda.method);
                    return [ "Exists", query ];
                }, function() {
                    this._pred("all" == lambda.method);
                    return [ "Not", [ "Exists", _.map(query, function(queryPart) {
                        return "Where" == queryPart[0] ? [ queryPart[0], [ "Not", queryPart[1] ] ] : queryPart;
                    }) ] ];
                });
                return this.resourceAliases = resourceAliases;
            }, function() {
                this.resourceAliases = resourceAliases;
                return this._pred(!1);
            });
            return result;
        },
        Properties: function() {
            var $elf = this, _fromIdx = this.input.idx, props;
            this._form(function() {
                return props = this._many(function() {
                    return this._apply("Property");
                });
            });
            return props;
        },
        ReferencedProperty: function() {
            var $elf = this, _fromIdx = this.input.idx, prop;
            prop = this._apply("Property");
            return this._or(function() {
                this._pred(_.isArray(prop));
                return prop;
            }, function() {
                return this._applyWithArgs("ReferencedField", prop.resource, prop.name);
            });
        },
        Property: function() {
            var $elf = this, _fromIdx = this.input.idx, prop, resource;
            prop = this.anything();
            this._pred(prop.name);
            return this._or(function() {
                this._pred(prop.property);
                return this._or(function() {
                    this._pred(prop.property.name);
                    return this._or(function() {
                        this._pred(prop.property.property);
                        return this._applyWithArgs("Property", prop.property);
                    }, function() {
                        return {
                            resource: prop.name,
                            name: prop.property.name
                        };
                    });
                }, function() {
                    console.error(prop);
                    return function() {
                        throw "Subproperty without a name";
                    }.call(this);
                });
            }, function() {
                this._pred(prop.lambda);
                resource = this._applyWithArgs("Resource", prop.name);
                return this._applyWithArgs("Lambda", resource, prop.lambda);
            }, function() {
                return {
                    resource: this.defaultResource,
                    name: prop.name
                };
            });
        },
        Number: function() {
            var $elf = this, _fromIdx = this.input.idx, num;
            return this._or(function() {
                num = this._apply("number");
                return [ "Number", num ];
            }, function() {
                return this._apply("NumberFunction");
            });
        },
        Text: function() {
            var $elf = this, _fromIdx = this.input.idx, text;
            return this._or(function() {
                text = this._apply("string");
                return [ "Text", text ];
            }, function() {
                return this._apply("TextFunction");
            });
        },
        Date: function() {
            var $elf = this, _fromIdx = this.input.idx, date;
            date = this.anything();
            this._pred(_.isDate(date));
            return [ "Date", date ];
        },
        Expands: function(resource, query) {
            var $elf = this, _fromIdx = this.input.idx, expand, expandQuery, expandResource, navigationWhere, nestedExpandQuery;
            return this._form(function() {
                return this._many1(function() {
                    expand = this.anything();
                    expandResource = this._applyWithArgs("Resource", expand.name);
                    nestedExpandQuery = new Query();
                    this._opt(function() {
                        this._pred(expand.property);
                        return this._applyWithArgs("Expands", expandResource, nestedExpandQuery, [ expand.property ]);
                    });
                    nestedExpandQuery.select = this.AddSelectFields(expandResource.resourceName, nestedExpandQuery.select);
                    nestedExpandQuery.from.push(expandResource.tableName);
                    navigationWhere = this._applyWithArgs("NavigateResources", resource, expandResource);
                    nestedExpandQuery.where.push(navigationWhere);
                    expandQuery = new Query();
                    expandQuery.select.push([ [ "AggregateJSON", [ expandResource.tableName, "*" ] ], expandResource.resourceName ]);
                    expandQuery.from.push([ nestedExpandQuery.compile("SelectQuery"), expandResource.tableName ]);
                    return query.select.push([ expandQuery.compile("SelectQuery"), expandResource.resourceName ]);
                });
            });
        },
        NavigateResources: function(resource1, resource2) {
            var $elf = this, _fromIdx = this.input.idx, fkField;
            return this._or(function() {
                this._applyWithArgs("FieldContainedIn", resource1.resourceName, resource2);
                fkField = this._applyWithArgs("ReferencedField", resource2.resourceName, resource1.resourceName);
                return [ "Equals", [ "ReferencedField", resource1.tableName, resource1.idField ], fkField ];
            }, function() {
                this._applyWithArgs("FieldContainedIn", resource2.resourceName, resource1);
                fkField = this._applyWithArgs("ReferencedField", resource1.resourceName, resource2.resourceName);
                return [ "Equals", [ "ReferencedField", resource2.tableName, resource2.idField ], fkField ];
            }, function() {
                return function() {
                    throw "Cannot navigate resources " + resource1.tableName + " and " + resource2.tableName;
                }.call(this);
            });
        },
        AddExtraFroms: function(searchPoint, query, resource) {
            var $elf = this, _fromIdx = this.input.idx, extraFroms;
            extraFroms = this._applyWithArgs("ExtraFroms", searchPoint);
            return _.each(extraFroms, function(resourceName) {
                var currentResource = resource;
                if (_.isArray(resourceName)) _.each(resourceName, function(resourceName) {
                    var extraResource = this.Resource(resourceName);
                    this.AddNavigation(query, currentResource, extraResource);
                    currentResource = extraResource;
                }, this); else {
                    var extraResource = this.Resource(resourceName);
                    this.AddNavigation(query, currentResource, extraResource);
                }
            }, this);
        },
        ExtraFroms: function() {
            var $elf = this, _fromIdx = this.input.idx, extraFroms, froms, nextProp, prop;
            froms = [];
            this._or(function() {
                this._pred(_.isArray(this.input.hd));
                return this._form(function() {
                    return this._many(function() {
                        extraFroms = this._apply("ExtraFroms");
                        return froms = froms.concat(extraFroms);
                    });
                });
            }, function() {
                nextProp = this.anything();
                extraFroms = this._many1(function() {
                    prop = nextProp;
                    this._pred(prop);
                    this._pred(prop.name);
                    this._pred(prop.property);
                    this._pred(prop.property.name);
                    nextProp = prop.property;
                    return this._applyWithArgs("ResolveResourceAlias", prop.name);
                });
                return this._or(function() {
                    this._pred(1 == extraFroms.length);
                    return froms.push(extraFroms[0]);
                }, function() {
                    return froms.push(extraFroms);
                });
            }, function() {
                return this.anything();
            });
            return froms;
        },
        AddNavigation: function(query, resource, extraResource) {
            var $elf = this, _fromIdx = this.input.idx, nagivationWhere;
            return this._opt(function() {
                this._pred(!_.contains(query.from, extraResource.tableName));
                nagivationWhere = this._applyWithArgs("NavigateResources", resource, extraResource);
                query.from.push(extraResource.tableName);
                return query.where.push(nagivationWhere);
            });
        }
    });
    OData2AbstractSQL.initialize = function() {
        this.resourceAliases = {};
    };
});