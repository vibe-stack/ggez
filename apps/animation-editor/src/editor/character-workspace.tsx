import type { ImportedCharacterAsset } from "./preview-assets";

type CharacterWorkspaceProps = {
  character: ImportedCharacterAsset | null;
};

export function CharacterWorkspace(_props: CharacterWorkspaceProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-zinc-400 text-sm">Hello World — Character workspace coming soon.</p>
    </div>
  );
}
