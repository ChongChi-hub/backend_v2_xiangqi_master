import { Request, Response } from 'express';
import * as aiService from '../../services/ai.service';

export const getAIMove = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fen } = req.body;

    const result = await aiService.calculateBestMove(fen);
    
    res.status(200).json({
      bestMove: result.bestMove,
      evaluationScore: result.score,
      newFen: result.newFen,
      nodesVisited: 15000 // Mock data
    });
  } catch (error) {
    console.error('AI Move Error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const getAIHint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fen } = req.body;

    const result = await aiService.getHint(fen);

    res.status(200).json({
      suggestedMove: result.suggestedMove,
      score: result.score,
      explanation: result.explanation
    });
  } catch (error) {
    console.error('AI Hint Error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const validateAIMove = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fen, move } = req.body;

    const result = await aiService.validateMove(fen, move);

    res.status(200).json(result);
  } catch (error) {
    console.error('AI Validate Error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};
