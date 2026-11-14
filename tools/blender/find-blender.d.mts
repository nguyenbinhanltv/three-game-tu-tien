export function findBlender(): string | null;
export function runBlender(blender: string, script: string, args: string[], opts?: { quiet?: boolean }): number;
export function findAssetSource(root: string): string | null;
