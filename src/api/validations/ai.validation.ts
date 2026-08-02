import { z } from 'zod';

const FEN_REGEX = /^[a-zA-Z0-9\/\s\+\-]+$/;
const MOVE_REGEX = /^[a-i][0-9][a-i][0-9]$/;

export const aiValidation = {
  fenSchema: z.object({
    body: z.object({
      fen: z
        .string()
        .min(1, 'Chuỗi FEN không được để trống')
        .max(200, 'Chuỗi FEN không hợp lệ (quá dài)')
        .regex(FEN_REGEX, 'Chuỗi FEN chứa ký tự không hợp lệ'),
      difficulty: z.string().optional()
    })
  }),

  moveSchema: z.object({
    body: z.object({
      fen: z
        .string()
        .min(1, 'Chuỗi FEN không được để trống')
        .max(200, 'Chuỗi FEN không hợp lệ (quá dài)')
        .regex(FEN_REGEX, 'Chuỗi FEN chứa ký tự không hợp lệ'),
      move: z
        .string()
        .min(4, 'Nước đi phải đủ 4 ký tự (ví dụ: h2e2)')
        .max(4, 'Nước đi không được dài hơn 4 ký tự')
        .regex(MOVE_REGEX, 'Nước đi không đúng định dạng (ví dụ hợp lệ: h2e2, a0b1)')
        .optional(),
      difficulty: z.string().optional()
    })
  })
};
