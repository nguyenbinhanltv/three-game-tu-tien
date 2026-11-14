export function findBlender(): string | null;
export function runBlender(blender: string, script: string, args: string[], opts?: { quiet?: boolean }): number;
