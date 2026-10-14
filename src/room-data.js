export const demoRoom = {
  schemaVersion: 1,
  source: 'demo',
  name: 'Living room',
  dimensions: { width: 4.8, length: 3.9, height: 2.48, provenance: 'user-confirmed', confidence: 0.98 },
  features: [
    { id: 'door', kind: 'door', wall: 'south', offset: 0.55, width: 0.82, provenance: 'measured', confidence: 0.95, swing: 'in' },
    { id: 'window', kind: 'window', wall: 'north', offset: 1.35, width: 1.8, provenance: 'measured', confidence: 0.91 },
    { id: 'radiator', kind: 'radiator', wall: 'north', offset: 3.35, width: 1.1, provenance: 'user-confirmed', confidence: 0.9 }
  ],
  objects: [
    { id: 'sofa', name: 'Sofa', category: 'Seating', width: 2.05, depth: 0.88, height: 0.82, x: 0.32, y: 1.28, rotation: 0, moveClass: 'assisted', clearance: 0.45, fixed: false, provenance: 'user-confirmed', color: '#627c68' },
    { id: 'coffee-table', name: 'Coffee table', category: 'Table', width: 0.92, depth: 0.58, height: 0.42, x: 2.2, y: 1.6, rotation: 0, moveClass: 'easy', clearance: 0.3, fixed: false, provenance: 'estimated', color: '#c6a978' },
    { id: 'desk', name: 'Desk', category: 'Work', width: 1.35, depth: 0.62, height: 0.74, x: 3.08, y: 0.38, rotation: 90, moveClass: 'assisted', clearance: 0.7, fixed: false, provenance: 'user-confirmed', color: '#a97c58' },
    { id: 'cabinet', name: 'Cabinet', category: 'Storage', width: 0.82, depth: 0.42, height: 1.65, x: 3.58, y: 2.68, rotation: 0, moveClass: 'assisted', clearance: 0.55, fixed: false, provenance: 'estimated', color: '#8a7560' },
    { id: 'armchair', name: 'Armchair', category: 'Seating', width: 0.82, depth: 0.82, height: 0.86, x: 1.4, y: 2.62, rotation: 0, moveClass: 'easy', clearance: 0.4, fixed: false, provenance: 'estimated', color: '#94a58e' }
  ],
  priorities: { mode: 'Balanced', routeWidth: 0.9, preserveAll: true, daylight: true, easyCleaning: false }
};

export function normalizeRoomPlan(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('The selected file is not a room scan.');
  const room = payload.room ?? payload;
  const dimensions = room.dimensions ?? room;
  const width = Number(dimensions.width ?? dimensions.widthM);
  const length = Number(dimensions.length ?? dimensions.lengthM);
  const height = Number(dimensions.height ?? dimensions.heightM ?? 2.4);
  if (!(width > 1 && width < 30 && length > 1 && length < 30)) throw new Error('The scan must include room width and length in metres.');
  const objects = (room.objects ?? []).map((o, index) => ({
    id: String(o.id ?? `scan-object-${index + 1}`),
    name: String(o.name ?? o.category ?? 'Scanned object'),
    category: String(o.category ?? 'Furniture'),
    width: Number(o.width ?? o.dimensions?.width ?? o.dimensions?.x ?? 0.8),
    depth: Number(o.depth ?? o.dimensions?.depth ?? o.dimensions?.z ?? 0.6),
    height: Number(o.height ?? o.dimensions?.height ?? o.dimensions?.y ?? 0.8),
    x: Number(o.x ?? o.position?.x ?? 0.3), y: Number(o.y ?? o.position?.z ?? 0.3),
    rotation: Number(o.rotation ?? o.rotationDegrees ?? 0),
    moveClass: o.moveClass ?? 'unknown', clearance: Number(o.clearance ?? 0.35),
    fixed: Boolean(o.fixed), provenance: o.provenance ?? 'measured', color: o.color ?? '#718773'
  }));
  return {
    schemaVersion: 1, source: payload.source ?? 'imported-scan', name: room.name ?? payload.name ?? 'Scanned room',
    dimensions: { width, length, height: height > 1.5 && height < 8 ? height : 2.4, provenance: 'measured', confidence: Number(dimensions.confidence ?? 0.85) },
    features: room.features ?? [], objects,
    priorities: { mode: 'Balanced', routeWidth: 0.9, preserveAll: true, daylight: true, easyCleaning: false }
  };
}
