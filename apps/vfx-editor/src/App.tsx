import { useState } from "react";
import { createVfxEditorStore } from "@ggez/vfx-editor-core";
import { VfxEditorWorkspace } from "./editor/vfx-editor-workspace";

function App() {
  const [store] = useState(() => createVfxEditorStore());

  return (
    <main className="vfx-editor-shell h-screen overflow-hidden">
      <VfxEditorWorkspace store={store} />
    </main>
  );
}

export default App;
