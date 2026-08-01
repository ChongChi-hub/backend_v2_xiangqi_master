import { z } from 'zod';

export const userValidation = {
  leaderboardSchema: z.object({
    query: z.object({
      page: z
        .string()
        .optional()
        .refine(val => !val || (!isNaN(Number(val)) && Number(val) >= 1), {
          message: 'Số trang phải là số nguyên dương (ít nhất là 1)'
        }),
      limit: z
        .string()
        .optional()
        .refine(val => !val || (!isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= 100), {
          message: 'Số lượng mỗi trang phải từ 1 đến 100'
        })
    })
  })
};
