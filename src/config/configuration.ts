import { validateEnv } from "./env.schema";

export function configuration() {
  return validateEnv(process.env);
}
