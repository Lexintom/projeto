import { describe, it, expect } from "bun:test";
import { computePayloadHash } from "../../src/application/payload-hash";
import { validateEnv } from "../../src/config/env.schema";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SubmitTransactionDto } from "../../src/infrastructure/http/dtos";

describe("Correções da revisão", () => {
  it("o hash inclui valor e moeda dentro de money", () => {
    const a = { money: { amount: "10.00", currency: "BRL" } };
    expect(computePayloadHash(a)).not.toBe(
      computePayloadHash({ money: { amount: "20.00", currency: "BRL" } }),
    );
    expect(computePayloadHash(a)).not.toBe(
      computePayloadHash({ money: { amount: "10.00", currency: "USD" } }),
    );
  });
  it("a ordem das chaves não altera o hash", () => {
    expect(
      computePayloadHash({ a: 1, money: { amount: "10.00", currency: "BRL" } }),
    ).toBe(
      computePayloadHash({ money: { currency: "BRL", amount: "10.00" }, a: 1 }),
    );
  });
  it("false no .env continua sendo false", () => {
    const config = validateEnv({
      AUTH_ENABLED: "false",
      DATABASE_SSL: "false",
      LOG_PRETTY: "false",
    });
    expect(config.AUTH_ENABLED).toBe(false);
    expect(config.DATABASE_SSL).toBe(false);
    expect(config.LOG_PRETTY).toBe(false);
  });
  it("recusa payload sem money e com tipo de operação inválido", async () => {
    const dto = plainToInstance(SubmitTransactionDto, { kind: "OTHER" });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "money")).toBe(true);
    expect(errors.some((error) => error.property === "kind")).toBe(true);
  });
});
