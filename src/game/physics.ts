/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Piece, Vector } from '../types';
import { BOARD_SIZE, BOARD_PADDING, FRICTION, MIN_VELOCITY, BOUNCE_RESTITUTION, POCKET_RADIUS, POCKET_POSITIONS } from './constants';

export function distance(v1: Vector, v2: Vector): number {
  return Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
}

export function updatePhysics(pieces: Piece[]): Piece[] {
  const activePieces = pieces.filter(p => !p.pocketed);
  
  // Update positions
  activePieces.forEach(p => {
    p.pos.x += p.vel.x;
    p.pos.y += p.vel.y;
    
    // Apply friction
    p.vel.x *= FRICTION;
    p.vel.y *= FRICTION;
    
    if (Math.abs(p.vel.x) < MIN_VELOCITY) p.vel.x = 0;
    if (Math.abs(p.vel.y) < MIN_VELOCITY) p.vel.y = 0;
    
    // Wall collisions
    if (p.pos.x - p.radius < BOARD_PADDING) {
      p.pos.x = BOARD_PADDING + p.radius;
      p.vel.x *= -BOUNCE_RESTITUTION;
    } else if (p.pos.x + p.radius > BOARD_SIZE - BOARD_PADDING) {
      p.pos.x = BOARD_SIZE - BOARD_PADDING - p.radius;
      p.vel.x *= -BOUNCE_RESTITUTION;
    }
    
    if (p.pos.y - p.radius < BOARD_PADDING) {
      p.pos.y = BOARD_PADDING + p.radius;
      p.vel.y *= -BOUNCE_RESTITUTION;
    } else if (p.pos.y + p.radius > BOARD_SIZE - BOARD_PADDING) {
      p.pos.y = BOARD_SIZE - BOARD_PADDING - p.radius;
      p.vel.y *= -BOUNCE_RESTITUTION;
    }
  });

  // Circle-Circle collisions
  for (let i = 0; i < activePieces.length; i++) {
    for (let j = i + 1; j < activePieces.length; j++) {
      const p1 = activePieces[i];
      const p2 = activePieces[j];
      
      const dx = p2.pos.x - p1.pos.x;
      const dy = p2.pos.y - p1.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = p1.radius + p2.radius;
      
      if (dist < minDist) {
        // Resolve overlap
        const angle = Math.atan2(dy, dx);
        const overlap = minDist - dist;
        const moveX = (overlap / 2) * Math.cos(angle);
        const moveY = (overlap / 2) * Math.sin(angle);
        
        p1.pos.x -= moveX;
        p1.pos.y -= moveY;
        p2.pos.x += moveX;
        p2.pos.y += moveY;
        
        // Elastic collision
        const normalX = dx / dist;
        const normalY = dy / dist;
        const relativeVelX = p1.vel.x - p2.vel.x;
        const relativeVelY = p1.vel.y - p2.vel.y;
        
        const velAlongNormal = relativeVelX * normalX + relativeVelY * normalY;
        
        if (velAlongNormal > 0) continue;
        
        const e = 0.8; // Restitution between pieces
        const jImpulse = -(1 + e) * velAlongNormal;
        const impulseFactor = jImpulse / (1/p1.mass + 1/p2.mass);
        
        const impulseX = impulseFactor * normalX;
        const impulseY = impulseFactor * normalY;
        
        p1.vel.x += impulseX / p1.mass;
        p1.vel.y += impulseY / p1.mass;
        p2.vel.x -= impulseX / p2.mass;
        p2.vel.y -= impulseY / p2.mass;
      }
    }
  }

  // Pocketing
  activePieces.forEach(p => {
    for (const pocket of POCKET_POSITIONS) {
      if (distance(p.pos, pocket) < POCKET_RADIUS - 5) {
        p.pocketed = true;
        p.vel = { x: 0, y: 0 };
        break;
      }
    }
  });

  return pieces;
}

export function isStatic(pieces: Piece[]): boolean {
  return pieces.every(p => p.pocketed || (Math.abs(p.vel.x) === 0 && Math.abs(p.vel.y) === 0));
}
