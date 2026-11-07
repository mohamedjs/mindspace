import * as yup from 'yup';

export const healthResponseSchema = yup.object({
  status: yup.string().required(),
  postgres: yup.string().optional(),
  redis: yup.string().optional(),
});

export type HealthResponse = yup.InferType<typeof healthResponseSchema>;

export const errorResponseSchema = yup.object({
  error: yup.string().required(),
  message: yup.string().required(),
});

export type ErrorResponse = yup.InferType<typeof errorResponseSchema>;
