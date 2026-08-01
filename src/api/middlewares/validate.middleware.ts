import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';

export const validate = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Trả về danh sách lỗi chi tiết theo từng trường để Frontend dễ hiển thị
        const errors = error.issues.map(issue => ({
          field: issue.path.slice(1).join('.'), // Bỏ prefix 'body'/'query'/'params'
          message: issue.message
        }));
        // Lấy message đầu tiên làm tóm tắt lỗi chính
        const summary = errors.map(e => e.message).join(', ');
        res.status(400).json({
          error: summary,
          errors
        });
        return;
      }
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', errors: [] });
    }
  };
};
