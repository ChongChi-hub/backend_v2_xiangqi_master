import { z } from 'zod';

export const authValidation = {
  loginSchema: z.object({
    body: z.object({
      email: z
        .string()
        .email('Email không đúng định dạng')
        .max(254, 'Email không được vượt quá 254 ký tự')
        .optional(),
      username: z
        .string()
        .min(3, 'Tên người dùng phải có ít nhất 3 ký tự')
        .max(50, 'Tên người dùng không được vượt quá 50 ký tự')
        .optional(),
      password: z
        .string()
        .min(6, 'Mật khẩu phải có ít nhất 6 ký tự')
        .max(128, 'Mật khẩu không được vượt quá 128 ký tự')
    }).refine(data => data.email || data.username, {
      message: 'Vui lòng cung cấp email hoặc tên người dùng',
      path: ['username']
    })
  }),

  registerSchema: z.object({
    body: z.object({
      email: z
        .string()
        .min(1, 'Email không được để trống')
        .email('Email không đúng định dạng')
        .max(254, 'Email không được vượt quá 254 ký tự')
        .trim(),
      username: z
        .string()
        .min(3, 'Tên người dùng phải có ít nhất 3 ký tự')
        .max(30, 'Tên người dùng không được vượt quá 30 ký tự')
        .regex(
          /^[a-zA-Z0-9_]+$/,
          'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới (_)'
        )
        .trim(),
      password: z
        .string()
        .min(6, 'Mật khẩu phải có ít nhất 6 ký tự')
        .max(128, 'Mật khẩu không được vượt quá 128 ký tự')
        .regex(
          /^(?=.*[a-zA-Z])(?=.*\d)/,
          'Mật khẩu phải chứa ít nhất một chữ cái và một chữ số'
        )
    })
  })
};

