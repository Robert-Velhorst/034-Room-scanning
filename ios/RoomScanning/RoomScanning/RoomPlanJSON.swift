import Foundation
import RoomPlan
import simd

enum RoomPlanJSON {
    static func makeData(from room: CapturedRoom) throws -> Data {
        let wallCorners = room.walls.flatMap(corners)
        guard let minX = wallCorners.map(\.x).min(), let maxX = wallCorners.map(\.x).max(),
              let minZ = wallCorners.map(\.z).min(), let maxZ = wallCorners.map(\.z).max(),
              maxX - minX > 1, maxZ - minZ > 1 else {
            throw NSError(domain: "RoomScanning", code: 1, userInfo: [NSLocalizedDescriptionKey: "RoomPlan did not return enough wall geometry to calculate dimensions."])
        }
        let objects = room.objects.map { object -> [String: Any] in
            let p = object.transform.columns.3
            let d = object.dimensions
            let objectCorners = corners(transform: object.transform, dimensions: d)
            let objectMinX = objectCorners.map(\.x).min() ?? p.x - d.x / 2
            let objectMaxX = objectCorners.map(\.x).max() ?? p.x + d.x / 2
            let objectMinZ = objectCorners.map(\.z).min() ?? p.z - d.z / 2
            let objectMaxZ = objectCorners.map(\.z).max() ?? p.z + d.z / 2
            return [
                "id": object.identifier.uuidString,
                "name": readableCategory(object.category),
                "category": readableCategory(object.category),
                "width": Double(objectMaxX - objectMinX), "height": Double(d.y), "depth": Double(objectMaxZ - objectMinZ),
                "x": Double(objectMinX - minX), "y": Double(objectMinZ - minZ),
                "rotationDegrees": 0, "moveClass": "unknown", "provenance": "measured"
            ]
        }
        let features = room.doors.map { surface in feature(surface, kind: "door", minX: minX, minZ: minZ) }
            + room.windows.map { surface in feature(surface, kind: "window", minX: minX, minZ: minZ) }
            + room.openings.map { surface in feature(surface, kind: "opening", minX: minX, minZ: minZ) }
        let output: [String: Any] = [
            "schemaVersion": 1,
            "source": "apple-roomplan",
            "room": [
                "name": "Scanned room",
                "dimensions": ["width": Double(maxX - minX), "length": Double(maxZ - minZ), "height": averageCeiling(room), "confidence": 0.85],
                "features": features,
                "objects": objects
            ]
        ]
        return try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
    }

    private static func corners(_ surface: CapturedRoom.Surface) -> [SIMD3<Float>] {
        corners(transform: surface.transform, dimensions: surface.dimensions)
    }

    private static func corners(transform: simd_float4x4, dimensions: SIMD3<Float>) -> [SIMD3<Float>] {
        let d = dimensions
        return [-1.0, 1.0].flatMap { x in
            [-1.0, 1.0].map { z in
                transform * SIMD4<Float>(Float(x) * d.x / 2, 0, Float(z) * d.z / 2, 1)
            }
        }.map { SIMD3<Float>($0.x, $0.y, $0.z) }
    }

    private static func feature(_ surface: CapturedRoom.Surface, kind: String, minX: Float, minZ: Float) -> [String: Any] {
        let p = surface.transform.columns.3
        let vertical = abs(surface.transform.columns.0.z) > abs(surface.transform.columns.0.x)
        return [
            "id": surface.identifier.uuidString, "kind": kind,
            "wall": vertical ? (p.x < minX + 0.15 ? "west" : "east") : (p.z < minZ + 0.15 ? "north" : "south"),
            "offset": Double(vertical ? p.z - minZ - surface.dimensions.x / 2 : p.x - minX - surface.dimensions.x / 2),
            "width": Double(surface.dimensions.x), "provenance": "measured", "confidence": 0.85
        ]
    }

    private static func averageCeiling(_ room: CapturedRoom) -> Double {
        let heights = room.walls.map { Double($0.dimensions.y) }.filter { $0 > 1.5 && $0 < 6 }
        return heights.isEmpty ? 2.4 : heights.reduce(0, +) / Double(heights.count)
    }

    private static func readableCategory(_ category: CapturedRoom.Object.Category) -> String {
        String(describing: category).replacingOccurrences(of: "_", with: " ").capitalized
    }
}
