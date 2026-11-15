import type { readBackupFile, readBackupResponse } from '@/src/lib/backupIO';
import type { centroid, relToLatLng, pointInPolygon } from '@/src/lib/mapGeometry';
import type { MapPoint } from '@/src/types';

// Compile-only boundary checks; strict semantics are required for nullability.
type True<T extends true> = T;
type False<T extends false> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

type ParsedFileNeedsValidation = True<Equal<Awaited<ReturnType<typeof readBackupFile>>, unknown>>;
type ParsedResponseNeedsValidation = True<Equal<Awaited<ReturnType<typeof readBackupResponse>>, unknown>>;
type ResponseCannotBeMissing = False<undefined extends Parameters<typeof readBackupResponse>[0] ? true : false>;
type PolygonPointCannotBeNull = False<null extends Parameters<typeof pointInPolygon>[0] ? true : false>;
type PointMustHaveBothCoordinates = False<{ x: number } extends Parameters<typeof relToLatLng>[0] ? true : false>;
type CoordinatesMustBeNumbers = False<{ x: string; y: number } extends MapPoint ? true : false>;
type CentroidRequiresEmptyCaseHandling = True<Equal<ReturnType<typeof centroid>, MapPoint | null>>;

export {};
