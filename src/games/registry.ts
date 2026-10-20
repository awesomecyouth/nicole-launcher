/** 游戏注册表:V1 仅原神,顶栏切换位预留 */
import { genshin } from "./genshin";
import type { GameConfig } from "./types";

export const games: GameConfig[] = [genshin];

export function getGame(id: string): GameConfig {
  const game = games.find((g) => g.id === id);
  if (!game) throw new Error(`unknown game: ${id}`);
  return game;
}
