// Variants, the asset registry and non-destructive conversion (the Variant architecture).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootPipeline, collectPresentation, scanAssets, ROOT } from '../tools/headless.mjs';

const kit = bootPipeline({ files: scanAssets(ROOT), quiet: true });
const { Variant, RenderProfile, AssetRegistry, Migration, GameModel, VisualEntity } = kit;
kit.PlayArcRuntime.start({ variants: collectPresentation(ROOT), apply: false });

test('variants: one project, five presentations, each pointing at the same game model', () => {
    const list = Variant.list();
    assert.equal(list.length, 5);
    assert.deepEqual([...new Set(list.map(v => v.profile))].sort(), ['2.5d', '2d', 'full3d', 'isometric3d', 'lowpoly3d']);
    const hash = GameModel.gameplayHash();
    for (const v of list) {
        Variant.activate(v.id, { apply: false });
        assert.equal(Variant.currentId(), v.id);
        assert.equal(Variant.profileOf(v.id), v.profile);
        assert.equal(GameModel.gameplayHash(), hash, 'activating ' + v.id + ' must not touch gameplay');
    }
    assert.ok(Variant.defaultId());
});

test('variant inheritance: profile defaults <- preset <- variant overrides <- scene preset', () => {
    const v2d = Variant.effective('arcengine-sample-2d');
    assert.equal(v2d.id, '2d');
    assert.equal(v2d.camera.elevationDeg, 88, 'the variant pins the top-down pitch');
    assert.equal(v2d.lighting.preset, 'flat');
    assert.equal(v2d.lighting.shadows, 0, 'the flat preset has no shadows');
    const v3d = Variant.effective('arcengine-sample-full3d');
    assert.equal(v3d.camera.mode, 'thirdPerson');
    assert.equal(v3d.lighting.preset, 'realistic');
    assert.equal(v3d.camera.projection, 'perspective');
    // a variant may only tighten the profile budget
    assert.throws(() => Variant.normalize({ id: 'x-loose', profile: '2d', performance: { maxDrawCalls: 999999 } }), /loosens/);
});

test('profiles cannot be loosened by a variant, and every profile keeps its camera identity', () => {
    for (const id of RenderProfile.ids()) {
        const p = RenderProfile.info(id);
        assert.ok(p.performanceBudget.maxDrawCalls > 0);
        assert.ok(['orthographic', 'perspective'].includes(p.projection));
        const cfg = Variant.forProfile(id) ? Variant.effective(Variant.forProfile(id).id) : RenderProfile.defaultsFor(id);
        assert.equal(cfg.camera.projection, p.projection);
    }
});

test('asset registry: roles resolve per profile with fallbacks, and placeholders never fail', () => {
    const res = AssetRegistry.resolve('player.visual', 'full3d', { entityType: 'character' });
    assert.equal(res.asset, 'assets/models/character.glb');
    assert.equal(res.resolvedBy, 'variant');
    assert.equal(res.missing, false);
    // a role with no file for the profile falls back (or becomes a placeholder) — never throws
    const miss = AssetRegistry.resolve('world.wall.visual', '2d', { entityType: 'terrain' });
    assert.ok(['variant', 'fallback', 'placeholder'].includes(miss.resolvedBy));
    // the fallback chain respects the target profile: no 3D model for a sprite-only profile
    const chain = AssetRegistry.fallbackChain('player.visual', '2d');
    assert.equal(chain[0], '2d');
    // the variant overlay (visualMappings) wins without touching the shared registry
    AssetRegistry.setOverlay({ 'player.visual': { '2d': { type: 'sprite', asset: 'assets/models/character.glb' } } }, 'unit');
    const ov = AssetRegistry.resolve('player.visual', '2d', { entityType: 'character' });
    assert.equal(ov.overlay, 'unit');
    AssetRegistry.setOverlay(null);
    assert.equal(AssetRegistry.overlayName(), null);
});

test('conversion is NON-DESTRUCTIVE: the source variant survives, the target is created', () => {
    const before = Variant.ids().sort().join(',');
    const idsBefore = GameModel.entities.map(e => e.id).join(',');
    const hashBefore = GameModel.gameplayHash();
    const schemaBefore = kit.Save.schemaHash();
    const report = Migration.convert({ source: 'arcengine-sample-lowpoly3d', profile: 'full3d', by: 'unit', activate: false });
    assert.equal(report.ok, true);
    assert.equal(report.status, 'committed');
    assert.equal(report.plan.counts.gameplayFilesChanged, 0);
    assert.ok(report.sourceVariant, 'the source variant is reported');
    assert.equal(Variant.ids().sort().join(','), before, 'no variant disappeared');
    assert.equal(GameModel.entities.map(e => e.id).join(','), idsBefore);
    assert.equal(GameModel.gameplayHash(), hashBefore);
    assert.equal(kit.Save.schemaHash(), schemaBefore);
    // the journal records the conversion
    const j = Migration.journal();
    assert.ok(j.length >= 1);
    assert.equal(j[j.length - 1].status, 'committed');
    assert.ok(j[j.length - 1].rollbackAvailable);
});

test('a failed conversion rolls back: the project is exactly as it was', () => {
    const hash = GameModel.gameplayHash();
    const variants = Variant.ids().sort().join(',');
    const snap = Migration.snapshot();
    // corrupt the model on purpose, then roll back
    GameModel.entity('character').set('health', 1);
    GameModel.entities.push({ id: 'ghost-intruder' });
    Migration.rollback(snap);
    assert.equal(GameModel.gameplayHash(), hash);
    assert.equal(Variant.ids().sort().join(','), variants);
});

test('the plan is a dry run: it counts, warns and changes nothing', () => {
    const hash = GameModel.gameplayHash();
    const plan = Migration.plan('2d', 'full3d');
    assert.equal(plan.from, '2d');
    assert.equal(plan.to, 'full3d');
    assert.equal(plan.counts.entities, GameModel.entities.length);
    assert.equal(plan.counts.preserved, plan.counts.entities);
    assert.equal(plan.counts.gameplayFilesChanged, 0);
    assert.ok(plan.preserve.includes('save_schema'));
    assert.ok(plan.change.includes('camera'));
    assert.ok(Array.isArray(plan.entities));
    assert.equal(GameModel.gameplayHash(), hash);
    const chk = RenderProfile.canConvert('2d', 'full3d');
    assert.equal(chk.ok, true);
    assert.equal(RenderProfile.canConvert('2d', 'nope').ok, false);
});

test('presentation: every entity gets a binding the profile allows (headless, no engine)', () => {
    for (const pid of RenderProfile.ids()) {
        kit.PlayArcRuntime.start({ profile: pid, apply: false });
        const cfg = RenderProfile.config();
        const rep = VisualEntity.sync(GameModel.entities, cfg, {});
        assert.ok(rep.bindings >= 1, pid + ' presents nothing');
        const allowed = RenderProfile.info(pid).entityRepresentations.allowed;
        for (const b of VisualEntity.bindings()) assert.ok(allowed.includes(b.type), pid + ': ' + b.type);
    }
});
