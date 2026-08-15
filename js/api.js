/**
 * Data loading with an in-memory cache. All datasets are static JSON in
 * data/, fetched relative to index.html so the app works from any base path.
 */

const cache = new Map();

const FILES = {
  meta: "data/meta.json",
  recalls: "data/recalls.json",
  countryRates: "data/country_rates.json",
  regimes: "data/regimes.json",
  detection: "data/detection.json",
  channel: "data/channel.json",
  remedyModel: "data/remedy_model.json",
  world: "data/world_110m.json",
};

/**
 * @param {keyof typeof FILES} name
 * @returns {Promise<any>}
 */
export function getData(name) {
  const path = FILES[name];
  if (!path) return Promise.reject(new Error(`unknown dataset: ${name}`));
  if (!cache.has(name)) {
    const p = fetch(path).then((res) => {
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.json();
    }).catch((err) => {
      cache.delete(name);
      throw err;
    });
    cache.set(name, p);
  }
  return cache.get(name);
}

/**
 * @param {Array<keyof typeof FILES>} names
 * @returns {Promise<object>} map of name -> parsed payload
 */
export async function loadAll(names) {
  const values = await Promise.all(names.map(getData));
  return Object.fromEntries(names.map((n, i) => [n, values[i]]));
}
