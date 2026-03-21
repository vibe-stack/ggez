import { useState } from "react";
import { createAnimationEditorStore } from "@ggez/anim-editor-core";
import { AnimationEditorWorkspace } from "./editor/animation-editor-workspace";

function App() {
  const [store] = useState(() => createAnimationEditorStore());

  return (
    <main className="animation-editor-shell h-screen overflow-hidden text-foreground">
      <AnimationEditorWorkspace store={store} />
    </main>
  );
}

export default App;
