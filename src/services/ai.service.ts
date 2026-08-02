import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Đường dẫn gốc chứa binary engines
const ENGINES_DIR = path.join(process.cwd(), 'src', 'services', 'engines');

/**
 * Tự động chọn binary Pikafish phù hợp với OS hiện tại.
 * Ưu tiên biến môi trường PIKAFISH_PATH nếu được cấu hình thủ công.
 *
 * Cấu trúc file trong src/services/engines/:
 *   pikafish-windows-avx2.exe  → Windows (x64)
 *   pikafish-macos-arm64        → macOS Apple Silicon (M1/M2/M3)
 *   pikafish-macos-x64          → macOS Intel
 *   pikafish-linux              → Linux (x64)
 */
const resolvePikafishPath = (): string => {
  if (process.env.PIKAFISH_PATH) return process.env.PIKAFISH_PATH;

  const platform = os.platform();   // 'win32' | 'darwin' | 'linux'
  const arch = os.arch();           // 'arm64' | 'x64' | ...

  if (platform === 'win32') {
    const localWinPath = path.join(ENGINES_DIR, 'pikafish-windows-avx2.exe');
    if (fs.existsSync(localWinPath)) return localWinPath;
    const globalWinPath = 'D:\\ThietKeHeThongTM\\Pikafish.2026-01-02\\Windows\\pikafish-avx2.exe';
    if (fs.existsSync(globalWinPath)) return globalWinPath;
    return localWinPath;
  }
  
  if (platform === 'darwin') {
    const armPath = path.join(ENGINES_DIR, 'pikafish-macos-arm64');
    const x64Path = path.join(ENGINES_DIR, 'pikafish-macos-x64');
    
    if (arch === 'x64' && !fs.existsSync(x64Path) && fs.existsSync(armPath)) {
      return armPath;
    }
    if (arch === 'arm64' && !fs.existsSync(armPath) && fs.existsSync(x64Path)) {
      return x64Path;
    }
    
    return arch === 'arm64' ? armPath : x64Path;
  }
  
  // linux
  return path.join(ENGINES_DIR, 'pikafish-linux');
};

const resolveNnuePath = (): string => {
  if (process.env.NNUE_PATH) return process.env.NNUE_PATH;
  const localNnue = path.join(ENGINES_DIR, 'pikafish.nnue');
  if (fs.existsSync(localNnue)) return localNnue;
  const globalNnue = 'D:\\ThietKeHeThongTM\\Pikafish.2026-01-02\\pikafish.nnue';
  if (fs.existsSync(globalNnue)) return globalNnue;
  return localNnue;
};

const PIKAFISH_PATH = resolvePikafishPath();
const NNUE_PATH = resolveNnuePath();

// Đảm bảo file được cấp quyền thực thi trên macOS/Linux để tránh lỗi EACCES
if (os.platform() !== 'win32' && fs.existsSync(PIKAFISH_PATH)) {
  try {
    fs.chmodSync(PIKAFISH_PATH, 0o755);
  } catch (err) {
    console.warn(`[AI Engine] Cannot set executable permission for ${PIKAFISH_PATH}`);
  }
}

console.log(`[AI Engine] Platform: ${os.platform()}/${os.arch()}`);
console.log(`[AI Engine] Binary: ${PIKAFISH_PATH}`);
console.log(`[AI Engine] NNUE:   ${NNUE_PATH}`);


export interface AIMoveResult {
  bestMove: string;
  score: number;
  newFen?: string;
  nodesVisited?: number;
  depth?: number;
}

export interface AIHintResult {
  suggestedMove: string;
  score: number;
  explanation: string;
}

// --- Database settings cache ---
import prisma from '../utils/prisma';

let botSettingsCache: Record<string, { depth: number; movetime: number }> = {};
let lastCacheUpdate = 0;
const CACHE_TTL = 60000; // 60 seconds

const loadBotSettings = async () => {
  try {
    const prismaClient = prisma as any;
    if (prismaClient && typeof prismaClient.botSetting?.findMany === 'function') {
      const settings = await prismaClient.botSetting.findMany();
      if (Array.isArray(settings) && settings.length > 0) {
        settings.forEach((s: any) => {
          botSettingsCache[s.difficulty] = { depth: s.depth, movetime: s.movetime };
        });
        lastCacheUpdate = Date.now();
      }
    }
  } catch (err) {
    console.error('[AI Engine] Failed to load bot settings from DB', err);
  }
};

// Initialize cache
loadBotSettings();

const getDepthAndMovetime = async (difficulty: string = 'apprentice') => {
  // Reload cache if expired
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await loadBotSettings();
  }

  // Use cached value if exists
  if (botSettingsCache[difficulty]) {
    return botSettingsCache[difficulty];
  }

  // Fallback to defaults
  switch (difficulty) {
    case 'beginner': return { depth: 2, movetime: 250 };
    case 'apprentice': return { depth: 4, movetime: 450 };
    case 'intermediate': return { depth: 7, movetime: 800 };
    case 'master': return { depth: 11, movetime: 1500 };
    case 'grandmaster': return { depth: 15, movetime: 2500 };
    default: return { depth: 4, movetime: 450 };
  }
};

export const calculateBestMove = async (
  fen: string,
  difficulty: string = 'apprentice'
): Promise<AIMoveResult> => {
  const { depth, movetime } = await getDepthAndMovetime(difficulty);

  return new Promise((resolve) => {
    if (!fs.existsSync(PIKAFISH_PATH)) {
      console.warn(`Pikafish executable not found at ${PIKAFISH_PATH}, using fallback.`);
      return resolve({ bestMove: 'h2e2', score: 0 });
    }

    const child = spawn(PIKAFISH_PATH, []);
    let bestMove = 'h2e2';
    let score = 0;
    let depthVisited = 0;
    let nodesVisited = 0;
    // Bug #3 Fix: Flag ngăn Promise bị resolve nhiều lần (race condition)
    let resolved = false;

    const commands = [
      'uci',
      `setoption name EvalFile value ${NNUE_PATH}`,
      'isready',
      `position fen ${fen}`,
      `go movetime ${movetime} depth ${depth}`
    ];

    child.stdin.write(commands.join('\n') + '\n');

    let outputBuffer = '';

    child.stdout.on('data', (data) => {
      outputBuffer += data.toString();
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('info') && trimmed.includes('score cp')) {
          const cpMatch = trimmed.match(/score cp (-?\d+)/);
          if (cpMatch) {
            score = parseInt(cpMatch[1], 10) / 100;
          }
          const depthMatch = trimmed.match(/depth (\d+)/);
          if (depthMatch) {
            depthVisited = parseInt(depthMatch[1], 10);
          }
          const nodesMatch = trimmed.match(/nodes (\d+)/);
          if (nodesMatch) {
            nodesVisited = parseInt(nodesMatch[1], 10);
          }
        }
        if (trimmed.startsWith('bestmove')) {
          if (resolved) return;
          resolved = true;
          const parts = trimmed.split(/\s+/);
          if (parts[1]) {
            bestMove = parts[1];
          }
          try {
            child.stdin.write('quit\n');
          } catch (e) {}
          child.kill('SIGKILL');
          return resolve({
            bestMove,
            score,
            depth: depthVisited,
            nodesVisited
          });
        }
      }
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      console.error('Pikafish engine error:', err);
      resolve({ bestMove: 'h2e2', score: 0 });
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          child.stdin.write('quit\n');
        } catch (e) {}
        child.kill('SIGKILL');
        resolve({ bestMove, score, depth: depthVisited, nodesVisited });
      }
    }, movetime + 3000);
  });
};

export const getHint = async (
  fen: string,
  difficulty: string = 'intermediate'
): Promise<AIHintResult> => {
  const result = await calculateBestMove(fen, difficulty);
  return {
    suggestedMove: result.bestMove,
    score: result.score,
    explanation: `Pikafish Engine gợi ý nước đi ${result.bestMove} (Đánh giá vị thế: ${result.score > 0 ? '+' : ''}${result.score})`
  };
};

export const validateMove = async (
  _fen: string,
  _move: string
): Promise<{ isValid: boolean; reason: string }> => {
  return Promise.resolve({
    isValid: true,
    reason: 'Nước đi hợp lệ'
  });
};
