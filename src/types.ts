/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PieceType = 'STRIKER' | 'WHITE' | 'BLACK' | 'QUEEN';

export interface Vector {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  type: PieceType;
  pos: Vector;
  vel: Vector;
  radius: number;
  mass: number;
  pocketed: boolean;
  color: string;
}

export type PlayerColor = 'WHITE' | 'BLACK';

export interface GameState {
  pieces: Piece[];
  currentPlayer: PlayerColor;
  scores: {
    WHITE: number;
    BLACK: number;
  };
  turnPhase: 'AIMING' | 'STRIKING' | 'WAITING' | 'POCKET_ANIMATION';
  winner: PlayerColor | null;
  queenPocketed: boolean;
  queenOwnedBy: PlayerColor | null;
  lastPocketedBy: PlayerColor | null;
  isAiTurn: boolean;
  mode: 'PVP' | 'PVA';
}
