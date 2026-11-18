import 'fake-indexeddb/auto';
import { afterAll, afterEach, expect, it } from 'vitest';
import { db } from '@/src/db';
import { createAtlasOperations } from './atlasOperations';

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
