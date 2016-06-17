v0.3.4

* Switched to using sensible aliases for tables so that self-references can be handled.
* Fixed cases where prop.property or prop.lambda could be ignored.
* Switched to throwing errors rather than strings so that we get stack traces
* Added support for /$count
* Added tests for count

v0.3.3

* Added support for duration literals.
* Added support for the majority of OData 4 functions.

v0.3.2

* Updated to lodash v4

v0.3.1

* Updated ometa-js

v0.3.0

* Added support for lambda operations on nested properties.
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

v0.2.1

* Added support for true/false/null

v0.2.0

* Implemented support for PUT filters.
* Added support for resource names with underscores.

v0.1.1

* Cast bind vars in inserts in order to guarantee the database knows the correct type in cases where it could be ambiguous.

v0.1.0

* Fixed id fields that had spaces.
* Implemented support for POST filters.
* Proper support for keys in $links
