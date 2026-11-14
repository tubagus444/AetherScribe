/** Compare JSON-like query results without allocating serialized copies of manuscripts.
 * Non-data objects are conservatively considered changed; never hide Blob/Map changes.
 */
export function sameQueryResult(a: unknown, b: unknown, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (seen.has(a)) return seen.get(a) === b;
  seen.set(a, b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) {
      if ((index in a) !== (index in b) || !sameQueryResult(a[index], b[index], seen)) return false;
    }
    return true;
  }
  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.getPrototypeOf(b) || (proto !== Object.prototype && proto !== null)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameQueryResult(a[key], b[key], seen));
}
