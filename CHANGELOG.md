* Fixed issues with field scoping of foreign keys with `$expand($select)` queries that do not include the foreign key in the select.
* Fixed database error on insert filter with navigation property.

v0.2.6

* Added support for nested expands like `$expand=resource($expand=subresource)`

v0.2.5

* Switched to a scoped package.

v0.2.4

* Fixed an issue when an expand references its parent in an option (eg. `/pilot?$expand=licence($filter=pilot/id eq 1)`)

v0.2.3

* Fixed some cases where failing to parse was silently ignored.

v0.2.2

* Added support for $filter, $orderby, $top, $skip, and $select as expand options.
* Updated lodash to ^3.0.0
