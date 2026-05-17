/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const BOARD_SIZE = 600;
export const BOARD_PADDING = 40;
export const INNER_SIZE = BOARD_SIZE - (BOARD_PADDING * 2);

export const POCKET_RADIUS = 35;
export const POCKET_POSITIONS = [
  { x: BOARD_PADDING, y: BOARD_PADDING },
  { x: BOARD_SIZE - BOARD_PADDING, y: BOARD_PADDING },
  { x: BOARD_PADDING, y: BOARD_SIZE - BOARD_PADDING },
  { x: BOARD_SIZE - BOARD_PADDING, y: BOARD_SIZE - BOARD_PADDING },
];

export const STRIKER_RADIUS = 20;
export const COIN_RADIUS = 15;

export const FRICTION = 0.985;
export const MIN_VELOCITY = 0.1;
export const BOUNCE_RESTITUTION = 0.7;

export const COLORS = {
  BOARD: '#2C1B0E',
  BOARD_INNER: '#EED9B7',
  STRIKER: '#FFD700',
  WHITE_COIN: '#FFFFFF',
  BLACK_COIN: '#1A1A1A',
  QUEEN: '#C0392B',
  LINES: '#3E2723',
};
