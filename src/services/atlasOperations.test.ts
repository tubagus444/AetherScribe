import 'fake-indexeddb/auto';
import { afterAll, afterEach, expect, it } from 'vitest';
import { db } from '@/src/db';
import { createAtlasOperations } from './atlasOperations';
import { routePoints } from '@/src/lib/atlasRoutePoints';
import { deleteCodexEntry } from './entityDeletion';

afterEach(async () => { for (const table of db.tables) await table.clear(); });
afterAll(async () => { await db.delete(); });
it('creates and updates map/marker records and delegates map deletion to domain cleanup', async () => {
  await db.projects.add({ id: 1, name: 'Atlas', description: '', createdAt: 1, lastOpened: 1 });
  const ops = createAtlasOperations(1);
  const id = await ops.createMap(' Main ', { blob: new Blob(), width: 20, height: 10, resized: false });
  const otherId = await ops.createMap('Other', { blob: new Blob(), width: 20, height: 10, resized: false });
  if (id === undefined || otherId === undefined) throw new Error('Missing generated ID');
  const key = await ops.addMarker({ mapId: id, kind: 'pin', geometry: { x: .1, y: .1 } });
  const portal = await ops.addMarker({ mapId: otherId, kind: 'pin', linkedMapId: id, geometry: { x: .2, y: .2 } });
  if (key === undefined || portal === undefined) throw new Error('Missing marker ID');
  await ops.updateMarker(key, { geometry: { x: .8, y: .8 }, title: 'Keep' });
  await ops.renameMap(id, ' Renamed ');
  expect(await db.maps.get(id)).toMatchObject({ name: 'Renamed' });
  expect(await db.mapMarkers.get(key)).toMatchObject({ title: 'Keep', geometry: { x: .8, y: .8 } });
  await ops.deleteMap(id);
  expect(await db.mapMarkers.get(key)).toBeUndefined();
  expect((await db.mapMarkers.get(portal))?.linkedMapId).toBeUndefined();
  expect(await db.maps.get(otherId)).toBeDefined();
});

it('keeps route point identities, tracks pin moves, and detaches deleted targets', async () => {
  await db.projects.add({ id: 1, name: 'Atlas', description: '', createdAt: 1, lastOpened: 1 });
  const ops = createAtlasOperations(1);
  const image = { blob: new Blob(), width: 20, height: 10, resized: false };
  const mapId = await ops.createMap('Utama', image);
  const otherMapId = await ops.createMap('Lain', image);
  if (mapId === undefined || otherMapId === undefined) throw new Error('Missing map ID');
  const codexId = await db.codex.add({ projectId: 1, name: 'Perkemahan', category: 'location', description: '', aliases: [], tags: [] });
  const pinId = await ops.addMarker({ mapId, kind: 'pin', geometry: { x: .8, y: .8 } });
  const otherPinId = await ops.addMarker({ mapId: otherMapId, kind: 'pin', geometry: { x: .4, y: .4 } });
  const id = await ops.addMarker({ mapId, kind: 'route', geometry: [{ x: .1, y: .1 }, { x: .3, y: .4 }, { x: .5, y: .5 }] });
  if (pinId === undefined || otherPinId === undefined || id === undefined) throw new Error('Missing marker ID');
  const points = async () => {
    const route = await db.mapMarkers.get(id);
    if (!route) throw new Error('Missing route');
    return routePoints(route);
  };
  const [start, middle, end] = await points();
  if (!start.pointId || !middle.pointId || !end.pointId) throw new Error('Missing point ID');
  await expect(ops.editRoutePoint(id, { kind: 'details', pointId: end.pointId, patch: { pinId: otherPinId } })).rejects.toThrow(/peta yang sama/);
  await Promise.all([
    ops.editRoutePoint(id, { kind: 'insert', after: start.pointId, position: { x: .2, y: .2 } }),
    ops.editRoutePoint(id, { kind: 'details', pointId: middle.pointId, patch: { name: 'Kemah', codexId, visible: false } }),
    ops.editRoutePoint(id, { kind: 'details', pointId: end.pointId, patch: { pinId } }),
  ]);
  expect((await points())[2]).toMatchObject({ pointId: middle.pointId, name: 'Kemah', codexId, visible: false });
  expect((await points()).at(-1)).toMatchObject({ pointId: end.pointId, pinId, x: .8, y: .8 });
  await ops.updateMarker(pinId, { geometry: { x: .9, y: .6 } });
  expect((await points()).at(-1)).toMatchObject({ pinId, x: .9, y: .6 });
  await Promise.all([ops.deleteMarker(pinId), deleteCodexEntry(codexId)]);
  expect((await points()).at(-1)).toMatchObject({ pinId: undefined, x: .9, y: .6 });
  const detached = (await points())[2];
  expect(detached).toMatchObject({ pointId: middle.pointId, name: 'Kemah', visible: false });
  expect(detached.codexId).toBeUndefined();
});

it('updates important locations atomically and removes their role when the pin is deleted', async () => {
  await db.projects.add({ id: 1, name: 'Atlas', description: '', createdAt: 1, lastOpened: 1 });
  const ops = createAtlasOperations(1);
  const image = { blob: new Blob(), width: 20, height: 10, resized: false };
  const mapId = await ops.createMap('Utama', image);
  const otherMapId = await ops.createMap('Lain', image);
  if (mapId === undefined || otherMapId === undefined) throw new Error('Missing map ID');
  const id = await ops.addMarker({ mapId, kind: 'area', geometry: [{ x: .1, y: .1 }, { x: .7, y: .1 }, { x: .5, y: .8 }] });
  const pin1 = await ops.addMarker({ mapId, kind: 'pin', geometry: { x: .5, y: .5 } });
  const pin2 = await ops.addMarker({ mapId, kind: 'pin', geometry: { x: .3, y: .3 } });
  const other = await ops.addMarker({ mapId: otherMapId, kind: 'pin', geometry: { x: .3, y: .3 } });
  if (id === undefined || pin1 === undefined || pin2 === undefined || other === undefined) throw new Error('Missing marker ID');
  const locations = async () => (await db.mapMarkers.get(id))?.meta?.importantLocations;
  await expect(ops.setImportantLocation(id, other, 'Ibu Kota')).rejects.toThrow(/peta yang sama/);
  await Promise.all([ops.setImportantLocation(id, pin1, 'Ibu Kota'), ops.setImportantLocation(id, pin2, 'Pelabuhan')]);
  await ops.setImportantLocation(id, pin1, ' Ibu Kota Lama ');
  await ops.updateMarker(pin1, { geometry: { x: .9, y: .9 } });
  expect(await locations()).toEqual([{ pinId: pin1, role: 'Ibu Kota Lama' }, { pinId: pin2, role: 'Pelabuhan' }]);
  await ops.deleteMarker(pin1);
  expect(await locations()).toEqual([{ pinId: pin2, role: 'Pelabuhan' }]);
  await ops.setImportantLocation(id, pin2);
  expect(await locations()).toEqual([]);
});
