/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Users, User, RotateCcw, Play, ChevronRight, Info } from 'lucide-react';
import { Piece, GameState, PlayerColor, PieceType } from './types';
import { BOARD_SIZE, BOARD_PADDING, STRIKER_RADIUS, COIN_RADIUS, POCKET_RADIUS, POCKET_POSITIONS, COLORS } from './game/constants';
import { updatePhysics, isStatic, distance } from './game/physics';

const INITIAL_PIECES: Piece[] = [];

// Setup initial board
function createInitialPieces(): Piece[] {
  const pieces: Piece[] = [];
  const center = BOARD_SIZE / 2;
  const gap = 2;
  
  // Queen
  pieces.push({
    id: 'queen',
    type: 'QUEEN',
    pos: { x: center, y: center },
    vel: { x: 0, y: 0 },
    radius: COIN_RADIUS,
    mass: 1,
    pocketed: false,
    color: COLORS.QUEEN
  });

  // Hexagon rings
  const layers = [
    { type: 'WHITE', count: 6, radius: COIN_RADIUS * 2 + gap, startAngle: 0 },
    { type: 'BLACK', count: 6, radius: (COIN_RADIUS * 2 + gap) * 2, startAngle: Math.PI / 6 },
    { type: 'WHITE', count: 6, radius: (COIN_RADIUS * 2 + gap) * 2, startAngle: 0 },
  ];

  // More traditional hexagon layout
  const hexRadius = COIN_RADIUS * 2 + gap;
  
  // First ring (6 coins)
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    pieces.push({
      id: `ring1-${i}`,
      type: i % 2 === 0 ? 'WHITE' : 'BLACK',
      pos: {
        x: center + hexRadius * Math.cos(angle),
        y: center + hexRadius * Math.sin(angle)
      },
      vel: { x: 0, y: 0 },
      radius: COIN_RADIUS,
      mass: 1,
      pocketed: false,
      color: i % 2 === 0 ? COLORS.WHITE_COIN : COLORS.BLACK_COIN
    });
  }

  // Second ring (12 coins)
  const hexRadius2 = hexRadius * 2;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    // Corner
    pieces.push({
      id: `ring2-corner-${i}`,
      type: i % 2 === 0 ? 'BLACK' : 'WHITE',
      pos: {
        x: center + hexRadius2 * Math.cos(angle),
        y: center + hexRadius2 * Math.sin(angle)
      },
      vel: { x: 0, y: 0 },
      radius: COIN_RADIUS,
      mass: 1,
      pocketed: false,
      color: i % 2 === 0 ? COLORS.BLACK_COIN : COLORS.WHITE_COIN
    });
    // Edge
    const nextAngle = ((i + 1) * Math.PI) / 3;
    const midX = (Math.cos(angle) + Math.cos(nextAngle)) / 2;
    const midY = (Math.sin(angle) + Math.sin(nextAngle)) / 2;
    // Normalize mid to be at correct distance
    const distToMid = Math.sqrt(midX*midX + midY*midY);
    const midPosX = center + (hexRadius * Math.sqrt(3)) * (midX / distToMid);
    const midPosY = center + (hexRadius * Math.sqrt(3)) * (midY / distToMid);
    
    pieces.push({
      id: `ring2-edge-${i}`,
      type: 'BLACK',
      pos: { x: midPosX, y: midPosY },
      vel: { x: 0, y: 0 },
      radius: COIN_RADIUS,
      mass: 1,
      pocketed: false,
      color: COLORS.BLACK_COIN
    });
  }

  return pieces;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isStrikerDragging, setIsStrikerDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, y: 0 });
  const [strikerX, setStrikerX] = useState(BOARD_SIZE / 2);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const prevStateRef = useRef<Piece[]>([]);

  const startNewGame = (mode: 'PVP' | 'PVA') => {
    const initialPieces = createInitialPieces();
    setGameState({
      pieces: initialPieces,
      currentPlayer: 'WHITE',
      scores: { WHITE: 0, BLACK: 0 },
      turnPhase: 'AIMING',
      winner: null,
      queenPocketed: false,
      queenOwnedBy: null,
      lastPocketedBy: null,
      isAiTurn: false,
      mode
    });
    setStrikerX(BOARD_SIZE / 2);
  };

  const handleShoot = () => {
    if (!gameState || gameState.turnPhase !== 'AIMING') return;

    const dx = dragStart.x - dragEnd.x;
    const dy = dragStart.y - dragEnd.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 150;
    const power = Math.min(dist, maxDist) / 8;
    const angle = Math.atan2(dy, dx);

    const striker: Piece = {
      id: 'striker',
      type: 'STRIKER',
      pos: { 
        x: strikerX, 
        y: gameState.currentPlayer === 'WHITE' ? BOARD_SIZE - 120 : 120 
      },
      vel: { 
        x: Math.cos(angle) * power, 
        y: Math.sin(angle) * power 
      },
      radius: STRIKER_RADIUS,
      mass: 2,
      pocketed: false,
      color: COLORS.STRIKER
    };

    setGameState(prev => {
      if (!prev) return null;
      return {
        ...prev,
        pieces: [...prev.pieces, striker],
        turnPhase: 'STRIKING'
      };
    });
    setIsStrikerDragging(false);
  };

  const gameLoop = useCallback(() => {
    if (!gameState || gameState.turnPhase === 'AIMING' || gameState.turnPhase === 'POCKET_ANIMATION') {
      draw();
      requestRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const updatedPieces = updatePhysics([...gameState.pieces]);
    const staticNow = isStatic(updatedPieces);

    if (staticNow) {
      // Process end of turn
      processTurnEnd(updatedPieces);
    } else {
      setGameState(prev => prev ? { ...prev, pieces: [...updatedPieces] } : null);
      draw();
      requestRef.current = requestAnimationFrame(gameLoop);
    }
  }, [gameState]);

  const processTurnEnd = (pieces: Piece[]) => {
    if (!gameState) return;

    const currentStriker = pieces.find(p => p.type === 'STRIKER');
    const pocketedThisTurn = pieces.filter(p => p.pocketed && !gameState.pieces.find(oldP => oldP.id === p.id && oldP.pocketed));
    
    let scores = { ...gameState.scores };
    let queenPocketed = gameState.queenPocketed;
    let turnKept = false;
    let foul = false;

    // Remove striker from pieces
    const remainingPieces = pieces.filter(p => p.type !== 'STRIKER');

    pocketedThisTurn.forEach(p => {
      if (p.type === 'STRIKER') {
        foul = true;
        scores[gameState.currentPlayer] = Math.max(0, scores[gameState.currentPlayer] - 10);
      } else if (p.type === 'QUEEN') {
        queenPocketed = true;
        turnKept = true;
      } else if (p.type === gameState.currentPlayer) {
        scores[gameState.currentPlayer] += 20;
        turnKept = true;
      } else {
        // Pocketed opponent's coin
        const other = gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
        scores[other] += 20;
      }
    });

    if (foul) turnKept = false;

    // Check win condition
    const coinsLeft = remainingPieces.filter(p => !p.pocketed && p.type !== 'QUEEN').length;
    let winner = null;
    if (coinsLeft === 0) {
      winner = scores.WHITE > scores.BLACK ? 'WHITE' : 'BLACK';
    }

    const nextPlayer = turnKept ? gameState.currentPlayer : (gameState.currentPlayer === 'WHITE' ? 'BLACK' : 'WHITE');

    setGameState(prev => {
      if (!prev) return null;
      return {
        ...prev,
        pieces: remainingPieces,
        scores,
        queenPocketed,
        currentPlayer: nextPlayer,
        turnPhase: winner ? 'WAITING' : 'AIMING',
        winner,
        isAiTurn: prev.mode === 'PVA' && nextPlayer === 'BLACK'
      } as GameState;
    });

    setStrikerX(BOARD_SIZE / 2);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameLoop]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // Draw Board
    ctx.fillStyle = COLORS.BOARD_INNER;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    
    // Draw wood grain simulation (optional but looks nice)
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    for(let i=0; i<BOARD_SIZE; i+=10) {
      ctx.beginPath();
      ctx.moveTo(i + Math.random()*5, 0);
      ctx.lineTo(i + Math.random()*5, BOARD_SIZE);
      ctx.stroke();
    }

    // Border (Outer frame)
    ctx.strokeStyle = COLORS.LINES;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, BOARD_SIZE - 16, BOARD_SIZE - 16);

    // Pockets
    POCKET_POSITIONS.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a1a';
      ctx.fill();
      ctx.strokeStyle = COLORS.LINES;
      ctx.lineWidth = 4;
      ctx.stroke();
    });

    // Center Patterns
    const center = BOARD_SIZE / 2;
    ctx.strokeStyle = `${COLORS.LINES}44`;
    ctx.lineWidth = 1;
    
    // Middle circle
    ctx.beginPath();
    ctx.arc(center, center, 64, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, Math.PI * 2);
    ctx.strokeStyle = `${COLORS.QUEEN}66`;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(center, center, 8, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.QUEEN;
    ctx.fill();

    // Striker lines
    ctx.strokeStyle = `${COLORS.LINES}66`;
    ctx.lineWidth = 2;
    const drawLinePair = (y: number) => {
      const startX = 100;
      const endX = BOARD_SIZE - 100;
      
      // Double lines
      ctx.beginPath();
      ctx.moveTo(startX, y - 10);
      ctx.lineTo(endX, y - 10);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(startX, y + 10);
      ctx.lineTo(endX, y + 10);
      ctx.stroke();
      
      // Circles at ends
      ctx.beginPath();
      ctx.arc(startX, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = `${COLORS.QUEEN}88`;
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(endX, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = `${COLORS.QUEEN}88`;
      ctx.fill();
    };
    drawLinePair(BOARD_SIZE - 120);
    drawLinePair(120);

    // Corner diagonal lines
    const cornerLine = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    ctx.lineWidth = 1;
    cornerLine(60, 60, 160, 160);
    cornerLine(BOARD_SIZE - 60, 60, BOARD_SIZE - 160, 160);
    cornerLine(60, BOARD_SIZE - 60, 160, BOARD_SIZE - 160);
    cornerLine(BOARD_SIZE - 60, BOARD_SIZE - 60, BOARD_SIZE - 160, BOARD_SIZE - 160);

    // Pieces
    if (gameState) {
      gameState.pieces.filter(p => !p.pocketed).forEach(p => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
        
        // Piece Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        
        ctx.fillStyle = p.color;
        ctx.fill();
        
        // Piece Border
        ctx.strokeStyle = p.type === 'BLACK' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Piece Detail Circle
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
      });

      // Draw Striker Preview (Aiming)
      if (gameState.turnPhase === 'AIMING') {
        const sy = gameState.currentPlayer === 'WHITE' ? BOARD_SIZE - 120 : 120;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(strikerX, sy, STRIKER_RADIUS, 0, Math.PI * 2);
        
        // Golden Gradient for Striker
        const grad = ctx.createLinearGradient(strikerX - STRIKER_RADIUS, sy - STRIKER_RADIUS, strikerX + STRIKER_RADIUS, sy + STRIKER_RADIUS);
        grad.addColorStop(0, '#B8860B');
        grad.addColorStop(1, '#FFD700');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.restore();

        if (isStrikerDragging) {
          const dx = dragStart.x - dragEnd.x;
          const dy = dragStart.y - dragEnd.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 150;
          const limitedDist = Math.min(dist, maxDist);
          const angle = Math.atan2(dy, dx);

          // Aim line (Vector line from Design)
          ctx.beginPath();
          ctx.moveTo(strikerX, sy);
          ctx.lineTo(strikerX + Math.cos(angle) * (limitedDist * 2), sy + Math.sin(angle) * (limitedDist * 2));
          const lineGrad = ctx.createLinearGradient(strikerX, sy, strikerX + Math.cos(angle) * 100, sy + Math.sin(angle) * 100);
          lineGrad.addColorStop(0, '#FFD700');
          lineGrad.addColorStop(1, 'transparent');
          ctx.strokeStyle = lineGrad;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Pull back line
          ctx.beginPath();
          ctx.moveTo(strikerX, sy);
          ctx.lineTo(strikerX - Math.cos(angle) * (limitedDist / 2), sy - Math.sin(angle) * (limitedDist / 2));
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.setLineDash([2, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!gameState || gameState.turnPhase !== 'AIMING' || gameState.isAiTurn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    const sy = gameState.currentPlayer === 'WHITE' ? BOARD_SIZE - 120 : 120;
    if (Math.abs(y - sy) < 40) {
      if (Math.abs(x - strikerX) < 40) {
        setIsStrikerDragging(true);
        setDragStart({ x, y });
        setDragEnd({ x, y });
      } else {
        // Move striker along the line
        if (x > 100 && x < BOARD_SIZE - 100) {
          setStrikerX(x);
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isStrikerDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    setDragEnd({ x, y });
  };

  const handleMouseUp = () => {
    if (isStrikerDragging) {
      handleShoot();
    }
  };

  // Simple AI logic
  useEffect(() => {
    if (gameState?.isAiTurn && gameState.turnPhase === 'AIMING') {
      setTimeout(() => {
        // Select a piece to aim at
        const targets = gameState.pieces.filter(p => !p.pocketed && p.type !== 'STRIKER');
        if (targets.length === 0) return;
        const target = targets[Math.floor(Math.random() * targets.length)];
        
        // Aim at target
        const sy = 120; // AI is Black (top)
        const sx = 100 + Math.random() * (BOARD_SIZE - 200);
        setStrikerX(sx);
        
        const dx = target.pos.x - sx;
        const dy = target.pos.y - sy;
        const angle = Math.atan2(dy, dx);
        const power = 10 + Math.random() * 5;

        const striker: Piece = {
          id: 'striker',
          type: 'STRIKER',
          pos: { x: sx, y: sy },
          vel: { x: Math.cos(angle) * power, y: Math.sin(angle) * power },
          radius: STRIKER_RADIUS,
          mass: 2,
          pocketed: false,
          color: COLORS.STRIKER
        };

        setGameState(prev => prev ? { ...prev, pieces: [...prev.pieces, striker], turnPhase: 'STRIKING' } : null);
      }, 1500);
    }
  }, [gameState?.isAiTurn, gameState?.turnPhase]);

  return (
    <div className="min-h-screen h-full w-full bg-[#2C1B0E] text-white flex flex-col font-sans select-none overflow-hidden">
      <AnimatePresence mode="wait">
        {!gameState ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <motion.div 
              key="start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center space-y-12 max-w-md w-full bg-black/20 p-12 rounded-[40px] shadow-2xl border border-white/5 backdrop-blur-xl"
            >
              <div className="space-y-4">
                <div className="w-24 h-24 mx-auto bg-gradient-to-tr from-[#B8860B] to-[#FFD700] rounded-3xl shadow-2xl flex items-center justify-center transform rotate-6 hover:rotate-0 transition-transform duration-500">
                  <div className="w-16 h-16 rounded-full border-4 border-white/20 flex items-center justify-center bg-black/10">
                    <div className="w-10 h-10 rounded-full border-2 border-white/30" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-5xl font-display font-black tracking-tighter text-[#FFD700]">QUICK CARROM</h1>
                  <span className="text-[#B8860B] text-xs font-bold tracking-[0.3em] uppercase mt-1">Championship Edition</span>
                </div>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={() => startNewGame('PVP')}
                  className="w-full group flex items-center justify-between p-6 bg-white/5 hover:bg-[#B8860B] hover:text-black rounded-2xl transition-all border border-white/10 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-xl group-hover:bg-black/10">
                      <Users size={24} />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-lg">Play Local</div>
                      <div className="text-xs opacity-60">2 Players on same screen</div>
                    </div>
                  </div>
                  <ChevronRight />
                </button>

                <button 
                  onClick={() => startNewGame('PVA')}
                  className="w-full group flex items-center justify-between p-6 bg-white/5 hover:bg-[#B8860B] hover:text-black rounded-2xl transition-all border border-white/10 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-xl group-hover:bg-black/10">
                      <User size={24} />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-lg">Vs AI</div>
                      <div className="text-xs opacity-60">Practice against computer</div>
                    </div>
                  </div>
                  <ChevronRight />
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-[10px] text-white/30 font-bold uppercase tracking-widest">
                <Info size={14} />
                <span>Drag to aim • pull back for power</span>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="flex flex-col h-full w-full">
            {/* Header */}
            <header className="h-20 flex items-center justify-between px-10 bg-black/20 border-b border-white/5">
              <div 
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => setGameState(null)}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#B8860B] to-[#FFD700] shadow-lg flex items-center justify-center transition-transform group-hover:scale-110">
                  <div className="w-6 h-6 border-2 border-white/30 rounded-full"></div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-white font-bold tracking-tighter text-xl leading-tight">QUICK CARROM</h1>
                  <span className="text-[#B8860B] text-[10px] font-bold tracking-[0.2em] uppercase">Championship Edition</span>
                </div>
              </div>

              <div className="flex items-center gap-12">
                <div className="flex flex-col items-center">
                  <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">Player 1</span>
                  <span className="text-3xl font-display font-black text-white leading-none tracking-tighter">
                    {gameState.scores.WHITE.toString().padStart(3, '0')}
                  </span>
                </div>
                <div className="h-8 w-px bg-white/10"></div>
                <div className={`flex flex-col items-center ${gameState.mode === 'PVA' ? 'opacity-100' : 'opacity-100'}`}>
                  <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">
                    {gameState.mode === 'PVA' ? 'CPU (Medium)' : 'Player 2'}
                  </span>
                  <span className="text-3xl font-display font-black text-white leading-none tracking-tighter">
                    {gameState.scores.BLACK.toString().padStart(3, '0')}
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => startNewGame(gameState.mode)}
                  className="px-6 py-2 bg-white/5 border border-white/10 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                >
                  Restart
                </button>
                <button 
                  onClick={() => setGameState(null)}
                  className="px-6 py-2 bg-[#B8860B] text-black rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#FFD700] transition-colors"
                >
                  Quit Match
                </button>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center relative overflow-hidden">
              {/* Gameplay Info Panel - Left (Desktop) */}
              <div className="absolute left-10 top-1/2 -translate-y-1/2 w-48 flex flex-col gap-4 hidden xl:flex">
                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                  <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Board Texture</span>
                  <div className="w-full h-24 bg-[#3E2723] rounded-xl mt-2 relative overflow-hidden border border-white/5 opacity-50">
                    <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 10px)' }}></div>
                  </div>
                </div>
                <div className="p-5 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
                   <div className="flex flex-col items-center gap-2">
                      <Trophy size={20} className="text-[#FFD700]" />
                      <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Active Match</div>
                      <div className="text-xs font-mono text-white/60">00:15:32</div>
                   </div>
                </div>
              </div>

              {/* Game Board Container */}
              <div className="relative group">
                <canvas
                  ref={canvasRef}
                  width={BOARD_SIZE}
                  height={BOARD_SIZE}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onTouchStart={handleMouseDown}
                  onTouchMove={handleMouseMove}
                  onTouchEnd={handleMouseUp}
                  className="rounded-sm shadow-[0_40px_100px_rgba(0,0,0,0.8)] cursor-crosshair max-w-[90vw] max-h-[70vh] xl:max-w-none xl:max-h-none h-auto border-[16px] border-[#3E2723] ring-1 ring-[#5D4037]"
                />

                {/* Turn Indicator Overlay */}
                <AnimatePresence>
                  {gameState.turnPhase === 'AIMING' && !gameState.isAiTurn && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 px-6 py-2 bg-[#B8860B] text-black rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl"
                    >
                      <div className="w-2 h-2 rounded-full bg-black animate-pulse" />
                      {gameState.currentPlayer}'s Turn
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right Sidebar */}
              <div className="absolute right-10 top-1/2 -translate-y-1/2 w-56 flex flex-col gap-4 hidden lg:flex">
                <div className="p-5 bg-black/20 border border-white/5 rounded-2xl backdrop-blur-lg">
                  <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Turn Status</span>
                  <p className="text-white font-bold mt-1 text-sm flex items-center gap-2">
                    {gameState.turnPhase === 'AIMING' ? (
                      gameState.isAiTurn ? 'CPU is Thinking...' : 'Ready to Strike'
                    ) : (
                      'Pieces in Motion...'
                    )}
                  </p>
                </div>

                <div className="p-5 bg-black/20 border border-white/5 rounded-2xl backdrop-blur-lg">
                  <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Power Meter</span>
                  <div className="h-2 w-full bg-white/5 rounded-full mt-3 overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-[#B8860B] to-[#FFD700]" 
                      initial={{ width: 0 }}
                      animate={{ 
                        width: isStrikerDragging 
                          ? `${Math.min(Math.sqrt((dragStart.x - dragEnd.x)**2 + (dragStart.y - dragEnd.y)**2) / 1.5, 100)}%` 
                          : 0 
                      }}
                      transition={{ type: 'spring', damping: 20 }}
                    />
                  </div>
                </div>

                <div className="p-5 bg-black/20 border border-white/5 rounded-2xl backdrop-blur-lg overflow-hidden">
                  <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Match Details</span>
                  <div className="space-y-2 mt-3 text-[11px] font-mono">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/40">Mode</span>
                      <span className="text-[#FFD700] uppercase">{gameState.mode}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/40">Queen</span>
                      <span className={gameState.queenPocketed ? 'text-green-500' : 'text-white/20'}>
                        {gameState.queenPocketed ? 'CLAIMED' : 'PENDING'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </main>

            {/* Footer */}
            <footer className="h-12 bg-black/40 border-t border-white/5 flex items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#B8860B] animate-pulse"></div>
                <span className="text-white/30 text-[9px] uppercase tracking-[0.2em] font-bold">Quick Carrom Engine v1.0.4</span>
              </div>
              <div className="w-px h-3 bg-white/5"></div>
              <div className="flex items-center gap-2">
                <span className="text-white/30 text-[9px] uppercase tracking-[0.2em] font-bold">Physics: Stable</span>
              </div>
            </footer>
          </div>
        )}
      </AnimatePresence>

      {/* Win Modal */}
      <AnimatePresence>
        {gameState?.winner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#2a2d35] p-8 rounded-3xl max-w-sm w-full text-center space-y-6 border border-[#ffd700]/30 shadow-[0_0_50px_rgba(255,215,0,0.2)]"
            >
              <div className="w-20 h-20 mx-auto bg-[#ffd700] rounded-full flex items-center justify-center text-[#5d3a1a] shadow-lg shadow-yellow-500/20">
                <Trophy size={40} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">{gameState.winner === 'WHITE' ? 'PLAYER 1' : (gameState.mode === 'PVA' ? 'AI' : 'PLAYER 2')} WINS!</h2>
                <p className="text-gray-400">Final Score: {gameState.scores[gameState.winner]}</p>
              </div>
              <button 
                onClick={() => startNewGame(gameState.mode)}
                className="w-full py-4 bg-[#ffd700] text-[#5d3a1a] rounded-xl font-bold text-lg hover:bg-[#ffed4a] transition-colors shadow-lg shadow-yellow-500/10"
              >
                PLAY AGAIN
              </button>
              <button 
                onClick={() => setGameState(null)}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all"
              >
                MAIN MENU
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
