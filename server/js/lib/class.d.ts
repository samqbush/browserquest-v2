// Declaration shadow for the legacy John-Resig inheritance shim
// (server/js/lib/class.js). Its presence makes TypeScript resolve
// `require("./lib/class")` to this declaration instead of reading and
// type-checking the un-typeable 2012 source, keeping it out of the protocol
// type-check scope. The on-disk class.js is unchanged and still runs.
export const Class: any;
