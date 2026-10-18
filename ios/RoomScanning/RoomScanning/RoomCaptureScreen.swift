import RoomPlan
import SwiftUI
import UniformTypeIdentifiers

struct RoomCaptureScreen: View {
    @State private var capturedRoom: CapturedRoom?
    @State private var exportDocument: RoomJSONDocument?
    @State private var showingExporter = false
    @State private var isCapturing = true
    @State private var errorText: String?

    var body: some View {
        ZStack(alignment: .bottom) {
            RoomCaptureViewRepresentable(isCapturing: $isCapturing, capturedRoom: $capturedRoom, errorText: $errorText)
                .ignoresSafeArea()
            VStack(spacing: 12) {
                Text("Scan the room slowly. Keep walls and furniture in view.")
                    .font(.callout.weight(.medium)).padding(12)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(.red)
                }
                if let capturedRoom {
                    Text("Room scan ready · \(capturedRoom.walls.count) walls · \(capturedRoom.objects.count) objects")
                        .font(.footnote).padding(.horizontal, 14).padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                    Button("Export measured room JSON") { prepareExport(capturedRoom) }
                        .buttonStyle(.borderedProminent)
                } else {
                    Button(isCapturing ? "Finish scan" : "Start scan") {
                        isCapturing.toggle()
                    }.buttonStyle(.borderedProminent)
                }
            }.padding(.bottom, 30)
        }
        .fileExporter(isPresented: $showingExporter, document: exportDocument,
                      contentType: .json, defaultFilename: "room-scan.json") { result in
            if case .failure(let error) = result { errorText = error.localizedDescription }
        }
    }

    private func prepareExport(_ room: CapturedRoom) {
        do {
            let data = try RoomPlanJSON.makeData(from: room)
            exportDocument = RoomJSONDocument(data: data)
            showingExporter = true
        } catch { errorText = error.localizedDescription }
    }
}

private struct RoomCaptureViewRepresentable: UIViewRepresentable {
    @Binding var isCapturing: Bool
    @Binding var capturedRoom: CapturedRoom?
    @Binding var errorText: String?

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero)
        view.delegate = context.coordinator
        context.coordinator.view = view
        context.coordinator.start()
        return view
    }

    func updateUIView(_ view: RoomCaptureView, context: Context) {
        if isCapturing { context.coordinator.start() }
        else { view.captureSession.stop() }
    }

    @objc(RoomScanningCaptureCoordinator)
    final class Coordinator: NSObject, RoomCaptureViewDelegate {
        private let parent: RoomCaptureViewRepresentable
        weak var view: RoomCaptureView?
        private var running = false

        init(parent: RoomCaptureViewRepresentable) { self.parent = parent }

        // Capture bindings and an active AR session are transient UI state.
        // They cannot be reconstructed safely from an archive.
        required init?(coder: NSCoder) { return nil }

        func encode(with coder: NSCoder) {
            coder.failWithError(NSError(
                domain: "online.noodzakelijk.roomscanning",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "A live room capture coordinator cannot be archived."]
            ))
        }

        func start() {
            guard !running, let view else { return }
            running = true
            let configuration = RoomCaptureSession.Configuration()
            view.captureSession.run(configuration: configuration)
        }

        func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }

        func captureView(didPresent room: CapturedRoom, error: Error?) {
            DispatchQueue.main.async {
                self.running = false
                if let error { self.parent.errorText = error.localizedDescription }
                else { self.parent.capturedRoom = room }
            }
        }
    }
}

struct RoomJSONDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
