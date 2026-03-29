import type { CopilotToolDeclaration } from "./types";

export const GAME_COPILOT_TOOL_DECLARATIONS: CopilotToolDeclaration[] = [
  {
    description:
      "Captures the current game viewport, downsizes it to at most 1280x720, and saves it to .web-hammer/codex/current-game-view.jpg inside the current game project. Use it when visuals, camera, lighting, UI, level layout, or placement matter.",
    name: "get_game_screenshot",
    parameters: {
      type: "object",
      properties: {}
    }
  }
];