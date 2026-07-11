import Joi from "joi";

const passwordSchema = Joi.string()
  .min(6)
  .max(128)
  .pattern(/[a-z]/, "lowercase")
  .pattern(/[A-Z]/, "uppercase")
  .pattern(/[0-9]/, "number")
  .required();

export const bootstrapAdminSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: passwordSchema,
});

export const loginAdminSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(6).max(128).required(),
});

export const forgotPasswordSendOtpSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

export const forgotPasswordVerifyOtpSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  otp: Joi.string().trim().pattern(/^\d{4}$/).required(),
});

export const forgotPasswordResetSchema = Joi.object({
  resetToken: Joi.string().trim().required(),
  newPassword: Joi.string()
    .min(10)
    .max(128)
    .pattern(/[a-z]/, "lowercase")
    .pattern(/[A-Z]/, "uppercase")
    .pattern(/[0-9]/, "number")
    .required(),
});

export function validateSchema(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (!error) return value;
  const err = new Error(error.details.map((item) => item.message).join("; "));
  err.statusCode = 400;
  throw err;
}
