/** Mini database in memoria che capisce le catene di query del client Supabase usate dal bot (solo per i test). */
type Row = Record<string, unknown>;
export const db: Record<string, Row[]> = {};
let tick = 0;

export class Q {
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private inserted: Row[] | null = null;
  constructor(private table: string) {
    db[table] ??= [];
  }
  select() { return this; }
  insert(row: Row | Row[]) {
    const rows = (Array.isArray(row) ? row : [row]).map((r) => ({ id: `id${++tick}`, created_at: new Date(Date.now() + tick).toISOString(), performed_at: new Date(Date.now() + tick).toISOString(), ...r }));
    db[this.table].push(...rows);
    this.inserted = rows;
    return this;
  }
  upsert(row: Row) {
    const key = row.key !== undefined ? "key" : "id";
    const i = db[this.table].findIndex((r) => r[key] === row[key]);
    if (i >= 0) db[this.table][i] = { ...db[this.table][i], ...row };
    else db[this.table].push(row);
    return Promise.resolve({ error: null });
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  lt(c: string, v: string) { this.filters.push((r) => String(r[c]) < v); return this; }
  ilike(c: string, v: string) { this.filters.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  private rows(): Row[] {
    if (this.inserted) return this.inserted;
    let r = db[this.table].filter((x) => this.filters.every((f) => f(x)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      r = r.slice().sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    return this.max ? r.slice(0, this.max) : r;
  }
  maybeSingle() { return Promise.resolve({ data: this.rows()[0] ?? null, error: null }); }
  single() { return Promise.resolve({ data: this.rows()[0], error: null }); }
  then(res: (v: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: this.rows(), error: null }).then(res); }
}

export const fakeSupabase = { from: (t: string) => new Q(t), rpc: async () => ({ data: [], error: null }) };
export const resetDb = () => { for (const k of Object.keys(db)) db[k] = []; };
