// Physics.js — spatial queries for the semantic core. No pc.*, no renderer, no browser.
//
// WorldMap already answers the POINT questions (blocked, heightAt, zoneAt, triggersAt) and
// findPath() answers "how do I get there". What an AI, a shot and a pickup additionally need
// are the RAY and the AREA questions:
//
//     Physics.raycast(world, a, b)      what stands between two points?   (shots, line of sight)
//     Physics.lineOfSight(world, a, b)  can a see b?
//     Physics.overlap(world, area, xs)  what is near this point?          (pickup, aggro, aura)
//     Physics.distance(a, b)            how far apart, on the ground plane
//     Physics.blocked(world, x, z)      the one point query, null-safe
//
// Everything reads the WorldMap record — the same source WorldMap.heightAt() already insists
// on ("3D is a view — logic never asks the renderer for a height"). Map coordinates: x right,
// z depth, y up. The engine layer mirrors geometry at render time; nothing here may know
// about that, because a rule that does would break in the other two profiles.
//
// Nothing is silently defaulted. A missing world throws instead of returning "not blocked",
// and an item with no readable position is reported rather than quietly skipped: both read as
// correct answers while being programming errors.

/** @typedef {{ x: number, y?: number, z: number }} PhysicsVec */

const Physics = {
    /**
     * The one point query, null-safe at the call site so callers can pass a half-built world
     * during loading. A missing world THROWS: "not blocked" would be a lie, and a lie here
     * turns into an AI walking through a wall.
     * @returns {boolean} true when the point is a wall, an obstacle or outside the map
     */
    blocked(world, x, z) {
        if (!world || typeof world.blocked !== 'function') {
            throw new Error('Physics.blocked: pass a WorldMap as the first argument');
        }
        return !!world.blocked(x, z);
    },

    /**
     * Horizontal distance: y is height, and navigation happens on the ground plane, so mixing
     * it in would make a bridge overhead read as "far". Use Physics.distance3 when height
     * really is part of the question (a flying unit, a thrown arc).
     * @param {PhysicsVec} a
     * @param {PhysicsVec} b
     * @returns {number}
     */
    distance(a, b) {
        const [ax, az, bx, bz] = Physics._xy(a, b);
        return Math.hypot(bx - ax, bz - az);
    },

    /** @returns {number} straight-line distance including height */
    distance3(a, b) {
        const [ax, az, bx, bz] = Physics._xy(a, b);
        const ay = Number(a && a.y) || 0, by = Number(b && b.y) || 0;
        return Math.hypot(bx - ax, bz - az, by - ay);
    },

    /** Shared argument check for the distance pair: both ends must carry x and z. */
    _xy(a, b, what) {
        if (!a || !b || a.x == null || a.z == null || b.x == null || b.z == null) {
            throw new Error('Physics.' + (what || 'distance') + ': both points need x and z');
        }
        return [Number(a.x), Number(a.z), Number(b.x), Number(b.z)];
    },

    /**
     * March a straight line over the tile grid and report the first blocked sample.
     *
     * `step` defaults to HALF a tile. That is the whole trick: with a half-tile step two
     * consecutive samples can never straddle a one-tile wall however diagonal the line is, so
     * a thin wall cannot be jumped over. A full-tile step could, and a shot would pass
     * through it.
     *
     * The start point is never tested — a shooter may legally stand in a doorway. The target
     * IS tested once the march reaches it, so shooting at a wall hits the wall. Outside the
     * map counts as blocked, so a ray that leaves the world stops at the edge rather than
     * reporting clear forever.
     *
     * @param {PhysicsVec} from
     * @param {PhysicsVec} to
     * @param {{ step?: number, maxDist?: number }} [opts] maxDist caps the march (a vision
     *   range); the march stops there and reports a miss beyond it.
     * @returns {{ hit: boolean, x: number, z: number, dist: number, total: number } | null}
     *   where x/z/dist describe the hit point, or the target when nothing was hit. null when
     *   the arguments are unusable.
     */
    raycast(world, from, to, opts) {
        if (!world || typeof world.blocked !== 'function') {
            throw new Error('Physics.raycast: pass a WorldMap as the first argument');
        }
        if (!from || !to || from.x == null || from.z == null || to.x == null || to.z == null) return null;
        const o = opts || {};
        const dx = Number(to.x) - Number(from.x), dz = Number(to.z) - Number(from.z);
        const total = Math.hypot(dx, dz);
        const step = Math.max(1, Number(o.step) || (world.tileSize ? world.tileSize / 2 : 1));
        // A maxDist that is not a real number must NOT become 0 — that would silently never
        // march and report "clear" for every ray. Only a finite, non-negative cap shortens the
        // march; anything else is ignored and the ray runs to the target.
        const cap = Number(o.maxDist);
        const maxDist = (o.maxDist != null && isFinite(cap) && cap >= 0) ? Math.min(total, cap) : total;
        const ux = total > 0 ? dx / total : 0, uz = total > 0 ? dz / total : 0;
        for (let d = step; d <= maxDist + 1e-9; d += step) {
            const x = Number(from.x) + ux * d, z = Number(from.z) + uz * d;
            if (world.blocked(x, z)) return { hit: true, x: x, z: z, dist: d, total: total };
        }
        if (maxDist >= total - 1e-9 && world.blocked(Number(to.x), Number(to.z))) {
            return { hit: true, x: Number(to.x), z: Number(to.z), dist: total, total: total };
        }
        return { hit: false, x: Number(to.x), z: Number(to.z), dist: total, total: total };
    },

    /** @returns {boolean} can a see b — a ray with nothing blocked in between */
    lineOfSight(world, a, b) {
        const r = Physics.raycast(world, a, b);
        return r ? !r.hit : false;
    },

    /**
     * What is inside an area. The area is a circle ({ x, z, r }) or a rectangle
     * ({ x, z, w, h }) whose x/z is its corner — the same convention WorldMap zones use, so a
     * zone can be handed straight in.
     *
     * An item may be a bare { x, z }, a canonical { x, y, z }, an ArcEntity (its .position is
     * read) or anything else exposing .x/.z. An item with NO readable position is reported in
     * `skipped` instead of being treated as outside: a pickup that "randomly" stops working is
     * a missing field, and this says so.
     *
     * `items` defaults to the map's triggers, which is the pickup case.
     *
     * @returns {{ hits: any[], skipped: any[] }}
     */
    overlap(world, area, items) {
        if (!area || area.x == null || area.z == null) return { hits: [], skipped: [] };
        const r = Number(area.r);
        const circle = r > 0;
        const w = Number(area.w), h = Number(area.h);
        if (!circle && !(w > 0 && h > 0)) return { hits: [], skipped: [] };
        const list = items || (world && world.triggers) || [];
        const hits = [], skipped = [];
        for (const it of list) {
            const p = it && it.position && it.position.x != null ? it.position : it;
            if (!p || p.x == null || p.z == null) { skipped.push(it); continue; }
            const px = Number(p.x), pz = Number(p.z);
            const inside = circle
                ? Math.hypot(px - Number(area.x), pz - Number(area.z)) <= r
                : px >= Number(area.x) && pz >= Number(area.z) && px <= Number(area.x) + w && pz <= Number(area.z) + h;
            if (inside) hits.push(it);
        }
        return { hits: hits, skipped: skipped };
    },

    /** Convenience for the common case: the items within r of a point, as a flat array. */
    near(world, point, r, items) {
        if (!point) return [];
        return Physics.overlap(world, { x: point.x, z: point.z, r: r }, items).hits;
    }
};
