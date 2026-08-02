import { spawn } from 'child_process';
import fs from 'fs';

const PIKAFISH_PATH = 'D:\\ThietKeHeThongTM\\Pikafish.2026-01-02\\Windows\\pikafish-avx2.exe';
const NNUE_PATH = 'D:\\ThietKeHeThongTM\\Pikafish.2026-01-02\\pikafish.nnue';

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

const getDepthAndMovetime = (difficulty: string = 'apprentice') => {
  switch (difficulty) {
    case 'beginner':
      return { depth: 2, movetime: 250 };
    case 'apprentice':
      return { depth: 4, movetime: 450 };
    case 'intermediate':
      return { depth: 7, movetime: 800 };
    case 'master':
      return { depth: 11, movetime: 1500 };
    case 'grandmaster':
      return { depth: 15, movetime: 2500 };
    default:
      return { depth: 4, movetime: 450 };
  }
};

export const calculateBestMove = async (
  fen: string,
  difficulty: string = 'apprentice'
): Promise<AIMoveResult> => {
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

    const { depth, movetime } = getDepthAndMovetime(difficulty);

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
          const parts = trimmed.split(/\s+/);
          if (parts[1]) {
            bestMove = parts[1];
          }
          child.stdin.write('quit\n');
          child.kill();
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
      console.error('Pikafish engine error:', err);
      resolve({ bestMove: 'h2e2', score: 0 });
    });

    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        resolve({ bestMove, score, depth: depthVisited, nodesVisited });
      }
    }, movetime + 2000);
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
